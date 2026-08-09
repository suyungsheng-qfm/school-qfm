import { auth, configured, db } from "./firebase.js";
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
const form = document.getElementById("login-form");
const codeInput = document.getElementById("user-code");
const pinLabel = document.getElementById("pin-label");
const pinInput = document.getElementById("user-pin");
const confirmLabel = document.getElementById("confirm-label");
const confirmInput = document.getElementById("user-pin-confirm");
const button = document.getElementById("login-button");
const note = document.getElementById("login-note");
const error = document.getElementById("login-error");
let code = "";
let needsSetup = false;
let deferredInstallPrompt;

async function hashPin(pin) { const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin))); return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function ensureSignedIn() { if (!auth.currentUser) await signInAnonymously(auth); }
function showPinInput() { codeInput.disabled = true; pinLabel.hidden = false; confirmLabel.hidden = !needsSetup; pinInput.required = true; confirmInput.required = needsSetup; button.textContent = needsSetup ? "設定並進入" : "登入"; note.textContent = needsSetup ? "首次設定：請輸入並再次確認 6 位數驗證碼。" : "已找到資料，請輸入你的 6 位數驗證碼。"; pinInput.focus(); }
function enterSite() { localStorage.setItem("classHubAccess", "true"); localStorage.setItem("teacherCode", code); location.replace("index.html"); }

if (!configured) error.textContent = "尚未設定 Firebase。";
else form.onsubmit = async (event) => {
  event.preventDefault(); error.textContent = "";
  try {
    await ensureSignedIn();
    if (!code) { code = codeInput.value.trim(); const record = await getDoc(doc(db, "teacherCredentials", code)); needsSetup = !record.exists() || !record.data().pinHash; showPinInput(); return; }
    if (needsSetup && pinInput.value !== confirmInput.value) { error.textContent = "兩次輸入的驗證碼不一致。"; return; }
    const credentialRef = doc(db, "teacherCredentials", code); const pinHash = await hashPin(pinInput.value);
    if (needsSetup) await setDoc(credentialRef, { pinHash, updatedAt: serverTimestamp() }, { merge: true });
    else { const record = await getDoc(credentialRef); if (!record.exists() || record.data().pinHash !== pinHash) { error.textContent = "使用者名稱或驗證碼錯誤。"; return; } }
    enterSite();
  } catch (err) { error.textContent = "目前無法完成登入，請稍後再試。"; }
};

window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredInstallPrompt = event; });
document.getElementById("install-app").onclick = async () => {
  const help = document.getElementById("install-help");
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) {
    help.hidden = false;
    help.innerHTML = "<strong>iPhone 安裝方式</strong><br>1. 請使用 Safari 開啟此頁。<br>2. 點底部的 <span class=\"share-icon\" aria-label=\"分享圖示\">⇧</span>「分享」圖示。<br>3. 向下滑動並選擇「加入主畫面」。<br>4. 點「新增」，桌面會出現狼 Logo 的 App 圖示。";
    return;
  }
  if (deferredInstallPrompt) { deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; return; }
  help.hidden = false; help.textContent = "請在瀏覽器選單選擇「安裝應用程式」或「加入主畫面」。";
};
