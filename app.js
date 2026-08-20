import { auth, configured, db } from "./firebase.js";
import { onAuthStateChanged, signInAnonymously, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, doc, increment, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").then((registration) => registration.update()));

const list = (id) => document.getElementById(id);
const empty = () => document.getElementById("empty-template").content.cloneNode(true);
const escapeHtml = (text = "") => String(text).replace(/[&<>'"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c]));
const dateText = (timestamp) => timestamp?.toDate ? timestamp.toDate().toLocaleDateString("zh-TW") : "剛剛";
const isHolidayEvent = (event) => /放假|補假|休業|國定假日|春節|元旦|和平紀念|兒童節|清明|勞動節|端午|中秋|國慶/.test(event.title || "");
let currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let calendarEvents = [];

function showEventDetails(event) {
  const dialog = document.createElement("dialog");
  dialog.className = "event-dialog";
  dialog.style.cssText = "width:min(92vw,430px);padding:0;border:0;border-radius:16px;box-shadow:0 16px 42px #18324740;color:#163348";
  dialog.innerHTML = `<article style="position:relative;padding:1.35rem"><button class="dialog-close" type="button" aria-label="關閉" style="position:absolute;top:.65rem;right:.65rem;width:34px;min-height:34px;padding:0;border-radius:50%;background:#edf5f8;color:#185a87;font-size:1.45rem">×</button><p class="eyebrow">年級行事曆</p><h2>${escapeHtml(event.title)}</h2><p style="color:#185a87;font-weight:800">${escapeHtml(event.date)}${event.startTime ? ` ${escapeHtml(event.startTime)}` : ""}</p><p>${escapeHtml(event.description || "此行程沒有補充說明。").replace(/\n/g, "<br>")}</p></article>`;
  document.body.append(dialog);
  dialog.querySelector(".dialog-close").onclick = () => dialog.close();
  dialog.onclose = () => dialog.remove();
  dialog.onclick = (click) => { if (click.target === dialog) dialog.close(); };
  if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
}

function showSetupMessage() { document.querySelectorAll(".card-grid").forEach((node) => node.innerHTML = '<p class="empty">尚未設定 Firebase。請依 README 完成設定後重新載入。</p>'); }
function renderCalendar() {
  const year = currentMonth.getFullYear(), month = currentMonth.getMonth();
  list("calendar-title").textContent = `${year} 年 ${month + 1} 月`;
  const firstDay = new Date(year, month, 1).getDay(), days = new Date(year, month + 1, 0).getDate();
  const grid = list("calendar-grid"); grid.innerHTML = "";
  for (let slot = 0; slot < 42; slot++) {
    const date = slot - firstDay + 1; const cell = document.createElement("article"); cell.className = "calendar-day";
    if (date < 1 || date > days) { cell.classList.add("is-empty-day"); grid.append(cell); continue; }
    const key = `${year}-${String(month + 1).padStart(2,"0")}-${String(date).padStart(2,"0")}`; const today = new Date();
    if (today.getFullYear() === year && today.getMonth() === month && today.getDate() === date) cell.classList.add("is-today");
    const dayEvents = calendarEvents.filter((event) => event.date === key);
    if (new Date(year, month, date).getDay() === 0 || new Date(year, month, date).getDay() === 6 || dayEvents.some(isHolidayEvent)) cell.classList.add("is-holiday");
    const events = dayEvents.slice(0, 3);
    cell.innerHTML = `<time datetime="${key}">${date}</time>${events.map((event) => `<button class="calendar-event${isHolidayEvent(event) ? " is-holiday-event" : ""}" title="${escapeHtml(event.description || event.title)}">${escapeHtml(event.title)}</button>`).join("")}${dayEvents.length > 3 ? '<span class="more-events">更多…</span>' : ""}`;
    cell.querySelectorAll(".calendar-event").forEach((button, index) => { button.onclick = () => showEventDetails(events[index]); });
    grid.append(cell);
  }
  const upcoming = calendarEvents.filter((event) => event.date >= new Date().toISOString().slice(0,10)).sort((a,b) => `${a.date}${a.startTime||""}`.localeCompare(`${b.date}${b.startTime||""}`)).slice(0,5);
  list("upcoming-events").innerHTML = upcoming.length ? `<ul>${upcoming.map((event) => `<li><time>${event.date}${event.startTime ? ` ${event.startTime}` : ""}</time><span>${escapeHtml(event.title)}</span></li>`).join("")}</ul>` : "<p class=empty>近期尚無年級事務。</p>";
}
function renderAnnouncements(items, uid) { const root = list("announcements-list"); root.innerHTML = ""; if (!items.length) return root.append(empty()); items.forEach(({id,...item}) => { const card=document.createElement("article"); card.className="card"; card.innerHTML=`<p class="card-date">${dateText(item.createdAt)}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body).replace(/\n/g,"<br>")}</p>${item.requiresSignature?`<button>我已閱讀並簽收</button><small class="action-state is-pending">尚未簽收</small>`:"<small>本公告無須簽收</small>"}`; root.append(card); if(item.requiresSignature){const signature=doc(db,"announcements",id,"signatures",uid); onSnapshot(signature,(snap)=>{const button=card.querySelector("button"),note=card.querySelector("small"); if(snap.exists()){button.disabled=true;button.textContent="已完成簽收";note.className="action-state is-done";note.textContent="已簽收";}});card.querySelector("button").onclick=()=>setDoc(signature,{teacherCode,signedAt:serverTimestamp()});}});}
function renderPolls(items, uid) { const root=list("polls-list");root.innerHTML="";if(!items.length)return root.append(empty());items.forEach(({id,...item})=>{const card=document.createElement("article");card.className="card";card.innerHTML=`<p class="card-date">${dateText(item.createdAt)}</p><h3>${escapeHtml(item.question)}</h3><div class="options">${(item.options||[]).map((option,index)=>`<button data-option="${index}">${escapeHtml(option)} <span>${item.counts?.[index]||0} 票</span></button>`).join("")}</div><small class="action-state is-pending">尚未投票（每人限一次）</small>`;root.append(card);const voteRef=doc(db,"polls",id,"votes",uid);onSnapshot(voteRef,(snap)=>{if(snap.exists()){card.querySelectorAll("button").forEach((b)=>b.disabled=true);const note=card.querySelector("small");note.className="action-state is-done";note.textContent="已投票";}});card.querySelectorAll("[data-option]").forEach((button)=>button.onclick=async()=>{const option=Number(button.dataset.option);card.querySelectorAll("button").forEach((b)=>b.disabled=true);try{await setDoc(voteRef,{teacherCode,option,votedAt:serverTimestamp()});await updateDoc(doc(db,"polls",id),{[`counts.${option}`]:increment(1)});}catch(error){alert("投票未完成，請重新整理後再試。");}});});}
function renderForms(items,uid){const root=list("forms-list");root.innerHTML="";if(!items.length)return root.append(empty());items.forEach(({id,...item})=>{const card=document.createElement("article");card.className="card";card.innerHTML=`<p class="card-date">${dateText(item.createdAt)}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description||"")}</p><form class="public-form">${(item.fields||[]).map((field)=>`<label>${escapeHtml(field)}<input required name="${escapeHtml(field)}" maxlength="120" /></label>`).join("")}<button>送出登記</button></form><small class="action-state is-pending">尚未登記</small>`;root.append(card);const responseRef=doc(db,"forms",id,"responses",uid);onSnapshot(responseRef,(snap)=>{if(snap.exists()){card.querySelector("form").hidden=true;const note=card.querySelector("small");note.className="action-state is-done";note.textContent="已完成登記";}});card.querySelector("form").onsubmit=async(event)=>{event.preventDefault();await setDoc(responseRef,{teacherCode,data:Object.fromEntries(new FormData(event.target)),submittedAt:serverTimestamp()});};});}
function renderLotteries(items) { const root=list("lottery-list"); root.innerHTML=""; if(!items.length)return root.append(empty()); items.forEach((item)=>{const card=document.createElement("article");card.className="card lottery-card";const result=item.results||[];card.innerHTML=`<p class="card-date">${dateText(item.createdAt)}</p><h3>${escapeHtml(item.title)}</h3><p>${item.mode === "rank" ? "班級排序結果" : `抽出 ${result.length} 個班級`}</p><ol class="lottery-results">${result.map((code,index)=>`<li><span>${item.mode === "rank" ? `${index + 1}.` : ""}</span><strong>${escapeHtml(code)}</strong></li>`).join("")}</ol>`;root.append(card);});}
function choosePage(page){document.querySelectorAll(".feature-page").forEach((section)=>section.classList.toggle("is-active",section.id===page));document.querySelectorAll(".mobile-nav a").forEach((link)=>link.classList.toggle("is-selected",link.dataset.page===page));window.scrollTo({top:0,behavior:"smooth"});}
document.querySelectorAll(".mobile-nav a").forEach((link)=>link.onclick=(event)=>{event.preventDefault();choosePage(link.dataset.page);});
list("calendar-prev").onclick=()=>{currentMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()-1,1);renderCalendar();}; list("calendar-next").onclick=()=>{currentMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()+1,1);renderCalendar();};list("calendar-today").onclick=()=>{currentMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);renderCalendar();}; list("refresh-announcements").onclick=()=>location.reload();
const teacherCode = localStorage.getItem("teacherCode"); list("user-session").textContent = teacherCode ? `已登入（${teacherCode}）` : "已登入"; list("admin-entry").hidden = teacherCode !== "807"; list("sign-out-user").onclick = async () => { localStorage.removeItem("classHubAccess"); localStorage.removeItem("teacherCode"); try { await signOut(auth); } finally { location.replace("login.html"); } };
if(!configured)showSetupMessage();else onAuthStateChanged(auth,(user)=>{if(!user)signInAnonymously(auth);else{onSnapshot(collection(db,"calendarEvents"),(snap)=>{calendarEvents=snap.docs.map((item)=>({id:item.id,...item.data()}));renderCalendar();});onSnapshot(query(collection(db,"announcements"),orderBy("createdAt","desc")),(snap)=>renderAnnouncements(snap.docs.map((item)=>({id:item.id,...item.data()})),user.uid));onSnapshot(query(collection(db,"polls"),orderBy("createdAt","desc")),(snap)=>renderPolls(snap.docs.map((item)=>({id:item.id,...item.data()})),user.uid));onSnapshot(query(collection(db,"forms"),orderBy("createdAt","desc")),(snap)=>renderForms(snap.docs.map((item)=>({id:item.id,...item.data()})),user.uid));onSnapshot(query(collection(db,"lotteries"),orderBy("createdAt","desc")),(snap)=>renderLotteries(snap.docs.map((item)=>({id:item.id,...item.data()}))));}});
