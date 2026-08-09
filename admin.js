import { auth, configured, db } from "./firebase.js";
import { firebaseConfig } from "./firebase-config.js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const ACCOUNT_DOMAIN = "@qfm.kh.edu.tw";
const SCHOOL_CALENDAR_ID = "qisho218odg6vcgd3up3dpp6qg@group.calendar.google.com";
const TEACHER_CODES = Array.from({ length: 12 }, (_, index) => String(801 + index));
let pendingSchoolEvents = [];
let activityRefreshTimer = null;

const error = document.getElementById("login-error");
const schoolMessage = document.getElementById("school-calendar-message");
const schoolPreview = document.getElementById("school-import-preview");
const schoolMonth = document.getElementById("school-import-month");
const schoolList = document.getElementById("school-import-list");
const lines = (value) => value.split("\n").map((item) => item.trim()).filter(Boolean);
const escapeHtml = (text = "") => String(text).replace(/[&<'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

function eventDateTime(value) {
  if (value?.date) return { date: value.date, startTime: "" };
  if (value?.dateTime) return { date: value.dateTime.slice(0, 10), startTime: value.dateTime.slice(11, 16) };
  return null;
}

function getSchoolMonths() {
  return [...new Set(pendingSchoolEvents.map((event) => event.sourceMonth))].sort();
}

function renderSchoolPreview() {
  const months = getSchoolMonths();
  if (!months.length) {
    schoolPreview.hidden = true;
    return;
  }

  const currentMonth = months.includes(schoolMonth.value) ? schoolMonth.value : months[0];
  schoolMonth.innerHTML = months.map((month) => `<option value="${month}" ${month === currentMonth ? "selected" : ""}>${month.replace("-", " 年 ")} 月</option>`).join("");
  const visibleEvents = pendingSchoolEvents.filter((event) => event.sourceMonth === currentMonth);
  schoolList.innerHTML = visibleEvents.map((event) => {
    const index = pendingSchoolEvents.indexOf(event);
    return `<article class="import-event">
      <label class="import-check"><input type="checkbox" data-import-field="selected" data-index="${index}" ${event.selected ? "checked" : ""} /> 匯入此行程</label>
      <div class="import-event-fields">
        <label>日期<input type="date" data-import-field="date" data-index="${index}" value="${escapeHtml(event.date)}" /></label>
        <label>時間<input type="time" data-import-field="startTime" data-index="${index}" value="${escapeHtml(event.startTime)}" /></label>
      </div>
      <label>名稱<input data-import-field="title" data-index="${index}" maxlength="80" value="${escapeHtml(event.title)}" /></label>
      <label>說明<textarea data-import-field="description" data-index="${index}" rows="2" maxlength="300">${escapeHtml(event.description)}</textarea></label>
    </article>`;
  }).join("") || "<p class=\"field-note\">這個月份沒有可匯入的行程。</p>";
  schoolPreview.hidden = false;

  schoolList.querySelectorAll("[data-import-field]").forEach((input) => {
    const change = () => {
      const event = pendingSchoolEvents[Number(input.dataset.index)];
      event[input.dataset.importField] = input.dataset.importField === "selected" ? input.checked : input.value;
    };
    input.onchange = change;
    input.oninput = change;
  });
}

async function publish(collectionName, data, form) {
  try {
    await addDoc(collection(db, collectionName), { ...data, createdAt: serverTimestamp() });
    form.reset();
    alert("已發布。");
  } catch (exception) {
    alert(`發布失敗：${exception.message}`);
  }
}

async function renderActivity() {
  const root = document.getElementById("activity-list");
  const groups = [["announcements", "公告", "signatures", "簽收"], ["polls", "投票", "votes", "投票"], ["forms", "登記", "responses", "登記"]];
  const output = [];
  for (const [name, label, child, suffix] of groups) {
    const snapshot = await getDocs(query(collection(db, name), orderBy("createdAt", "desc")));
    for (const item of snapshot.docs) {
      if (name === "announcements" && !item.data().requiresSignature) {
        output.push(`<li class="activity-item"><strong>${label}</strong> ${escapeHtml(item.data().title)}<span class="action-summary">此公告無須簽收</span></li>`);
        continue;
      }
      const actions = await getDocs(collection(db, name, item.id, child));
      const completed = new Set(actions.docs.map((action) => action.data().teacherCode).filter((code) => TEACHER_CODES.includes(code)));
      const completedCodes = TEACHER_CODES.filter((code) => completed.has(code));
      const pendingCodes = TEACHER_CODES.filter((code) => !completed.has(code));
      const oldRecords = actions.size - completedCodes.length;
      output.push(`<li class="activity-item"><strong>${label}</strong> ${escapeHtml(item.data().title || item.data().question)}<span class="action-summary">已${suffix}：${completedCodes.join("、") || "尚無"}</span><span class="action-summary is-pending">未${suffix}：${pendingCodes.join("、") || "無"}</span>${oldRecords > 0 ? `<small>另有 ${oldRecords} 筆舊資料未記錄班級代碼。</small>` : ""}</li>`);
    }
  }
  root.innerHTML = output.length ? `<ul>${output.join("")}</ul>` : "<p class=\"field-note\">目前還沒有公告、投票或登記活動。</p>";
}

async function renderTeacherStatus() {
  const root = document.getElementById("teacher-status");
  const snapshot = await getDocs(collection(db, "teacherCredentials"));
  const credentials = new Map(snapshot.docs.map((item) => [item.id, item.data()]));
  root.innerHTML = `<ul>${Array.from({ length: 12 }, (_, index) => String(801 + index)).map((code) => {
    const isSet = Boolean(credentials.get(code)?.pinHash);
    return `<li><span>${code}</span><strong class="${isSet ? "is-set" : "is-empty"}">${isSet ? "已設定" : "未設定"}</strong></li>`;
  }).join("")}</ul>`;
}

async function renderCalendarAdminList() {
  const root = document.getElementById("calendar-admin-list");
  const snapshot = await getDocs(collection(db, "calendarEvents"));
  const events = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => `${a.date}${a.startTime || ""}`.localeCompare(`${b.date}${b.startTime || ""}`));
  root.innerHTML = events.length ? `<h3>已發布事件</h3><ul>${events.slice(0, 30).map((event) => `<li><span><strong>${escapeHtml(event.date)}</strong> ${escapeHtml(event.title)}</span><button data-delete-event="${event.id}" class="secondary">刪除</button></li>`).join("")}</ul>` : "<p class=\"field-note\">尚未建立行事曆事件。</p>";
  root.querySelectorAll("[data-delete-event]").forEach((button) => {
    button.onclick = async () => {
      if (confirm("確定刪除此行事曆事件？")) {
        await deleteDoc(doc(db, "calendarEvents", button.dataset.deleteEvent));
        renderCalendarAdminList();
      }
    };
  });
}

function chooseAdminPage(page) {
  document.querySelectorAll(".admin-feature").forEach((section) => section.classList.toggle("is-active", section.dataset.adminPage === page));
  document.querySelectorAll("[data-admin-nav]").forEach((link) => link.classList.toggle("is-selected", link.dataset.adminNav === page));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function readSchoolCalendar() {
  schoolMessage.textContent = "正在讀取學校行事曆…";
  schoolPreview.hidden = true;
  try {
    const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(SCHOOL_CALENDAR_ID)}/events?key=${encodeURIComponent(firebaseConfig.apiKey)}&singleEvents=true&orderBy=startTime&maxResults=2500&timeMin=${encodeURIComponent(new Date(new Date().getFullYear(), 0, 1).toISOString())}`;
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`Google Calendar ${response.status}`);
    const payload = await response.json();
    pendingSchoolEvents = (payload.items || []).filter((item) => item.status !== "cancelled").map((item) => {
      const start = eventDateTime(item.start);
      return start && { ...start, sourceMonth: start.date.slice(0, 7), title: item.summary || "未命名行程", description: item.description || "", selected: true };
    }).filter(Boolean);
    if (!pendingSchoolEvents.length) {
      schoolMessage.textContent = "讀取完成，但找不到今年起可匯入的學校行程。";
      return;
    }
    renderSchoolPreview();
    schoolMessage.textContent = `已讀取 ${pendingSchoolEvents.length} 筆行程。請逐月勾選與修改後再匯入。`;
  } catch (exception) {
    schoolMessage.textContent = "讀取失敗。請確認學校行事曆已公開，並在 Google Cloud 啟用 Google Calendar API 後再試一次。";
    console.error(exception);
  }
}

async function importSchoolMonth() {
  const month = schoolMonth.value;
  const selected = pendingSchoolEvents.filter((event) => event.selected && event.sourceMonth === month && event.title.trim());
  if (!selected.length) {
    schoolMessage.textContent = "請先勾選至少一筆有名稱的行程。";
    return;
  }
  if (!confirm(`確定匯入 ${selected.length} 筆 ${month} 的行程到本系統行事曆？`)) return;
  try {
    await Promise.all(selected.map(({ selected: ignored, sourceMonth: ignoredMonth, ...event }) => addDoc(collection(db, "calendarEvents"), { ...event, source: "school-calendar", importedAt: serverTimestamp(), createdAt: serverTimestamp() })));
    pendingSchoolEvents = pendingSchoolEvents.filter((event) => !selected.includes(event));
    renderSchoolPreview();
    renderCalendarAdminList();
    schoolMessage.textContent = `已將 ${selected.length} 筆行程匯入 Firebase 行事曆。`;
  } catch (exception) {
    schoolMessage.textContent = `匯入失敗：${exception.message}`;
  }
}

if (!configured) {
  error.textContent = "尚未設定 Firebase，請先填寫 firebase-config.js。";
} else {
  onAuthStateChanged(auth, async (user) => {
    const adminUser = user && !user.isAnonymous;
    document.getElementById("login-panel").hidden = Boolean(adminUser);
    document.getElementById("dashboard").hidden = !adminUser;
    document.getElementById("admin-nav").hidden = !adminUser;
    if (adminUser) {
      document.getElementById("admin-email").textContent = user.email;
      chooseAdminPage("calendar");
      renderActivity();
      if (!activityRefreshTimer) activityRefreshTimer = setInterval(renderActivity, 30000);
      renderTeacherStatus();
      renderCalendarAdminList();
    } else if (activityRefreshTimer) {
      clearInterval(activityRefreshTimer);
      activityRefreshTimer = null;
    }
  });

  document.getElementById("login-form").onsubmit = async (event) => {
    event.preventDefault();
    error.textContent = "";
    const username = document.getElementById("username").value.trim().toLowerCase();
    try {
      await signInWithEmailAndPassword(auth, `${username}${ACCOUNT_DOMAIN}`, document.getElementById("password").value);
    } catch (exception) {
      error.textContent = "登入失敗，請確認帳號、密碼與 Firebase 驗證設定。";
    }
  };
  document.getElementById("sign-out").onclick = () => signOut(auth);
  document.getElementById("announcement-form").onsubmit = (event) => { event.preventDefault(); const data = new FormData(event.target); publish("announcements", { title: data.get("title"), body: data.get("body"), requiresSignature: data.has("requiresSignature") }, event.target); };
  document.getElementById("poll-form").onsubmit = (event) => { event.preventDefault(); const data = new FormData(event.target); const options = lines(data.get("options")); if (options.length < 2) return alert("請至少輸入兩個投票選項。"); publish("polls", { question: data.get("question"), options, counts: Object.fromEntries(options.map((_, index) => [index, 0])) }, event.target); };
  document.getElementById("form-form").onsubmit = (event) => { event.preventDefault(); const data = new FormData(event.target); const fields = lines(data.get("fields")); if (!fields.length) return alert("請至少輸入一個登記欄位。"); publish("forms", { title: data.get("title"), description: data.get("description"), fields }, event.target); };
  document.getElementById("calendar-event-form").onsubmit = async (event) => { event.preventDefault(); const data = new FormData(event.target); await publish("calendarEvents", { title: data.get("title"), date: data.get("date"), startTime: data.get("startTime"), description: data.get("description") }, event.target); renderCalendarAdminList(); };
  document.getElementById("read-school-calendar").onclick = readSchoolCalendar;
  document.getElementById("confirm-school-import").onclick = importSchoolMonth;
  schoolMonth.onchange = renderSchoolPreview;
  document.querySelectorAll("[data-admin-nav]").forEach((link) => { link.onclick = (event) => { event.preventDefault(); chooseAdminPage(link.dataset.adminNav); }; });
  document.getElementById("reset-teacher-form").onsubmit = async (event) => {
    event.preventDefault();
    const code = document.getElementById("reset-teacher-code").value;
    const message = document.getElementById("reset-message");
    if (!confirm(`確定重置導師 ${code} 的驗證碼？`)) return;
    message.textContent = "重置中…";
    try {
      await setDoc(doc(db, "teacherCredentials", code), { pinHash: null, resetAt: serverTimestamp() }, { merge: true });
      message.textContent = `${code} 已重置為未設定驗證碼。`;
      renderTeacherStatus();
    } catch (exception) {
      message.textContent = `重置失敗：${exception.message}`;
    }
  };
}
