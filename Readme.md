

<p align="center">
	<img src="frontend/shortly-link/public/vite.svg" width="80" alt="Shortly Logo" />
</p>

# 🚀 Shortly Link Platform

![Build](https://img.shields.io/badge/build-passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-green)

> ระบบย่อและจัดการลิงก์ (URL Shortener) สำหรับองค์กรและบุคคลทั่วไป  
> พัฒนาโดยใช้ Go (Backend) และ React + Vite (Frontend)

---

## 📚 สารบัญ (Table of Contents)
- [✨ ฟีเจอร์เด่น](#-ฟีเจอร์เด่น)
- [🖼️ ตัวอย่างหน้าจอ](#️-ตัวอย่างหน้าจอ)
- [⚡ Tech Stack](#-tech-stack)
- [📁 โครงสร้างโปรเจกต์](#-โครงสร้างโปรเจกต์)
- [🛠️ วิธีติดตั้ง](#️-วิธีติดตั้ง)
- [🚦 วิธีใช้งาน](#-วิธีใช้งาน)
- [🔌 API Documentation](#-api-documentation)
- [🌱 Contributing](#-contributing)
- [📝 License](#-license)
- [🗺️ Roadmap](#️-roadmap)

---

## ✨ ฟีเจอร์เด่น
- 🔗 ย่อ URL ได้อย่างรวดเร็วและปลอดภัย
- 📊 Dashboard แสดงสถิติการคลิกแต่ละลิงก์
- 📝 ระบบจัดการลิงก์ (CRUD)
- 👤 รองรับผู้ใช้หลายคน (Authentication)
- 🕒 กำหนดวันหมดอายุของลิงก์ได้
- 📱 Responsive UI ใช้งานได้ทุกอุปกรณ์

---

## ⚡ Tech Stack

- **Backend:** Go 1.20+
- **Frontend:** React 18, Vite
- **Build Tools:** npm, Vite
- **Config:** dotenv

---

## 📁 โครงสร้างโปรเจกต์

```text
shortly-link/
├── backend/                # Go API Server
│   ├── main.go
│   ├── go.mod
│   └── .env
└── frontend/
		└── shortly-link/       # React + Vite App
				├── src/
				├── public/
				└── package.json
```

---

## 🛠️ วิธีติดตั้ง

### 1. Backend (Go)

```sh
# ติดตั้ง dependencies (ถ้ายังไม่มี)
cd backend
go mod tidy

# Build
go build

# Run (Windows)
./backend.exe
# หรือ (Linux/Mac)
./backend
```

### 2. Frontend (React + Vite)

```sh
cd frontend/shortly-link
# ติดตั้ง dependencies
npm install

# Build production
npm run build

# Development mode
npm run dev
```

---

## 🚦 วิธีใช้งาน

### 1. เรียก API เพื่อย่อ URL

```http
POST /api/shorten
Content-Type: application/json

{
	"url": "https://example.com"
}
```

### 2. ตัวอย่างการย่อ URL ด้วย curl

```sh
curl -X POST http://localhost:8080/api/shorten -H "Content-Type: application/json" -d '{"url":"https://example.com"}'
```

### 3. การใช้งาน Frontend

1. เปิดหน้าเว็บที่รันด้วย `npm run dev` หรือ deploy แล้ว
2. กรอก URL ที่ต้องการย่อ กดปุ่ม "ย่อเลย!"
3. คัดลอกลิงก์สั้นไปใช้งานได้ทันที

---

## 🔌 API Documentation

| Method | Endpoint         | Description         |
|--------|------------------|--------------------|
| POST   | /api/shorten     | สร้างลิงก์สั้น     |
| GET    | /:shortcode      | Redirect           |
| GET    | /api/stats/:id   | ดูสถิติ            |

> **หมายเหตุ:** สามารถดูรายละเอียดเพิ่มเติมในโค้ด backend/main.go

