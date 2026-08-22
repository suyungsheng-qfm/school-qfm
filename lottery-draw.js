import { auth, configured, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const storedDraw = sessionStorage.getItem("pendingLotteryDraw");
const drawData = storedDraw ? JSON.parse(storedDraw) : null;
const card = document.getElementById("draw-card");
const state = document.getElementById("draw-state");
const title = document.getElementById("draw-title");
const summary = document.getElementById("draw-summary");
const tumbler = document.getElementById("draw-tumbler");
const results = document.getElementById("draw-results");
const start = document.getElementById("draw-start");
const back = document.getElementById("draw-back");
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const escapeHtml = (text = "") => String(text).replace(/[&<'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

function shuffle(items) { const shuffled = [...items]; for (let index = shuffled.length - 1; index > 0; index -= 1) { const target = Math.floor(Math.random() * (index + 1)); [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]]; } return shuffled; }
function returnToAdmin() { location.replace("admin.html"); }

if (!configured || !drawData) {
  state.textContent = "找不到抽籤設定";
  title.textContent = "請從管理端重新設定抽籤";
  summary.textContent = "此抽籤頁只會在管理端設定完成後開啟。";
  tumbler.textContent = "!";
  start.hidden = true;
} else {
  title.textContent = drawData.title;
  summary.textContent = `共 ${drawData.classes.length} 個班級參與，本次${drawData.mode === "rank" ? "將公布完整排序" : `抽出 ${drawData.results.length} 個班級`}。`;
  tumbler.classList.toggle("has-many-classes", drawData.classes.length > 4);
}

start.onclick = async () => {
  if (!drawData) return;
  start.disabled = true;
  back.hidden = true;
  card.className = "draw-card is-shuffling";
  for (let seconds = 3; seconds >= 1; seconds -= 1) {
    state.textContent = `打亂班級中… ${seconds}`;
    tumbler.textContent = shuffle(drawData.classes).join(" · ");
    await wait(1000);
  }
  card.className = "draw-card is-drawing";
  state.textContent = drawData.mode === "rank" ? "開始公布排序" : "開始公布結果";
  for (let index = 0; index < drawData.results.length; index += 1) {
    const result = drawData.results[index];
    tumbler.textContent = result;
    const item = document.createElement("li");
    item.innerHTML = `<span>${drawData.mode === "rank" ? `第 ${index + 1} 順位` : `第 ${index + 1} 個`}</span><strong>${escapeHtml(result)}</strong>`;
    results.append(item);
    await wait(1000);
  }
  try {
    const resultLines = drawData.results.map((code, index) => `${drawData.mode === "rank" ? `${index + 1}. ` : `第 ${index + 1} 個：`}${code}`);
    await addDoc(collection(db, "announcements"), { title: `【抽籤結果】${drawData.title}`, body: `參與班級：${drawData.classes.join("、")}\n\n抽籤結果：\n${resultLines.join("\n")}`, requiresSignature: false, lotteryResult: true, createdAt: serverTimestamp() });
    sessionStorage.removeItem("pendingLotteryDraw");
    card.className = "draw-card is-finished";
    state.textContent = "抽籤完成，結果已發布至公告";
    tumbler.textContent = "完成";
    start.hidden = true;
    back.hidden = false;
    back.textContent = "返回管理端";
  } catch (error) {
    card.className = "draw-card";
    state.textContent = "發布失敗，請重新嘗試";
    tumbler.textContent = "!";
    start.disabled = false;
    start.textContent = "重新發布抽籤結果";
    back.hidden = false;
  }
};
back.onclick = returnToAdmin;
onAuthStateChanged(auth, (user) => { if (!user || user.isAnonymous) returnToAdmin(); });
