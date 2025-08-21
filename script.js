// ===================================================================
//  START: โค้ดเริ่มต้นการทำงาน (Entry Point)
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {
  // --- ส่วนที่ 1: โค้ดที่ทำงานร่วมกันทุกหน้า (COMMON CODE) ---
  
  // 1.1 ตรวจสอบการล็อกอิน
  if (!localStorage.getItem('adminName')) {
    window.location.href = 'login.html';
    return; // หยุดการทำงานทันทีถ้ายังไม่ล็อกอิน
  }

  // 1.2 แสดงข้อมูลผู้ดูแลใน Sidebar
  document.getElementById('adminNameDisplay').textContent = localStorage.getItem('adminName') || '-';
  document.getElementById('adminPhoneDisplay').textContent = localStorage.getItem('adminPhone') || '-';
  document.getElementById('adminLineDisplay').textContent = localStorage.getItem('adminLine') || '-';

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
        startAppForRoomDisplay(db); // เรียกฟังก์ชันสำหรับแสดงห้องแบบ Real-time
      }
      
      // ถ้าเจอ <tbody id="reportBody"> ให้ทำงานแบบ "หน้ารายงาน"
      else if (document.getElementById('reportBody')) {
        console.log("Running in Report Mode");
        loadReportData(db); // เรียกฟังก์ชันสำหรับหน้ารายงาน
      }

      // ถ้าเจอ <button id="saveRoom"> ให้ทำงานแบบ "หน้าเพิ่มห้อง"
      else if (document.getElementById('saveRoom')) {
        console.log("Running in Add Room Form Mode");
        initializeAddRoomPage(db); // เรียกฟังก์ชันสำหรับเตรียมหน้าฟอร์ม
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
    container.innerHTML = '<p>ยังไม่มีห้องในระบบ</p>';
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
        <button class="btn-openCam" data-camera="${escapeHtml(data.cameraId || '')}">📷 เปิดกล้อง</button>
        <button class="btn-delete" data-id="${doc.id}" data-name="${escapeHtml(data.room)}">🗑 ลบห้อง</button>
      </div>
    `;
    fragment.appendChild(card);
  });

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
    btn.onclick = () => handleOpenCamera(btn.dataset.camera);
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
//  ส่วนของ "หน้าเพิ่มห้อง" (room.html ที่มีฟอร์ม)
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

// --- ฟังก์ชันจัดการกล้อง ---
let _modalStream = null;

async function handleOpenCamera(cameraId) {
  if (/^https?:\/\//i.test(cameraId)) {
    window.open(cameraId, '_blank');
    return;
  }

  const html = `
    <div style="display:flex;flex-direction:column;gap:10px;">
      <select id="swal-camera-select" style="padding:6px;"></select>
      <video id="swal-video" autoplay playsinline controls style="width:100%;max-width:640px;background:#000;"></video>
    </div>`;

  Swal.fire({
    title: 'พรีวิวกล้อง',
    html,
    showConfirmButton: true,
    confirmButtonText: 'ปิด',
    width: 'auto',
    didOpen: async () => {
      const select = document.getElementById('swal-camera-select');
      const video = document.getElementById('swal-video');
      try {
        const devices = await getVideoDevices();
        if (!devices.length) {
          select.innerHTML = '<option value="">(ไม่พบกล้อง)</option>'; return;
        }
        select.innerHTML = devices.map(d => `<option value="${d.deviceId}">${escapeHtml(d.label || `กล้อง ${d.deviceId}`)}</option>`).join('');
        
        // เลือกกล้องที่ตรงกับ cameraId ถ้ามี
        if (cameraId && devices.some(d => d.deviceId === cameraId)) {
          select.value = cameraId;
        } else if (!cameraId) {
            // ถ้าไม่มี cameraId ให้ซ่อน select box ไปเลย
            select.style.display = 'none';
        }
        
        await startStreamForDevice(video, select.value);
        select.onchange = () => startStreamForDevice(video, select.value);

      } catch (err) {
        Swal.showValidationMessage('ไม่สามารถโหลดรายชื่อกล้อง: ' + err.message);
      }
    },
    willClose: stopModalStream
  });
}

async function startStreamForDevice(videoEl, deviceId) {
  stopModalStream();
  if (!deviceId) return;
  try {
    const constraints = { video: { deviceId: { exact: deviceId } }, audio: false };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoEl.srcObject = stream;
    await videoEl.play().catch(console.warn);
    _modalStream = stream;
  } catch (err) {
    console.error("startStreamForDevice failed:", err);
    Swal.showValidationMessage(`ไม่สามารถเปิดกล้อง: ${err.name}`);
  }
}

function stopModalStream() {
  if (_modalStream) {
    _modalStream.getTracks().forEach(t => t.stop());
    _modalStream = null;
  }
}

async function getVideoDevices() {
  let devices = await navigator.mediaDevices.enumerateDevices();
  if (!devices.some(d => d.kind === 'videoinput' && d.label)) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(t => t.stop());
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch (e) {
      console.warn("Could not get camera permissions to fetch labels.");
    }
  }
  return devices.filter(d => d.kind === 'videoinput');
}

async function loadCameraOptions() {
  const selectEl = document.getElementById("roomCamera");
  if (!selectEl) return;
  try {
    const devices = await getVideoDevices();
    selectEl.innerHTML = '<option value="">-- ไม่ระบุกล้อง --</option>'; // Default option
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
  if (container) container.innerHTML = `<p style="color:#800">${escapeHtml(text)}</p>`;
}

function showErrorInTable(text) {
  const reportBody = document.getElementById('reportBody');
  if (reportBody) {
    reportBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px; color: #800;">${escapeHtml(text)}</td></tr>`;
  }
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"'`=\/]/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;'
  }[s]));
}

window.addEventListener('beforeunload', () => {
  if (roomsUnsubscribe) roomsUnsubscribe();
  stopModalStream();
});