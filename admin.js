import { auth, configured, db } from "./firebase.js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { addDoc, collection, deleteDoc, doc, getCountFromServer, getDocs, orderBy, query, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const error = document.getElementById("login-error");
const ACCOUNT_DOMAIN = "@qfm.kh.edu.tw";
const lines = (value) => value.split("\n").map((v) => v.trim()).filter(Boolean);
const escapeHtml = (text = "") => String(text).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
let pendingImportEvents = [];

async function publish(collectionName, data, form) {
  try { await addDoc(collection(db, collectionName), { ...data, createdAt: serverTimestamp() }); form.reset(); alert("已發布。網站將即時更新。"); }
  catch (e) { alert("發布失敗：" + e.message); }
}
async function renderActivity() {
  const root = document.getElementById("activity-list");
  const groups = [["announcements", "公告", "signatures", "簽名"], ["polls", "投票", "votes", "票"], ["forms", "表單", "responses", "份回覆"]];
  const output = [];
  for (const [name, label, child, suffix] of groups) {
    const snap = await getDocs(query(collection(db, name), orderBy("createdAt", "desc")));
    for (const item of snap.docs) {
      const count = await getCountFromServer(collection(db, name, item.id, child));
      output.push(`<li><strong>${label}</strong> ${escapeHtml(item.data().title || item.data().question)}：${count.data().count} ${suffix}</li>`);
    }
  }
  root.innerHTML = output.length ? `<ul>${output.join("")}</ul>` : "尚未發布任何內容。";
}
async function renderTeacherStatus() {
  const root = document.getElementById("teacher-status");
  const snapshot = await getDocs(collection(db, "teacherCredentials"));
  const credentials = new Map(snapshot.docs.map((item) => [item.id, item.data()]));
  root.innerHTML = `<ul>${Array.from({ length: 12 }, (_, index) => String(801 + index)).map((code) => { const configured = Boolean(credentials.get(code)?.pinHash); return `<li><span>${code}</span><strong class="${configured ? "is-set" : "is-empty"}">${configured ? "已設定" : "未設定"}</strong></li>`; }).join("")}</ul>`;
}
function unfoldIcs(text) { return text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/); }
function parseIcsDate(value) { const match = value?.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/); return match ? { date:`${match[1]}-${match[2]}-${match[3]}`, startTime:match[4] ? `${match[4]}:${match[5]}` : "" } : null; }
function parseIcs(text) { const events=[]; let current=null; unfoldIcs(text).forEach((line)=>{ if(line==="BEGIN:VEVENT") current={}; else if(line==="END:VEVENT" && current?.date && current.title) { events.push(current); current=null; } else if(current){ const divider=line.indexOf(":"); if(divider<0)return; const key=line.slice(0,divider).split(";")[0]; const value=line.slice(divider+1).replace(/\\n/g,"\n").replace(/\\,/g,","); if(key==="SUMMARY")current.title=value; if(key==="DESCRIPTION")current.description=value; if(key==="DTSTART"){const parsed=parseIcsDate(value);if(parsed)Object.assign(current,parsed);} } }); return events; }
function renderImportPreview() { const preview=document.getElementById("calendar-import-preview"), monthSelect=document.getElementById("import-month"), list=document.getElementById("import-preview-list"); const months=[...new Set(pendingImportEvents.map((event)=>event.date.slice(0,7)))].sort(); if(!months.includes(monthSelect.value)) monthSelect.innerHTML=months.map((month)=>`<option value="${month}">${month.replace("-"," 年 ")} 月</option>`).join(""); const month=monthSelect.value||months[0]; const rows=pendingImportEvents.map((event,index)=>({...event,index})).filter((event)=>event.date.startsWith(month)); list.innerHTML=rows.length?rows.map((event)=>`<article class="import-event"><label class="import-check"><input type="checkbox" data-import-field="selected" data-index="${event.index}" ${event.selected ? "checked" : ""} /> 匯入</label><label>日期<input type="date" data-import-field="date" data-index="${event.index}" value="${event.date}" /></label><label>時間<input type="time" data-import-field="startTime" data-index="${event.index}" value="${event.startTime||""}" /></label><label>事務名稱<input data-import-field="title" data-index="${event.index}" value="${escapeHtml(event.title)}" /></label><label>說明<textarea data-import-field="description" data-index="${event.index}" rows="2">${escapeHtml(event.description||"")}</textarea></label></article>`).join(""):"<p class=field-note>這個月份沒有事件。</p>"; preview.hidden=false; list.querySelectorAll("[data-import-field]").forEach((input)=>input.oninput=()=>{const event=pendingImportEvents[Number(input.dataset.index)]; event[input.dataset.importField]=input.type==="checkbox" ? input.checked : input.value;}); }
async function renderCalendarAdminList() { const root=document.getElementById("calendar-admin-list"); const snap=await getDocs(collection(db,"calendarEvents")); const events=snap.docs.map((item)=>({id:item.id,...item.data()})).sort((a,b)=>`${a.date}${a.startTime||""}`.localeCompare(`${b.date}${b.startTime||""}`)); root.innerHTML=events.length?`<h3>已發布事件</h3><ul>${events.slice(0,20).map((event)=>`<li><span><strong>${escapeHtml(event.date)}</strong> ${escapeHtml(event.title)}</span><button data-delete-event="${event.id}" class="secondary">刪除</button></li>`).join("")}</ul>`:"<p class=field-note>尚未建立行事曆事件。</p>"; root.querySelectorAll("[data-delete-event]").forEach((button)=>button.onclick=async()=>{if(confirm("確定刪除此行事曆事件？")){await deleteDoc(doc(db,"calendarEvents",button.dataset.deleteEvent));renderCalendarAdminList();}}); }
if (!configured) error.textContent = "尚未設定 Firebase，請先完成 firebase-config.js。";
else {
  onAuthStateChanged(auth, async (user) => {
    document.getElementById("login-panel").hidden = Boolean(user);
    document.getElementById("dashboard").hidden = !user;
    if (user) { document.getElementById("admin-email").textContent = user.email; renderActivity(); renderTeacherStatus(); renderCalendarAdminList(); }
  });
  document.getElementById("login-form").onsubmit = async (event) => {
    event.preventDefault(); error.textContent = "";
    const username = document.getElementById("username").value.trim().toLowerCase();
    try { await signInWithEmailAndPassword(auth, `${username}${ACCOUNT_DOMAIN}`, document.getElementById("password").value); }
    catch (e) { error.textContent = "登入失敗，請確認使用者名稱、密碼與 Firebase 驗證設定。"; }
  };
  document.getElementById("sign-out").onclick = () => signOut(auth);
  document.getElementById("announcement-form").onsubmit = (e) => { e.preventDefault(); const d = new FormData(e.target); publish("announcements", { title:d.get("title"), body:d.get("body"), requiresSignature:d.has("requiresSignature") }, e.target); };
  document.getElementById("poll-form").onsubmit = (e) => { e.preventDefault(); const d = new FormData(e.target); const options = lines(d.get("options")); if (options.length < 2) return alert("請至少填寫兩個選項。"); publish("polls", { question:d.get("question"), options, counts:Object.fromEntries(options.map((_, i) => [i, 0])) }, e.target); };
  document.getElementById("form-form").onsubmit = (e) => { e.preventDefault(); const d = new FormData(e.target); const fields = lines(d.get("fields")); if (!fields.length) return alert("請至少填寫一個欄位。"); publish("forms", { title:d.get("title"), description:d.get("description"), fields }, e.target); };
  document.getElementById("calendar-event-form").onsubmit = async (event) => { event.preventDefault(); const d=new FormData(event.target); await publish("calendarEvents",{title:d.get("title"),date:d.get("date"),startTime:d.get("startTime"),description:d.get("description")},event.target); renderCalendarAdminList(); };
  document.getElementById("calendar-import-form").onsubmit = async (event) => { event.preventDefault(); const message=document.getElementById("calendar-import-message"); message.textContent="讀取中…"; try { const file=document.getElementById("ical-file").files[0]; const url=document.getElementById("ical-url").value.trim(); const content=file ? await file.text() : await (await fetch(url)).text(); const events=parseIcs(content); if(!events.length)throw new Error("沒有可匯入的事件"); pendingImportEvents=events.map((item)=>({...item,selected:true})); renderImportPreview(); message.textContent=`已讀取 ${events.length} 個事件，請先檢查後再匯入。`; } catch (e) { message.textContent="讀取失敗。請確認使用公開 iCal 網址，或改用 .ics 檔案。"; } };
  document.getElementById("import-month").onchange = renderImportPreview;
  document.getElementById("confirm-calendar-import").onclick = async () => { const month=document.getElementById("import-month").value; const selected=pendingImportEvents.filter((event)=>event.selected&&event.date.startsWith(month)&&event.title); const message=document.getElementById("calendar-import-message"); if(!selected.length){message.textContent="請至少勾選這個月份的一個行程。";return;} message.textContent="匯入中…"; try { await Promise.all(selected.map(({selected,...event})=>addDoc(collection(db,"calendarEvents"),{...event,importedAt:serverTimestamp()}))); const imported=new Set(selected); pendingImportEvents=pendingImportEvents.filter((event)=>!imported.has(event)); message.textContent=`已匯入 ${month} 的 ${selected.length} 個事件。`; if(pendingImportEvents.length)renderImportPreview();else document.getElementById("calendar-import-preview").hidden=true; renderCalendarAdminList(); } catch(e) { message.textContent="匯入失敗，請稍後再試。"; } };
  document.getElementById("reset-teacher-form").onsubmit = async (event) => { event.preventDefault(); const code = document.getElementById("reset-teacher-code").value; const message = document.getElementById("reset-message"); if (!confirm(`確定重置導師 ${code} 的驗證碼？`)) return; message.textContent = "重置中…"; try { await setDoc(doc(db, "teacherCredentials", code), { pinHash: null, resetAt: serverTimestamp() }, { merge: true }); message.textContent = `${code} 已重置為未設定。`; renderTeacherStatus(); } catch (e) { message.textContent = "重置失敗，請確認管理者帳號已登入。"; } };
}
