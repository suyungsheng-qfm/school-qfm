import { auth, configured, db } from "./firebase.js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { addDoc, collection, getCountFromServer, getDocs, orderBy, query, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const error = document.getElementById("login-error");
const lines = (value) => value.split("\n").map((v) => v.trim()).filter(Boolean);
async function publish(collectionName, data, form) { try { await addDoc(collection(db, collectionName), { ...data, createdAt: serverTimestamp() }); form.reset(); alert("已發布。網站將即時更新。"); } catch (e) { alert("發布失敗：" + e.message); } }
async function renderActivity() {
  const root = document.getElementById("activity-list");
  const groups = [["announcements", "公告", "signatures", "簽名"], ["polls", "投票", "votes", "票"], ["forms", "表單", "responses", "份回覆"]];
  const output = [];
  for (const [name, label, child, suffix] of groups) {
    const snap = await getDocs(query(collection(db, name), orderBy("createdAt", "desc")));
    for (const item of snap.docs) { const count = await getCountFromServer(collection(db, name, item.id, child)); output.push(`<li><strong>${label}</strong> ${item.data().title || item.data().question}：${count.data().count} ${suffix}</li>`); }
  }
  root.innerHTML = output.length ? `<ul>${output.join("")}</ul>` : "尚未發布任何內容。";
}
if (!configured) { error.textContent = "尚未設定 Firebase，請先完成 firebase-config.js。"; }
else {
  onAuthStateChanged(auth, async (user) => { document.getElementById("login-panel").hidden = Boolean(user); document.getElementById("dashboard").hidden = !user; if (user) { document.getElementById("admin-email").textContent = user.email; renderActivity(); } });
  document.getElementById("login-form").onsubmit = async (event) => { event.preventDefault(); error.textContent = ""; try { await signInWithEmailAndPassword(auth, document.getElementById("email").value, document.getElementById("password").value); } catch (e) { error.textContent = "登入失敗，請確認帳號、密碼與 Firebase 驗證設定。"; } };
  document.getElementById("sign-out").onclick = () => signOut(auth);
  document.getElementById("announcement-form").onsubmit = (e) => { e.preventDefault(); const d = new FormData(e.target); publish("announcements", { title:d.get("title"), body:d.get("body"), requiresSignature:d.has("requiresSignature") }, e.target); };
  document.getElementById("poll-form").onsubmit = (e) => { e.preventDefault(); const d = new FormData(e.target); const options = lines(d.get("options")); if (options.length < 2) return alert("請至少填寫兩個選項。"); publish("polls", { question:d.get("question"), options, counts:Object.fromEntries(options.map((_, i) => [i, 0])) }, e.target); };
  document.getElementById("form-form").onsubmit = (e) => { e.preventDefault(); const d = new FormData(e.target); const fields = lines(d.get("fields")); if (!fields.length) return alert("請至少填寫一個欄位。"); publish("forms", { title:d.get("title"), description:d.get("description"), fields }, e.target); };
}
