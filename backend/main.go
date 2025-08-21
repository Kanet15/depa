package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/line/line-bot-sdk-go/v7/linebot"
	"golang.org/x/time/rate"
)

type LineBot struct {
	Client *linebot.Client
}

type FirebaseConfig struct {
	ApiKey            string `json:"apiKey"`
	AuthDomain        string `json:"authDomain"`
	ProjectId         string `json:"projectId"`
	StorageBucket     string `json:"storageBucket"`
	MessagingSenderId string `json:"messagingSenderId"`
	AppId             string `json:"appId"`
	MeasurementId     string `json:"measurementId"`
}

type BroadcastRequest struct {
	ImageURL        string `json:"image_url" binding:"required" example:"https://example.com/image.jpg"`
	PreviewImageURL string `json:"preview_image_url" binding:"required"`
	Message         string `json:"message" binding:"required" example:"มีคนใช้งานเกินเวลา"`
	Classroom       string `json:"classroom" binding:"required" example:"CS101"`
	OveruseTime     string `json:"overuse_time" binding:"required" example:"14:30"`
}

var (
	baseURLEnv    string
	globalLineBot *LineBot
)

func main() {
	// โหลด .env ครั้งเดียว (ถ้ามี) — non-fatal
	if err := godotenv.Load(); err != nil {
		log.Println("Warning: No .env file found or .env not loaded")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	baseURLEnv = os.Getenv("BASE_URL")
	channelSecret := os.Getenv("CHANNEL_SECRET")
	channelToken := os.Getenv("CHANNEL_TOKEN")

	if channelSecret == "" || channelToken == "" {
		log.Fatal("CHANNEL_SECRET and CHANNEL_TOKEN must be set in environment")
	}
	if baseURLEnv == "" {
		log.Println("Warning: BASE_URL not set. Generated image URLs will use request host.")
	}

	// สร้างโฟลเดอร์สำหรับเก็บไฟล์อัปโหลด
	if err := os.MkdirAll("./public/uploads", 0755); err != nil {
		log.Fatalf("Failed to create upload folder: %v", err)
	}

	// สร้าง LINE Bot client
	bot, err := linebot.New(channelSecret, channelToken)
	if err != nil {
		log.Fatal("Error creating LINE Bot client:", err)
	}
	globalLineBot = &LineBot{Client: bot}

	// สร้าง router
	r := gin.Default()

	// CORS configuration: อ่าน allowed origins จาก ENV (comma-separated) หรือใช้ default
	allowedOriginsEnv := os.Getenv("ALLOW_ORIGINS") // ex: "http://127.0.0.1:5500,http://localhost:3000"
	var allowOrigins []string
	if allowedOriginsEnv != "" {
		for _, o := range strings.Split(allowedOriginsEnv, ",") {
			o = strings.TrimSpace(o)
			if o != "" {
				allowOrigins = append(allowOrigins, o)
			}
		}
	}
	if len(allowOrigins) == 0 {
		// default development origin — ปรับให้ตรงกับที่คุณบริการหน้าเว็บ (หรือใส่หลายค่า)
		allowOrigins = []string{"http://127.0.0.1:5500", "http://localhost:5500"}
	}

	r.Use(cors.New(cors.Config{
		AllowOrigins:     allowOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "X-Requested-With"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// rate limiter middleware
	r.Use(rateLimitMiddleware())

	r.MaxMultipartMemory = 8 << 20 // 8 MB
	_ = r.SetTrustedProxies(nil)

	// Static files and routes
	r.Static("/static", "./static")
	r.GET("/", serveIndexHTML)

	// serve uploaded files (explicit handling to set content-type/cache-control)
	r.GET("/public/*filepath", serveStaticFile)
	r.HEAD("/public/*filepath", serveStaticFile)

	// API routes
	r.GET("/health", healthCheck)
	r.GET("/firebase-config", firebaseConfig)
	r.POST("/webhook", globalLineBot.webhookHandler)
	r.POST("/broadcast", globalLineBot.broadcastHandler)
	r.POST("/api/record", imagefromClientAndBroadcast)

	log.Printf("🚀 Server starting on port %s", port)
	log.Printf("📱 Web Interface: http://localhost:%s", port)
	if baseURLEnv != "" {
		log.Printf("🌐 Base URL: %s", baseURLEnv)
	} else {
		log.Printf("🌐 Base URL not set; will infer from request host")
	}

	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func serveIndexHTML(c *gin.Context) {
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.File("./static/index.html")
}

func healthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":    "healthy",
		"timestamp": time.Now().Format(time.RFC3339),
		"base_url":  baseURLEnv,
		"endpoints": []string{
			"GET / - Web Interface",
			"POST /api/record - อัปโหลดรูปภาพและส่ง broadcast",
			"POST /broadcast - ส่ง broadcast manual",
			"GET /health - Health check",
		},
	})
}

// firebaseConfig handler: ดึงค่าจาก ENV ที่ถูกโหลดตอนเริ่มต้น และส่งกลับเป็น JSON
func firebaseConfig(c *gin.Context) {
	apiKey := os.Getenv("FIREBASE_API_KEY")
	authDomain := os.Getenv("FIREBASE_AUTH_DOMAIN")
	projectId := os.Getenv("FIREBASE_PROJECT_ID")
	storageBucket := os.Getenv("FIREBASE_STORAGE_BUCKET")
	messagingSenderId := os.Getenv("FIREBASE_MESSAGING_SENDER_ID")
	appId := os.Getenv("FIREBASE_APP_ID")
	measurementId := os.Getenv("FIREBASE_MEASUREMENT_ID")

	if apiKey == "" || authDomain == "" || projectId == "" {
		log.Println("ERROR: Missing required Firebase environment variables.")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Server configuration is incomplete.",
		})
		return
	}

	config := FirebaseConfig{
		ApiKey:            apiKey,
		AuthDomain:        authDomain,
		ProjectId:         projectId,
		StorageBucket:     storageBucket,
		MessagingSenderId: messagingSenderId,
		AppId:             appId,
		MeasurementId:     measurementId,
	}

	c.JSON(http.StatusOK, config)
}

func imagefromClientAndBroadcast(c *gin.Context) {
	fileHeader, err := c.FormFile("image")
	if err != nil {
		log.Printf("Error getting file: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("ไม่พบไฟล์ image: %v", err),
		})
		return
	}

	timeStr := c.PostForm("time")
	classroom := c.PostForm("classroom")
	message := c.PostForm("message")

	if timeStr == "" {
		timeStr = time.Now().Format("15:04")
	}
	if classroom == "" {
		classroom = "ห้องเรียน"
	}
	if message == "" {
		message = "มีคนใช้งานเกินเวลา"
	}

	log.Printf("📸 Received: file=%s (%.1fKB), time=%s, classroom=%s, message=%s",
		fileHeader.Filename, float64(fileHeader.Size)/1024, timeStr, classroom, message)

	if fileHeader.Size > 10*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "ไฟล์ใหญ่เกินไป (เกิน 10MB)",
		})
		return
	}

	f, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("เปิดไฟล์ไม่ได้: %v", err),
		})
		return
	}
	defer f.Close()

	head := make([]byte, 512)
	n, _ := f.Read(head)
	contentType := http.DetectContentType(head[:n])

	allowed := map[string]string{
		"image/jpeg": ".jpg",
		"image/png":  ".png",
		"image/webp": ".webp",
	}
	ext, ok := allowed[contentType]
	if !ok {
		log.Printf("❌ Unsupported content type: %s", contentType)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("ชนิดไฟล์ไม่รองรับ: %s", contentType),
		})
		return
	}

	filename := fmt.Sprintf("cap_%s_%d%s",
		time.Now().Format("20060102_150405"),
		time.Now().UnixNano()%1e6,
		ext,
	)
	savePath := filepath.Join("public", "uploads", filename)

	if err := c.SaveUploadedFile(fileHeader, savePath); err != nil {
		log.Printf("❌ Error saving file: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("บันทึกไฟล์ไม่สำเร็จ: %v", err),
		})
		return
	}

	log.Printf("✅ File saved: %s", savePath)

	effectiveBaseURL := baseURLEnv
	if effectiveBaseURL == "" {
		scheme := "http"
		if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
			scheme = "https"
		}
		effectiveBaseURL = fmt.Sprintf("%s://%s", scheme, c.Request.Host)
	}

	imageURL := fmt.Sprintf("%s/public/uploads/%s", effectiveBaseURL, filename)
	log.Printf("🔗 Image URL: %s", imageURL)

	time.Sleep(100 * time.Millisecond)

	if err := testImageURL(imageURL); err != nil {
		log.Printf("⚠️ Image URL test failed: %v", err)
	} else {
		log.Printf("✅ Image URL accessible")
	}

	broadcastSuccess := sendBroadcastMessage(imageURL, message, classroom, timeStr)

	response := gin.H{
		"ok":             true,
		"image_url":      imageURL,
		"time":           timeStr,
		"classroom":      classroom,
		"message":        message,
		"filename":       filename,
		"broadcast_sent": broadcastSuccess,
		"file_size_kb":   float64(fileHeader.Size) / 1024,
	}

	if !broadcastSuccess {
		response["warning"] = "รูปภาพอัปโหลดสำเร็จ แต่ส่ง broadcast ไม่สำเร็จ"
		log.Printf("⚠️ Broadcast failed but image uploaded successfully")
	} else {
		log.Printf("🎉 Image uploaded and broadcast sent successfully")
	}

	c.JSON(http.StatusOK, response)
}

func sendBroadcastMessage(imageURL, message, classroom, overuseTime string) bool {
	if globalLineBot == nil {
		log.Printf("❌ LINE Bot not initialized")
		return false
	}

	now := time.Now()
	thaiDate := now.Format("02/01/2006")

	textMessage := fmt.Sprintf(`🚨 แจ้งเตือน: %s

🏫 สถานที่: %s
⏰ เวลา: %s
📅 วันที่: %s
━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 แจ้งเตือนอัตโนมัติจากระบบ`,
		message,
		classroom,
		overuseTime,
		thaiDate)

	messages := []linebot.SendingMessage{
		linebot.NewImageMessage(imageURL, imageURL),
		linebot.NewTextMessage(textMessage),
	}

	log.Printf("📤 Broadcasting %d messages", len(messages))

	maxRetries := 3
	var err error

	for i := 0; i < maxRetries; i++ {
		_, err = globalLineBot.Client.BroadcastMessage(messages...).Do()
		if err == nil {
			log.Printf("✅ Broadcast sent successfully on attempt %d", i+1)
			return true
		}

		log.Printf("❌ Broadcast attempt %d failed: %v", i+1, err)
		if i < maxRetries-1 {
			time.Sleep(time.Duration(i+1) * 2 * time.Second)
		}
	}

	log.Printf("❌ All broadcast attempts failed: %v", err)
	return false
}

func serveStaticFile(c *gin.Context) {
	requestPath := c.Param("filepath")
	fullPath := "./public" + requestPath

	fileInfo, err := os.Stat(fullPath)
	if os.IsNotExist(err) {
		log.Printf("❌ File not found: %s", fullPath)
		c.Status(http.StatusNotFound)
		return
	}

	ext := strings.ToLower(filepath.Ext(requestPath))
	var contentType string
	switch ext {
	case ".jpg", ".jpeg":
		contentType = "image/jpeg"
	case ".png":
		contentType = "image/png"
	case ".webp":
		contentType = "image/webp"
	default:
		contentType = "application/octet-stream"
	}

	c.Header("Content-Type", contentType)
	c.Header("Content-Length", fmt.Sprintf("%d", fileInfo.Size()))
	c.Header("Cache-Control", "public, max-age=3600")

	if c.Request.Method == "HEAD" {
		c.Status(http.StatusOK)
		return
	}

	c.File(fullPath)
}

func testImageURL(imageURL string) error {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Head(imageURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("status %d", resp.StatusCode)
	}
	return nil
}

func (lb *LineBot) webhookHandler(c *gin.Context) {
	events, err := lb.Client.ParseRequest(c.Request)
	if err != nil {
		log.Printf("❌ Webhook parse error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	for _, event := range events {
		log.Printf("📨 LINE Event: %s", event.Type)
		switch event.Type {
		case linebot.EventTypeMessage:
			switch message := event.Message.(type) {
			case *linebot.TextMessage:
				replyMessage := linebot.NewTextMessage("สวัสดี! รับข้อความแล้ว: " + message.Text)
				_, err = lb.Client.ReplyMessage(event.ReplyToken, replyMessage).Do()
				if err != nil {
					log.Printf(" Reply error: %v", err)
				}
			}
		case linebot.EventTypeFollow:
			welcomeMsg := linebot.NewTextMessage("ยินดีต้อนรับ! \nระบบพร้อมส่งการแจ้งเตือนให้คุณแล้ว")
			_, err = lb.Client.ReplyMessage(event.ReplyToken, welcomeMsg).Do()
			if err != nil {
				log.Printf(" Welcome message error: %v", err)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (lb *LineBot) broadcastHandler(c *gin.Context) {
	var req BroadcastRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request body",
			"details": err.Error(),
		})
		return
	}

	success := sendBroadcastMessage(req.ImageURL, req.Message, req.Classroom, req.OveruseTime)
	if success {
		c.JSON(http.StatusOK, gin.H{
			"status":  "success",
			"message": "Broadcast sent successfully",
		})
	} else {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to broadcast message",
		})
	}
}

func rateLimitMiddleware() gin.HandlerFunc {
	limiter := rate.NewLimiter(rate.Limit(10), 10)
	return func(c *gin.Context) {
		if !limiter.Allow() {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":   "Too many requests",
				"message": "Please wait before making another request",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}
