//ตรงนี้คือตรวจสอบว่าล็อกอินหรือยัง
if (!localStorage.getItem('adminName')) {
  window.location.href = 'login.html';
}

//ตรงนี้แสดงข้อมูลผู้ดูแล
document.getElementById('adminNameDisplay').textContent = localStorage.getItem('adminName');
document.getElementById('adminPhoneDisplay').textContent = localStorage.getItem('adminPhone');
document.getElementById('adminLineDisplay').textContent = localStorage.getItem('adminLine');

//ตรงนี้ปุ่มออกจากระบบ
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.clear();
  window.location.href = 'login.html';
});

// //อันนี้คือทำสลับหน้า
// function showPage(page) {
//   document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
//   document.getElementById('page-' + page).style.display = 'block';
//   document.querySelectorAll('#mainNav a').forEach(a => {
//     a.classList.toggle('active', a.dataset.page === page);
//   });
// }

// //เมนูใช้คลิกๆ
// document.querySelectorAll('#mainNav a').forEach(a => {
//   a.addEventListener('click', e => {
//     e.preventDefault();
//     showPage(a.dataset.page);
//   });
// });

// //ปุ่มบันทึกห้อง
// document.getElementById('saveRoom').addEventListener('click', () => {
//   const name = document.getElementById('roomName').value;
//   const time = document.getElementById('roomSchedule').value;
//   alert(`บันทึกห้อง: ${name}\nตาราง: ${time}`);
// });

// //ตรงนี้ใช้เปิดกล้อง
// async function startCam() {
//   try {
//     const devices = await navigator.mediaDevices.enumerateDevices();
//     let videoDevice = devices.find(d => d.kind === 'videoinput');

//     if (!videoDevice) {
//       alert("ไม่พบกล้องใด ๆ");
//       return;
//     }

//     const stream = await navigator.mediaDevices.getUserMedia({
//       video: { deviceId: videoDevice.deviceId }
//     });

//     document.getElementById('lriunCam').srcObject = stream;
//   } catch (err) {
//     console.error("ไม่สามารถเปิดกล้องได้:", err);
//     alert("ไม่สามารถเปิดกล้อง: " + err);
//   }
// }

startCam();
