// ===================================================================
//  START: โค้ดเริ่มต้นการทำงาน (Entry Point)
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {
  // --- ส่วนที่ 1: โค้ดที่ทำงานร่วมกันทุกหน้า (COMMON CODE) ---
  
  // 1.1 ตรวจสอบการล็อกอิน
  if (!localStorage.getItem('adminName')) {
    // ป้องกันการ redirect วน loop ในหน้า login
    if (!window.location.pathname.endsWith('login.html')) {
        window.location.href = 'login.html';
    }
    return;
  }

  // 1.2 แสดงข้อมูลผู้ดูแลใน Sidebar
  const adminNameDisplay = document.getElementById('adminNameDisplay');
  if (adminNameDisplay) adminNameDisplay.textContent = localStorage.getItem('adminName') || '-';
  const adminPhoneDisplay = document.getElementById('adminPhoneDisplay');
  if (adminPhoneDisplay) adminPhoneDisplay.textContent = localStorage.getItem('adminPhone') || '-';
  const adminLineDisplay = document.getElementById('adminLineDisplay');
  if (adminLineDisplay) adminLineDisplay.textContent = localStorage.getItem('adminLine') || '-';

  // 1.3 ผูกปุ่ม Logout
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
    window.location.href = 'login.html';
  });


  // --- ส่วนที่ 2: รอ Firebase พร้อม แล้วค่อยทำงานตามแต่ละหน้า ---
  
  if (!window.firebaseReady) {
    console.error('Firebase init failed: window.firebaseReady not found');
    alert('ไม่สามารถเชื่อมต่อฐานข้อมูลได้');
    return;
  }

  window.firebaseReady
    .then(db => {
      // ✅ จุดสำคัญ: ตรวจสอบว่าอยู่หน้าไหน แล้วเรียกฟังก์ชันให้ถูก
      
      // ถ้าเจอ <div id="roomsContainer"> ให้ทำงานแบบ "หน้าแสดงผลห้อง"
      if (document.getElementById('roomsContainer')) {
        console.log("Running in Room Display Mode");
        startAppForRoomDisplay(db);
      }
      
      // ถ้าเจอ <tbody id="reportBody"> ให้ทำงานแบบ "หน้ารายงาน"
      else if (document.getElementById('reportBody')) {
        console.log("Running in Report Mode");
        loadReportData(db);
      }

      // ถ้าเจอ <button id="saveRoom"> ให้ทำงานแบบ "หน้าเพิ่มห้อง"
      else if (document.getElementById('saveRoom')) {
        console.log("Running in Add Room Form Mode");
        initializeAddRoomPage(db);
      }
      
    })
    .catch(err => {
      console.error('Firebase init failed:', err);
      alert('ไม่สามารถเชื่อมต่อ Firebase (ดู console)');
    });
});


// ===================================================================
//  ส่วนของ "หน้าแสดงห้อง" (main.html / room.html ที่มี list)
// ===================================================================
let roomsUnsubscribe = null;

async function startAppForRoomDisplay(db) {
  const roomsContainer = document.getElementById('roomsContainer');
  if (!roomsContainer) return;
  
  try {
    const query = db.collection('rooms').orderBy('createdAt', 'desc');
    if (roomsUnsubscribe) roomsUnsubscribe(); // ยกเลิก listener เก่าก่อน
    roomsUnsubscribe = query.onSnapshot(snapshot => {
      handleSnapshot(snapshot, roomsContainer);
    }, handleSnapshotError);
  } catch (err) {
    console.error('startAppForRoomDisplay error:', err);
    showError('เริ่มระบบไม่สำเร็จ (ดู console)', roomsContainer);
  }
}

function handleSnapshot(snapshot, container) {
  if (!snapshot || snapshot.empty) {
    container.innerHTML = '<p style="text-align: center; color: #888;">ยังไม่มีห้องในระบบ</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  snapshot.forEach(doc => {
    const data = doc.data() || {};
    const card = document.createElement('div');
    card.className = 'room-card';
    card.innerHTML = `
      <div class="camera-box">
        <video id="video-${doc.id}" autoplay playsinline muted></video>
      </div>
      <div class="room-info">
        <div class="room-title">${escapeHtml(data.room || 'N/A')} <span class="small">(${escapeHtml(data.admin || '-')})</span></div>
        <div class="small">หมดเวลา: ${escapeHtml(data.expire || '-')}</div>
      </div>
      <div class="room-actions">
        <button class="primary btn-openCam" data-camera="${escapeHtml(data.cameraId || '')}" data-doc-id="${doc.id}">📷 เปิดกล้อง</button>
        <button class="danger btn-delete" data-id="${doc.id}" data-name="${escapeHtml(data.room)}">🗑 ลบห้อง</button>
      </div>
    `;
    fragment.appendChild(card);
  });

  // ก่อนจะแสดงผลใหม่ เราควรหยุดสตรีมเก่าทั้งหมดก่อน
  stopAllCardStreams();
  container.innerHTML = '';
  container.appendChild(fragment);
  attachRoomButtons();
}

function handleSnapshotError(error) {
  console.error('onSnapshot error:', error);
  const container = document.getElementById('roomsContainer');
  showError('เกิดข้อผิดพลาดในการโหลดข้อมูลห้อง', container);
}

function attachRoomButtons() {
  document.querySelectorAll('.btn-openCam').forEach(btn => {
    btn.onclick = () => handleOpenCamera(btn.dataset.camera, btn.dataset.docId, btn);
  });

  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.onclick = () => handleDeleteRoom(btn.dataset.id, btn.dataset.name);
  });
}


// ===================================================================
//  ส่วนของ "หน้ารายงาน" (report.html)
// ===================================================================

async function loadReportData(db) {
  const reportBody = document.getElementById('reportBody');
  reportBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">กำลังโหลดข้อมูล...</td></tr>';

  try {
    const snapshot = await db.collection('rooms').orderBy('createdAt', 'desc').get();

    if (snapshot.empty) {
      reportBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">ยังไม่มีข้อมูลการใช้งานห้อง</td></tr>';
      return;
    }
    
    reportBody.innerHTML = ''; // เคลียร์ตาราง
    snapshot.forEach(doc => {
      const data = doc.data();
      const row = document.createElement('tr');
      const startTime = data.createdAt?.toDate() 
        ? data.createdAt.toDate().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
        : '-';

      row.innerHTML = `
        <td style="padding:8px 6px">${escapeHtml(data.room || 'ไม่ระบุชื่อ')}</td>
        <td style="padding:8px 6px">${escapeHtml(data.admin || '-')}</td>
        <td style="padding:8px 6px">${startTime}</td>
        <td style="padding:8px 6px">${escapeHtml(data.expire || '-')}</td>
      `;
      reportBody.appendChild(row);
    });
  } catch (err) {
    console.error('Error loading report data:', err);
    showErrorInTable('เกิดข้อผิดพลาดในการโหลดรายงาน');
  }
}


// ===================================================================
//  ส่วนของ "หน้าเพิ่มห้อง" (room_form.html)
// ===================================================================

function initializeAddRoomPage(db) {
  loadCameraOptions(); // โหลดรายชื่อกล้องใส่ใน select
  
  const saveRoomBtn = document.getElementById("saveRoom");
  saveRoomBtn.addEventListener("click", async () => {
    const roomName = document.getElementById("roomName").value.trim();
    const roomAdmin = document.getElementById("roomAdmin").value.trim();
    const roomExpire = document.getElementById("roomExpire").value;
    const roomCamera = document.getElementById("roomCamera")?.value || "";

    if (!roomName || !roomAdmin || !roomExpire) {
      Swal.fire('ข้อมูลไม่ครบ!', 'กรุณากรอกชื่อห้อง, ชื่อผู้ดูแล, และเวลาหมดอายุ', 'warning');
      return;
    }

    try {
      Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      
      await db.collection("rooms").add({
        room: roomName,
        admin: roomAdmin,
        expire: roomExpire,
        cameraId: roomCamera,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      Swal.fire('สำเร็จ!', "บันทึกข้อมูลห้องเรียบร้อยแล้ว", 'success');
      showQR();
    } catch (error) {
      console.error("Error adding document: ", error);
      Swal.fire('เกิดข้อผิดพลาด!', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
    }
  });

  // ปุ่มปิด QR
  document.getElementById("closeQR")?.addEventListener("click", () => {
    clearInterval(countdown);
    document.getElementById("qrBox").style.display = "none";
  });
}

// ฟังก์ชัน QR
let countdown;
function showQR() {
  const qrBox = document.getElementById("qrBox");
  const timerText = document.getElementById("timerText");
  if (!qrBox || !timerText) return;

  qrBox.style.display = "block";
  let timeLeft = 60;
  timerText.textContent = `QR จะหายไปใน ${timeLeft} วินาที`;

  clearInterval(countdown);
  countdown = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) {
      clearInterval(countdown);
      qrBox.style.display = "none";
    } else {
      timerText.textContent = `QR จะหายไปใน ${timeLeft} วินาที`;
    }
  }, 1000);
}


// ===================================================================
//  ฟังก์ชันที่ใช้ร่วมกัน (HELPER FUNCTIONS)
// ===================================================================

// --- ฟังก์ชันจัดการกล้อง (ฉบับแก้ไข: เปิด-ปิด ใน Card โดยตรง) ---
let activeCardStreams = {};

async function handleOpenCamera(cameraId, docId, buttonEl) {
  if (!docId) return console.error("Doc ID is missing.");

  if (activeCardStreams[docId]) {
    stopStreamForCard(docId, buttonEl);
    return;
  }

  const videoEl = document.getElementById(`video-${docId}`);
  if (!videoEl) return console.error(`Video element for doc ID ${docId} not found.`);
  
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return Swal.fire('ไม่รองรับ', 'เบราว์เซอร์ของคุณไม่รองรับการเข้าถึงกล้อง หรือคุณกำลังใช้งานผ่าน HTTP ที่ไม่ปลอดภัย', 'error');
  }

  try {
    let deviceToUse = cameraId;
    if (!deviceToUse) {
      const devices = await getVideoDevices();
      if (devices.length > 0) deviceToUse = devices[0].deviceId;
      else throw new Error("ไม่พบอุปกรณ์กล้องในเครื่องของคุณ");
    }

    const constraints = { video: { deviceId: { exact: deviceToUse } }, audio: false };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    videoEl.srcObject = stream;
    await videoEl.play();
    activeCardStreams[docId] = stream;

    if (buttonEl) {
      buttonEl.innerHTML = "⏹️ ปิดกล้อง";
      buttonEl.classList.replace('primary', 'warning');
    }
  } catch (err) {
    console.error("Failed to open camera:", err);
    let errorMsg = err.message;
    if (err.name === 'NotAllowedError') errorMsg = 'คุณได้ปฏิเสธการเข้าถึงกล้อง กรุณาอนุญาตในตั้งค่าของเบราว์เซอร์';
    else if (err.name === 'NotFoundError') errorMsg = 'ไม่พบกล้องที่ระบุ';
    Swal.fire('เกิดข้อผิดพลาด', errorMsg, 'error');
  }
}

function stopStreamForCard(docId, buttonEl) {
  const stream = activeCardStreams[docId];
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    delete activeCardStreams[docId];
  }
  
  const videoEl = document.getElementById(`video-${docId}`);
  if (videoEl) videoEl.srcObject = null;

  if (buttonEl) {
    buttonEl.innerHTML = "📷 เปิดกล้อง";
    buttonEl.classList.replace('warning', 'primary');
  }
}

function stopAllCardStreams() {
    Object.keys(activeCardStreams).forEach(docId => stopStreamForCard(docId, null));
}

async function getVideoDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      throw new Error("ฟังก์ชัน enumerateDevices ไม่รองรับในเบราว์เซอร์นี้");
  }
  try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach(track => track.stop());
  } catch (e) {
      console.warn("Could not get camera permissions to fetch labels.");
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => d.kind === 'videoinput');
}

async function loadCameraOptions() {
  const selectEl = document.getElementById("roomCamera");
  if (!selectEl) return;
  try {
    const devices = await getVideoDevices();
    selectEl.innerHTML = '<option value="">-- ไม่ระบุกล้อง --</option>';
    devices.forEach(device => {
      const opt = document.createElement("option");
      opt.value = device.deviceId;
      opt.textContent = device.label || `กล้อง ${device.deviceId.substring(0, 8)}`;
      selectEl.appendChild(opt);
    });
  } catch (err) {
    console.error("ไม่สามารถโหลดรายชื่อกล้อง:", err);
  }
}

// --- ฟังก์ชันจัดการข้อมูล ---
async function handleDeleteRoom(id, name) {
  if (!id) return;
  const result = await Swal.fire({
    title: `ต้องการลบห้อง ${name}?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ใช่, ลบเลย',
    cancelButtonText: 'ยกเลิก'
  });
  if (!result.isConfirmed) return;

  try {
    const db = await window.firebaseReady;
    await db.collection('rooms').doc(id).delete();
    Swal.fire({ icon: 'success', title: 'ลบแล้ว' });
  } catch (err) {
    console.error('delete room error', err);
    Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: err.message });
  }
}

// --- ฟังก์ชันแสดงผลและอื่นๆ ---
function showError(text, container) {
  if (container) container.innerHTML = `<p style="color:#d33; text-align:center;">${escapeHtml(text)}</p>`;
}

function showErrorInTable(text) {
  const reportBody = document.getElementById('reportBody');
  if (reportBody) {
    reportBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px; color: #d33;">${escapeHtml(text)}</td></tr>`;
  }
}

function escapeHtml(str) {
  const p = document.createElement("p");
  p.textContent = String(str || '');
  return p.innerHTML;
}

window.addEventListener('beforeunload', () => {
  if (roomsUnsubscribe) roomsUnsubscribe();
  stopAllCardStreams(); // ✅ แก้ไขให้หยุดสตรีมจาก Card
});