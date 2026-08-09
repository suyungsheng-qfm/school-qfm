import { auth, configured, db } from "./firebase.js";
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
const error = document.getElementById("teacher-error");
const codeForm = document.getElementById("code-form");
const pinForm = document.getElementById("pin-form");
const codeInput = document.getElementById("teacher-code");
const pinInput = document.getElementById("teacher-pin");
const confirmLabel = document.getElementById("confirm-label");
const confirmInput = document.getElementById("teacher-pin-confirm");
let code = "";
let needsSetup = false;

async function hashPin(pin) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function ensureSignedIn() { if (!auth.currentUser) await signInAnonymously(auth); }
function showPinScreen() {
  codeForm.hidden = true; pinForm.hidden = false;
  document.getElementById("pin-title").textContent = needsSetup ? `代號 ${code}：請設定 6 位數驗證碼` : `代號 ${code}：請輸入驗證碼`;
  document.getElementById("pin-button").textContent = needsSetup ? "設定並登入" : "登入";
  confirmLabel.hidden = !needsSetup; confirmInput.required = needsSetup;
  pinInput.autocomplete = needsSetup ? "new-password" : "current-password"; pinInput.focus();
}
if (!configured) error.textContent = "尚未設定 Firebase。";
else {
  codeForm.onsubmit = async (event) => {
    event.preventDefault(); error.textContent = ""; code = codeInput.value.trim();
    try { await ensureSignedIn(); const record = await getDoc(doc(db, "teacherCredentials", code)); needsSetup = !record.exists() || !record.data().pinHash; showPinScreen(); }
    catch (err) { error.textContent = "目前無法連線，請稍後再試。"; }
  };
  pinForm.onsubmit = async (event) => {
    event.preventDefault(); error.textContent = "";
    if (needsSetup && pinInput.value !== confirmInput.value) { error.textContent = "兩次輸入的驗證碼不一致。"; return; }
    try {
      const pinHash = await hashPin(pinInput.value);
      const credentialRef = doc(db, "teacherCredentials", code);
      if (needsSetup) await setDoc(credentialRef, { pinHash, updatedAt: serverTimestamp() }, { merge: true });
      else { const record = await getDoc(credentialRef); if (!record.exists() || record.data().pinHash !== pinHash) { error.textContent = "代號或驗證碼錯誤。"; return; } }
      localStorage.setItem("teacherCode", code); location.href = "index.html";
    } catch (err) { error.textContent = "目前無法完成操作，請稍後再試或通知級導師。"; }
  };
  document.getElementById("change-code").onclick = () => { codeForm.hidden = false; pinForm.hidden = true; pinForm.reset(); codeInput.focus(); };
}
