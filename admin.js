import { auth, configured, db } from "./firebase.js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { addDoc, collection, deleteDoc, doc, getCountFromServer, getDocs, orderBy, query, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const error = document.getElementById("login-error");
const ACCOUNT_DOMAIN = "@qfm.kh.edu.tw";
const lines = (value) => value.split("\n").map((v) => v.trim()).filter(Boolean);
const escapeHtml = (text = "") => String(text).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));

async function publish(collectionName, data, form) { try { await addDoc(collection(db, collectionName), { ...data, createdAt: serverTimestamp() }); form.reset(); alert("已發布。網站將即時更新。"); } catch (e) { alert("發布失敗：" + e.message); } }
async function renderActivity() {
  const root = document.getElementById("activity-list"); const groups = [["announcements", "公告", "signatures", "簽名"], ["polls", "投票", "votes", "票"], ["forms", "表單", "responses", "份回覆"]]; const output=[];
  for (const [name,label,child,suffix] of groups) { const snap=await getDocs(query(collection(db,name),orderBy("createdAt","desc"))); for(const item of snap.docs){const count=await getCountFromServer(collection(db,name,item.id,child));output.push(`<li><strong>${label}</strong> ${escapeHtml(item.data().title||item.data().question)}：${count.data().count} ${suffix}</li>`);} }
  root.innerHTML=output.length?`<ul>${output.join("")}</ul>`:"尚未發布任何內容。";
}
async function renderTeacherStatus() { const root=document.getElementById("teacher-status"); const snapshot=await getDocs(collection(db,"teacherCredentials")); const credentials=new Map(snapshot.docs.map((item)=>[item.id,item.data()])); root.innerHTML=`<ul>${Array.from({length:12},(_,index)=>String(801+index)).map((code)=>{const isSet=Boolean(credentials.get(code)?.pinHash);return `<li><span>${code}</span><strong class="${isSet?"is-set":"is-empty"}">${isSet?"已設定":"未設定"}</strong></li>`;}).join("")}</ul>`; }
async function renderCalendarAdminList() { const root=document.getElementById("calendar-admin-list"); const snap=await getDocs(collection(db,"calendarEvents")); const events=snap.docs.map((item)=>({id:item.id,...item.data()})).sort((a,b)=>`${a.date}${a.startTime||""}`.localeCompare(`${b.date}${b.startTime||""}`)); root.innerHTML=events.length?`<h3>已發布事件</h3><ul>${events.slice(0,20).map((event)=>`<li><span><strong>${escapeHtml(event.date)}</strong> ${escapeHtml(event.title)}</span><button data-delete-event="${event.id}" class="secondary">刪除</button></li>`).join("")}</ul>`:"<p class=field-note>尚未建立行事曆事件。</p>"; root.querySelectorAll("[data-delete-event]").forEach((button)=>button.onclick=async()=>{if(confirm("確定刪除此行事曆事件？")){await deleteDoc(doc(db,"calendarEvents",button.dataset.deleteEvent));renderCalendarAdminList();}}); }
function chooseAdminPage(page) { document.querySelectorAll(".admin-feature").forEach((section)=>section.classList.toggle("is-active",section.dataset.adminPage===page)); document.querySelectorAll("[data-admin-nav]").forEach((link)=>link.classList.toggle("is-selected",link.dataset.adminNav===page)); window.scrollTo({top:0,behavior:"smooth"}); }

if (!configured) error.textContent="尚未設定 Firebase，請先完成 firebase-config.js。";
else {
  onAuthStateChanged(auth,async(user)=>{const adminUser=user&&!user.isAnonymous;document.getElementById("login-panel").hidden=Boolean(adminUser);document.getElementById("dashboard").hidden=!adminUser;document.getElementById("admin-nav").hidden=!adminUser;if(adminUser){document.getElementById("admin-email").textContent=user.email;chooseAdminPage("calendar");renderActivity();renderTeacherStatus();renderCalendarAdminList();}});
  document.getElementById("login-form").onsubmit=async(event)=>{event.preventDefault();error.textContent="";const username=document.getElementById("username").value.trim().toLowerCase();try{await signInWithEmailAndPassword(auth,`${username}${ACCOUNT_DOMAIN}`,document.getElementById("password").value);}catch(e){error.textContent="登入失敗，請確認使用者名稱、密碼與 Firebase 驗證設定。";}};
  document.getElementById("sign-out").onclick=()=>signOut(auth);
  document.getElementById("announcement-form").onsubmit=(event)=>{event.preventDefault();const data=new FormData(event.target);publish("announcements",{title:data.get("title"),body:data.get("body"),requiresSignature:data.has("requiresSignature")},event.target);};
  document.getElementById("poll-form").onsubmit=(event)=>{event.preventDefault();const data=new FormData(event.target),options=lines(data.get("options"));if(options.length<2)return alert("請至少填寫兩個選項。");publish("polls",{question:data.get("question"),options,counts:Object.fromEntries(options.map((_,index)=>[index,0]))},event.target);};
  document.getElementById("form-form").onsubmit=(event)=>{event.preventDefault();const data=new FormData(event.target),fields=lines(data.get("fields"));if(!fields.length)return alert("請至少填寫一個欄位。");publish("forms",{title:data.get("title"),description:data.get("description"),fields},event.target);};
  document.getElementById("calendar-event-form").onsubmit=async(event)=>{event.preventDefault();const data=new FormData(event.target);await publish("calendarEvents",{title:data.get("title"),date:data.get("date"),startTime:data.get("startTime"),description:data.get("description")},event.target);renderCalendarAdminList();};
  document.getElementById("load-school-calendar").onclick=()=>{document.getElementById("admin-school-calendar").hidden=false;};
  document.querySelectorAll("[data-admin-nav]").forEach((link)=>link.onclick=(event)=>{event.preventDefault();chooseAdminPage(link.dataset.adminNav);});
  document.getElementById("reset-teacher-form").onsubmit=async(event)=>{event.preventDefault();const code=document.getElementById("reset-teacher-code").value,message=document.getElementById("reset-message");if(!confirm(`確定重置導師 ${code} 的驗證碼？`))return;message.textContent="重置中…";try{await setDoc(doc(db,"teacherCredentials",code),{pinHash:null,resetAt:serverTimestamp()},{merge:true});message.textContent=`${code} 已重置為未設定。`;renderTeacherStatus();}catch(e){message.textContent="重置失敗，請確認管理者帳號已登入。";}};
}
