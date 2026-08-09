import { app, auth, configured } from "./firebase.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import { signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

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

function message(err) {
  const messages = { "functions/resource-exhausted": "嘗試次數過多，請 15 分鐘後再試。", "functions/unauthenticated": "代號或驗證碼錯誤。", "functions/failed-precondition": "此代號狀態已變更，請重新操作。" };
  return messages[err.code] || "目前無法登入，請稍後再試或通知級導師。";
}
if (!configured) error.textContent = "尚未設定 Firebase。";
else {
  const authenticateTeacher = httpsCallable(getFunctions(app), "authenticateTeacher");
  codeForm.onsubmit = async (event) => {
    event.preventDefault(); error.textContent = ""; code = codeInput.value.trim();
    try { const result = await authenticateTeacher({ code, mode: "status" }); needsSetup = result.data.needsSetup; codeForm.hidden = true; pinForm.hidden = false; document.getElementById("pin-title").textContent = needsSetup ? `代號 ${code}：請設定 6 位數驗證碼` : `代號 ${code}：請輸入驗證碼`; document.getElementById("pin-button").textContent = needsSetup ? "設定並登入" : "登入"; confirmLabel.hidden = !needsSetup; confirmInput.required = needsSetup; pinInput.autocomplete = needsSetup ? "new-password" : "current-password"; pinInput.focus(); }
    catch (err) { error.textContent = message(err); }
  };
  pinForm.onsubmit = async (event) => {
    event.preventDefault(); error.textContent = "";
    if (needsSetup && pinInput.value !== confirmInput.value) { error.textContent = "兩次輸入的驗證碼不一致。"; return; }
    try { const result = await authenticateTeacher({ code, pin: pinInput.value, mode: needsSetup ? "setup" : "login" }); await signInWithCustomToken(auth, result.data.token); location.href = "index.html"; }
    catch (err) { error.textContent = message(err); }
  };
  document.getElementById("change-code").onclick = () => { codeForm.hidden = false; pinForm.hidden = true; pinForm.reset(); codeInput.focus(); };
}
