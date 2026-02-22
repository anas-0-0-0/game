/**
 * إعدادات Firebase - ضرورية لتشغيل اللعبة بين أجهزة مختلفة
 */

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAoWfO2sJr9zzFVKaadSgKtUvAcF2_qbS0",
    authDomain: "myweb-1ae58.firebaseapp.com",
    databaseURL: "https://myweb-1ae58-default-rtdb.firebaseio.com",
    projectId: "myweb-1ae58",
    storageBucket: "myweb-1ae58.appspot.com",
    messagingSenderId: "750486813952",
    appId: "1:750486813952:web:a59049094a10d86d2e07e5"
};

/**
 * هل Firebase مفعّل؟
 */
const FIREBASE_ENABLED = true;

/* قواعد الأمان المقترحة في Realtime Database:
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
(للاستخدام في التعلم فقط - للإنتاج قيّد القراءة/الكتابة حسب الحاجة)
*/
