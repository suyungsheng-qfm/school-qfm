import { auth, configured, db } from "./firebase.js";
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
import { onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, doc, increment, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const list = (id) => document.getElementById(id);
const empty = () => document.getElementById("empty-template").content.cloneNode(true);
const escapeHtml = (text = "") => String(text).replace(/[&<>'"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c]));
const dateText = (timestamp) => timestamp?.toDate ? timestamp.toDate().toLocaleDateString("zh-TW") : "剛剛";

function showSetupMessage() {
  document.querySelectorAll(".card-grid").forEach((node) => node.innerHTML = '<p class="empty">尚未設定 Firebase。請依 README 完成設定後重新載入。</p>');
  document.getElementById("user-status").textContent = "等待 Firebase 設定";
}
function renderAnnouncements(items, uid) {
  const root = list("announcements-list"); root.innerHTML = "";
  if (!items.length) return root.append(empty());
  items.forEach(({ id, ...item }) => {
    const card = document.createElement("article"); card.className = "card";
    card.innerHTML = `<p class="card-date">${dateText(item.createdAt)}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body).replace(/\n/g, "<br>")}</p>${item.requiresSignature ? '<button data-sign="'+id+'">我已閱讀並簽名</button><small id="sign-'+id+'">需閱讀確認</small>' : '<small>不需要閱讀確認</small>'}`;
    root.append(card);
    if (item.requiresSignature) {
      const signature = doc(db, "announcements", id, "signatures", uid);
      onSnapshot(signature, (snap) => {
        const button = card.querySelector("button"); const note = card.querySelector("small");
        if (snap.exists()) { button.disabled = true; button.textContent = "已完成簽名"; note.textContent = "已於 " + dateText(snap.data().signedAt) + " 確認"; }
      });
      card.querySelector("button").onclick = async () => { await setDoc(signature, { signedAt: serverTimestamp() }); };
    }
  });
}
function renderPolls(items, uid) {
  const root = list("polls-list"); root.innerHTML = ""; if (!items.length) return root.append(empty());
  items.forEach(({ id, ...item }) => {
    const card = document.createElement("article"); card.className = "card";
    card.innerHTML = `<p class="card-date">${dateText(item.createdAt)}</p><h3>${escapeHtml(item.question)}</h3><div class="options">${(item.options || []).map((option, index) => `<button data-option="${index}">${escapeHtml(option)} <span>${item.counts?.[index] || 0} 票</span></button>`).join("")}</div><small>每人限投一次</small>`;
    root.append(card);
    const voteRef = doc(db, "polls", id, "votes", uid);
    onSnapshot(voteRef, (snap) => { if (snap.exists()) { card.querySelectorAll("button").forEach((b) => b.disabled = true); card.querySelector("small").textContent = "已完成投票"; } });
    card.querySelectorAll("[data-option]").forEach((button) => button.onclick = async () => {
      const option = Number(button.dataset.option); button.closest("article").querySelectorAll("button").forEach((b) => b.disabled = true);
      try { await setDoc(voteRef, { option, votedAt: serverTimestamp() }); await updateDoc(doc(db, "polls", id), { [`counts.${option}`]: increment(1) }); }
      catch (error) { alert("投票未完成，請重新整理後再試。") }
    });
  });
}
function renderForms(items, uid) {
  const root = list("forms-list"); root.innerHTML = ""; if (!items.length) return root.append(empty());
  items.forEach(({ id, ...item }) => {
    const card = document.createElement("article"); card.className = "card";
    card.innerHTML = `<p class="card-date">${dateText(item.createdAt)}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description || "")}</p><form class="public-form">${(item.fields || []).map((field) => `<label>${escapeHtml(field)}<input required name="${escapeHtml(field)}" maxlength="120" /></label>`).join("")}<button>送出登記</button></form><small></small>`;
    root.append(card);
    const responseRef = doc(db, "forms", id, "responses", uid);
    onSnapshot(responseRef, (snap) => { if (snap.exists()) { card.querySelector("form").hidden = true; card.querySelector("small").textContent = "已完成登記"; } });
    card.querySelector("form").onsubmit = async (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); await setDoc(responseRef, { data, submittedAt: serverTimestamp() }); };
  });
}
if (!configured) showSetupMessage();
else {
  onAuthStateChanged(auth, (user) => { if (!user) signInAnonymously(auth); else { const teacherCode = localStorage.getItem("teacherCode"); document.getElementById("user-status").textContent = teacherCode ? `導師 ${teacherCode} 已登入` : "已連線，可開始填寫"; onSnapshot(query(collection(db, "announcements"), orderBy("createdAt", "desc")), (s) => renderAnnouncements(s.docs.map((d) => ({id:d.id,...d.data()})), user.uid)); onSnapshot(query(collection(db, "polls"), orderBy("createdAt", "desc")), (s) => renderPolls(s.docs.map((d) => ({id:d.id,...d.data()})), user.uid)); onSnapshot(query(collection(db, "forms"), orderBy("createdAt", "desc")), (s) => renderForms(s.docs.map((d) => ({id:d.id,...d.data()})), user.uid)); } });
}
document.getElementById("refresh-announcements").onclick = () => location.reload();
