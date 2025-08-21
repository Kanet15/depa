// firebase-init.js (แก้ไขแล้ว)
// วางหลัง Firebase SDK scripts และก่อนสคริปต์ที่เรียกใช้งาน db
const CONFIG_URL = 'http://localhost:8080/firebase-config'; // เปลี่ยนตามต้องการ
const FETCH_TIMEOUT = 7000; // ms

// helper: fetch JSON พร้อม timeout
async function fetchJsonWithTimeout(url, timeout = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
      credentials: 'include' // ถ้า server ไม่ต้องการ cookie ให้เปลี่ยนเป็น 'omit' หรือ ลบบรรทัดนี้
    });
    clearTimeout(id);

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status} ${resp.statusText} - ${text}`);
    }

    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const body = await resp.text().catch(() => '');
      throw new Error('Invalid content-type, expected application/json. Body: ' + body);
    }

    return await resp.json();
  } catch (err) {
    clearTimeout(id);
    if (err && err.name === 'AbortError') throw new Error('Fetch timeout');
    throw err;
  }
}

// ฟังก์ชัน initialize โดยคืนค่า Promise
async function initializeFirebase() {
  try {
    const firebaseConfig = await fetchJsonWithTimeout(CONFIG_URL);

    if (!firebaseConfig || !firebaseConfig.apiKey || !firebaseConfig.projectId) {
      throw new Error('Received invalid Firebase config from server.');
    }

    if (typeof window.firebase === 'undefined' || typeof window.firebase.initializeApp !== 'function') {
      throw new Error('Firebase SDK not found. Include Firebase SDK <script> tags before this script.');
    }

    if (!window.firebase.apps || window.firebase.apps.length === 0) {
      window.firebase.initializeApp(firebaseConfig);
      console.log('Firebase initialized');
    } else {
      console.log('Firebase already initialized');
    }

    if (window.firebase.firestore) {
      window.db = window.firebase.firestore();
      console.log('Firestore initialized');
    } else {
      window.db = null;
      console.warn('firebase.firestore() not available. Make sure Firestore SDK is included if needed.');
    }

    // เรียกใช้ฟังก์ชันหลักของแอป ถ้ามี (ปลอดภัย)
    if (typeof window.initializeAppLogic === 'function') {
      try {
        await window.initializeAppLogic();
      } catch (e) {
        console.error('initializeAppLogic() threw an error:', e);
      }
    }

    return window.db;
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);

    // แสดงข้อความสั้น ๆ บนหน้าเว็บ
    try {
      const containerId = '__firebase_init_error';
      let el = document.getElementById(containerId);
      if (!el) {
        el = document.createElement('div');
        el.id = containerId;
        el.style.padding = '12px';
        el.style.background = '#fee';
        el.style.color = '#600';
        el.style.fontFamily = 'sans-serif';
        el.style.borderBottom = '1px solid #f88';
        document.body.insertBefore(el, document.body.firstChild);
      }
      el.innerHTML = `<strong>Error: Could not load application configuration.</strong>
                      <div style="font-size:0.9em">See console for details.</div>`;
    } catch (e) {
      // ignore DOM errors
    }

    window.db = null;
    throw error;
  }
}

// สร้าง Promise สาธารณะให้ไฟล์อื่นรอ
window.firebaseReady = initializeFirebase();

// เรียกใช้งานทันที (initializeFirebase ถูกเรียกผ่าน window.firebaseReady)