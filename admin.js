import { auth, configured, db } from "./firebase.js";
import { firebaseConfig } from "./firebase-config.js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const ACCOUNT_DOMAIN = "@qfm.kh.edu.tw";
const SCHOOL_CALENDAR_ID = "qisho218odg6vcgd3up3dpp6qg@group.calendar.google.com";
const TEACHER_CODES = Array.from({ length: 12 }, (_, index) => String(801 + index));
let pendingSchoolEvents = [];
let activityRefreshTimer = null;
let adminCurrentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let adminCalendarEvents = [];
let pendingLottery = null;

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

function calendarDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function renderAdminCalendar() {
  const year = adminCurrentMonth.getFullYear();
  const month = adminCurrentMonth.getMonth();
  const title = document.getElementById("admin-calendar-title");
  const grid = document.getElementById("admin-calendar-grid");
  title.textContent = `${year} 年 ${month + 1} 月`;
  grid.innerHTML = "";
  const firstDay = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayKey = calendarDate(today.getFullYear(), today.getMonth(), today.getDate());
  for (let slot = 0; slot < 42; slot += 1) {
    const day = slot - firstDay + 1;
    const cell = document.createElement("div");
    cell.className = "admin-calendar-day";
    if (day < 1 || day > days) {
      cell.classList.add("is-empty-day");
    } else {
      const key = calendarDate(year, month, day);
      if (key === todayKey) cell.classList.add("is-today");
      const events = adminCalendarEvents.filter((event) => event.date === key);
      cell.innerHTML = `<time>${day}</time>${events.slice(0, 3).map((event) => `<span class="admin-calendar-event" title="${escapeHtml(event.title)}">${escapeHtml(event.title)}</span>`).join("")}${events.length > 3 ? `<span class="more-events">另有 ${events.length - 3} 項</span>` : ""}`;
      cell.querySelectorAll(".admin-calendar-event").forEach((node, index) => {
        node.tabIndex = 0;
        node.setAttribute("role", "button");
        node.style.cursor = "pointer";
        const edit = () => openAdminEventEditor(events[index]);
        node.onclick = edit;
        node.onkeydown = (keyboard) => { if (keyboard.key === "Enter" || keyboard.key === " ") { keyboard.preventDefault(); edit(); } };
      });
    }
    grid.append(cell);
  }
}

function openAdminEventEditor(event) {
  const dialog = document.createElement("dialog");
  dialog.className = "event-dialog admin-event-editor";
  dialog.style.cssText = "width:min(92vw,480px);padding:0;border:0;border-radius:16px;box-shadow:0 16px 42px #18324740;color:#163348";
  dialog.innerHTML = `<form method="dialog" style="position:relative;display:grid;gap:.85rem;padding:1.35rem"><button class="dialog-close" type="button" aria-label="關閉" style="position:absolute;top:.65rem;right:.65rem;width:34px;min-height:34px;padding:0;border-radius:50%;background:#edf5f8;color:#185a87;font-size:1.45rem">×</button><p class="eyebrow">編輯年級行事曆</p><h2>修改事件</h2><label>標題<input name="title" maxlength="80" required value="${escapeHtml(event.title)}" /></label><label>日期<input name="date" type="date" required value="${escapeHtml(event.date)}" /></label><label>時間（選填）<input name="startTime" type="time" value="${escapeHtml(event.startTime || "")}" /></label><label>說明（選填）<textarea name="description" rows="4" maxlength="300">${escapeHtml(event.description || "")}</textarea></label><button type="submit">儲存修改</button></form>`;
  document.body.append(dialog);
  dialog.querySelector(".dialog-close").onclick = () => dialog.close();
  dialog.onclose = () => dialog.remove();
  dialog.onclick = (click) => { if (click.target === dialog) dialog.close(); };
  dialog.querySelector("form").onsubmit = async (submit) => {
    submit.preventDefault();
    const data = new FormData(submit.currentTarget);
    try {
      await updateDoc(doc(db, "calendarEvents", event.id), { title: data.get("title").trim(), date: data.get("date"), startTime: data.get("startTime"), description: data.get("description").trim(), updatedAt: serverTimestamp() });
      dialog.close();
      renderCalendarAdminList();
    } catch (exception) {
      alert(`儲存失敗：${exception.message}`);
    }
  };
  if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
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
      <label>標題<input data-import-field="title" data-index="${index}" maxlength="80" value="${escapeHtml(event.title)}" /></label>
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
  const groups = [["announcements", "公告", "signatures", "簽收", "announcement-activity"], ["polls", "投票", "votes", "投票", "poll-activity"], ["forms", "登記", "responses", "登記", "form-activity"]];
  for (const [name, label, child, suffix, target] of groups) {
    const root = document.getElementById(target);
    const output = [];
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
    root.innerHTML = output.length ? `<ul>${output.join("")}</ul>` : "<p class=\"field-note\">目前尚未發布任何內容。</p>";
  }
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
  adminCalendarEvents = events;
  renderAdminCalendar();
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

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function showLotteryStage() {
  const stage = document.getElementById("lottery-stage");
  const outputCount = pendingLottery.mode === "rank" ? pendingLottery.classes.length : pendingLottery.results.length;
  document.getElementById("lottery-stage-heading").textContent = pendingLottery.title;
  document.getElementById("lottery-stage-summary").textContent = `共 ${pendingLottery.classes.length} 個班級參與，本次${pendingLottery.mode === "rank" ? "將公布完整排序" : `抽出 ${outputCount} 個班級`}。`;
  document.getElementById("lottery-stage-title").textContent = "抽籤準備完成";
  document.getElementById("lottery-tumbler").textContent = "?";
  document.getElementById("lottery-reveal-list").innerHTML = "";
  document.getElementById("lottery-start").hidden = false;
  document.getElementById("lottery-start").disabled = false;
  document.getElementById("lottery-start").textContent = "開始抽籤";
  document.getElementById("lottery-cancel").hidden = false;
  stage.className = "lottery-stage";
  stage.hidden = false;
  stage.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function runLotteryAnimation() {
  if (!pendingLottery) return;
  const stage = document.getElementById("lottery-stage");
  const start = document.getElementById("lottery-start");
  const cancel = document.getElementById("lottery-cancel");
  const title = document.getElementById("lottery-stage-title");
  const tumbler = document.getElementById("lottery-tumbler");
  const revealList = document.getElementById("lottery-reveal-list");
  start.disabled = true;
  cancel.hidden = true;
  stage.className = "lottery-stage is-shuffling";
  for (let seconds = 3; seconds >= 1; seconds -= 1) {
    title.textContent = `打亂班級中… ${seconds}`;
    tumbler.textContent = shuffle(pendingLottery.classes).slice(0, 4).join(" · ");
    await wait(1000);
  }
  stage.className = "lottery-stage is-drawing";
  title.textContent = pendingLottery.mode === "rank" ? "開始公布排序" : "開始公布結果";
  for (let index = 0; index < pendingLottery.results.length; index += 1) {
    const result = pendingLottery.results[index];
    tumbler.textContent = result;
    const item = document.createElement("li");
    item.innerHTML = `<span>${pendingLottery.mode === "rank" ? `第 ${index + 1} 順位` : `第 ${index + 1} 個`}</span><strong>${escapeHtml(result)}</strong>`;
    revealList.append(item);
    await wait(1000);
  }
  try {
    await addDoc(collection(db, "lotteries"), { ...pendingLottery, createdAt: serverTimestamp() });
    stage.className = "lottery-stage is-finished";
    title.textContent = "抽籤完成，結果已發布";
    tumbler.textContent = "完成";
    start.hidden = true;
    cancel.hidden = false;
    cancel.textContent = "進行下一次抽籤";
    renderLotteryAdminList();
  } catch (exception) {
    stage.className = "lottery-stage";
    title.textContent = "發布失敗";
    tumbler.textContent = "!";
    start.disabled = false;
    start.textContent = "重新發布抽籤結果";
    cancel.hidden = false;
    alert(`發布失敗：${exception.message}`);
    return;
  }
  pendingLottery = null;
}

async function renderLotteryAdminList() {
  const root = document.getElementById("lottery-admin-list");
  const snapshot = await getDocs(query(collection(db, "lotteries"), orderBy("createdAt", "desc")));
  const lotteries = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  root.innerHTML = lotteries.length ? `<h3>已發布抽籤</h3><ul>${lotteries.map((lottery) => `<li><span><strong>${escapeHtml(lottery.title)}</strong>：${escapeHtml((lottery.results || []).join("、"))}</span><button data-delete-lottery="${lottery.id}" class="secondary">刪除</button></li>`).join("")}</ul>` : "<p class=\"field-note\">尚未發布抽籤結果。</p>";
  root.querySelectorAll("[data-delete-lottery]").forEach((button) => {
    button.onclick = async () => {
      if (confirm("確定刪除此抽籤結果？")) {
        await deleteDoc(doc(db, "lotteries", button.dataset.deleteLottery));
        renderLotteryAdminList();
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
  const year = adminCurrentMonth.getFullYear();
  const month = adminCurrentMonth.getMonth();
  const monthLabel = `${year} 年 ${month + 1} 月`;
  const monthStart = new Date(year, month, 1);
  const nextMonthStart = new Date(year, month + 1, 1);
  schoolMessage.textContent = `正在讀取 ${monthLabel} 的學校行事曆…`;
  schoolPreview.hidden = true;
  try {
    const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(SCHOOL_CALENDAR_ID)}/events?key=${encodeURIComponent(firebaseConfig.apiKey)}&singleEvents=true&orderBy=startTime&maxResults=2500&timeMin=${encodeURIComponent(monthStart.toISOString())}&timeMax=${encodeURIComponent(nextMonthStart.toISOString())}`;
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`Google Calendar ${response.status}`);
    const payload = await response.json();
    pendingSchoolEvents = (payload.items || []).filter((item) => item.status !== "cancelled").map((item) => {
      const start = eventDateTime(item.start);
      return start && { ...start, sourceMonth: start.date.slice(0, 7), title: item.summary || "未命名行程", description: item.description || "", selected: true };
    }).filter(Boolean);
    if (!pendingSchoolEvents.length) {
      schoolMessage.textContent = `讀取完成，但 ${monthLabel} 沒有可匯入的學校行程。`;
      return;
    }
    renderSchoolPreview();
    schoolMessage.textContent = `已讀取 ${monthLabel} 的 ${pendingSchoolEvents.length} 筆行程。請勾選與修改後再匯入。`;
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
      renderLotteryAdminList();
    } else if (activityRefreshTimer) {
      clearInterval(activityRefreshTimer);
      activityRefreshTimer = null;
    }
  });

  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  usernameInput.oninput = () => { usernameInput.value = usernameInput.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""); };
  passwordInput.oninput = () => { passwordInput.value = passwordInput.value.replace(/\D/g, ""); };
  document.getElementById("login-form").onsubmit = async (event) => {
    event.preventDefault();
    error.textContent = "";
    const username = usernameInput.value.trim();
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
  document.getElementById("lottery-source").onchange = (event) => { document.getElementById("lottery-custom-wrap").hidden = event.target.value !== "custom"; };
  document.querySelector("#lottery-form select[name='mode']").onchange = (event) => { document.getElementById("lottery-count-wrap").hidden = event.target.value === "rank"; };
  document.getElementById("lottery-form").onsubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    const source = data.get("source");
    const customClasses = data.getAll("customClasses");
    const classes = source === "all" ? TEACHER_CODES : customClasses.filter((code) => TEACHER_CODES.includes(code));
    if (!classes.length) return alert("請至少勾選一個參與班級。");
    const mode = data.get("mode");
    const count = Math.min(Number(data.get("count")), classes.length);
    const results = shuffle(classes).slice(0, mode === "rank" ? classes.length : count);
    pendingLottery = { title: data.get("title").trim(), source, classes, mode, results };
    showLotteryStage();
  };
  document.getElementById("lottery-start").onclick = runLotteryAnimation;
  document.getElementById("lottery-cancel").onclick = () => {
    pendingLottery = null;
    document.getElementById("lottery-stage").hidden = true;
    document.getElementById("lottery-form").reset();
    document.getElementById("lottery-custom-wrap").hidden = true;
    document.getElementById("lottery-count-wrap").hidden = false;
  };
  document.getElementById("calendar-event-form").onsubmit = async (event) => { event.preventDefault(); const data = new FormData(event.target); await publish("calendarEvents", { title: data.get("title"), date: data.get("date"), startTime: data.get("startTime"), description: data.get("description") }, event.target); renderCalendarAdminList(); };
  document.getElementById("read-school-calendar").onclick = readSchoolCalendar;
  document.getElementById("confirm-school-import").onclick = importSchoolMonth;
  schoolMonth.onchange = renderSchoolPreview;
  document.getElementById("admin-calendar-prev").onclick = () => { adminCurrentMonth = new Date(adminCurrentMonth.getFullYear(), adminCurrentMonth.getMonth() - 1, 1); renderAdminCalendar(); };
  document.getElementById("admin-calendar-next").onclick = () => { adminCurrentMonth = new Date(adminCurrentMonth.getFullYear(), adminCurrentMonth.getMonth() + 1, 1); renderAdminCalendar(); };
  document.getElementById("admin-calendar-today").onclick = () => { adminCurrentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); renderAdminCalendar(); };
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
