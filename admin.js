import { auth, configured, db } from "./firebase.js";
import { firebaseConfig } from "./firebase-config.js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const ACCOUNT_DOMAIN = "@qfm.kh.edu.tw";
const SCHOOL_CALENDAR_ID = "qisho218odg6vcgd3up3dpp6qg@group.calendar.google.com";
const TEACHER_CODES = Array.from({ length: 12 }, (_, index) => String(801 + index));
let pendingSchoolEvents = [];
let activityRefreshTimer = null;
let adminCurrentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let adminCalendarEvents = [];
let classAffairsTemplates = [];
let classAffairsGroups = {};
let selectedClassAffairsDatasetId = "";
let editingClassAffairRecordId = null;
let editingClassAffairsDatasetId = null;
let classAffairsStatisticsSourceId = "";
let classAffairsView = "overview";
let documentCalendarEvents = {};
let activeDocumentView = "calendar";
let documentExamSchedule = null;

const DOCUMENT_CALENDAR_ROWS = [
  ["8月", "開學準備週", [23, 24, 25, 26, 27, 28, 29]], ["8月", "一", [30, 31, 1, 2, 3, 4, 5]],
  ["9月", "二", [6, 7, 8, 9, 10, 11, 12]], ["9月", "三", [13, 14, 15, 16, 17, 18, 19]], ["9月", "四", [20, 21, 22, 23, 24, 25, 26]], ["9月", "五", [27, 28, 29, 30, 1, 2, 3]],
  ["10月", "六", [4, 5, 6, 7, 8, 9, 10]], ["10月", "七", [11, 12, 13, 14, 15, 16, 17]], ["10月", "八", [18, 19, 20, 21, 22, 23, 24]], ["10月", "九", [25, 26, 27, 28, 29, 30, 31]],
  ["11月", "十", [1, 2, 3, 4, 5, 6, 7]], ["11月", "十一", [8, 9, 10, 11, 12, 13, 14]], ["11月", "十二", [15, 16, 17, 18, 19, 20, 21]], ["11月", "十三", [22, 23, 24, 25, 26, 27, 28]], ["11月", "十四", [29, 30, 1, 2, 3, 4, 5]],
  ["12月", "十五", [6, 7, 8, 9, 10, 11, 12]], ["12月", "十六", [13, 14, 15, 16, 17, 18, 19]], ["12月", "十七", [20, 21, 22, 23, 24, 25, 26]], ["12月", "十八", [27, 28, 29, 30, 31, 1, 2]],
  ["1月", "十九", [3, 4, 5, 6, 7, 8, 9]], ["1月", "二十", [10, 11, 12, 13, 14, 15, 16]], ["1月", "二一", [17, 18, 19, 20, 21, 22, 23]],
];
const DEFAULT_DOCUMENT_CALENDAR_EVENTS = {
  0: "8/28 全校返校日", 1: "8/31 開學\n9/1～9/2、9/4 補考\n9/3（午休）全校幹部訓練", 2: "9/7 第8節輔導課、學習扶助開始\n9/11 幹部訓練・租稅講座", 3: "9/14 SH150 活動開始\n9/18 親師座談", 4: "9/21 防震防災演習\n9/23 數學作業抽查", 5: "10/2 中秋節放假", 7: "10/13～10/14 第一次段考", 8: "10/20～10/21 第一次段考\n10/22 服務學習（早自修）", 9: "10/26～10/30 校內國語文競賽\n10/28 自然作業抽查", 10: "11/4 流感疫苗施打\n11/4 歷史作業抽查", 11: "11/9 八年級職業試探（上午，801～805）\n11/12 聯絡簿抽查（八年級）", 12: "11/16 八年級職業試探（上午，806～810）\n11/16～11/20 運動會預賽\n11/18 地理作業抽查", 14: "12/2～12/3 第二次段考\n12/4 服務學習（早自修）", 15: "12/9 國文作業抽查", 16: "12/17 校慶預演\n12/18 校慶運動會", 17: "12/23 公民作業抽查", 18: "1/1 童軍露營行前說明會", 19: "1/4 開國記念日放假\n1/5～1/7 八年級童軍露營", 20: "1/15 八年級第8節輔導課結束", 21: "1/20～1/22 第三次段考暨非會考科目期末考\n1/22 休業式",
};
const SOURCE_DOCUMENT_CALENDAR_EVENTS = {
  0: "8/28 全校返校日",
  1: "8/31 開學　｜　8/31～9/4 社團線上選填　｜　8/31（午休）資訊股長訓練\n9/1～9/2、9/4 補考\n9/3（午休）全校幹部訓練",
  2: "9/7 第8節輔導課、學習扶助開始　｜　圖書館開始借還書　｜　社團名單公告\n9/8～9/9 社團更換\n9/11 登革熱防治宣導（班會）　｜　社團正式上課",
  3: "9/14 SH150 活動開始　｜　防震防災預演\n9/18 HPV 疫苗第一劑　｜　親師座談",
  4: "9/21 防震防災演習\n9/23 數學作業抽查",
  7: "10/13～10/14 第一次段考",
  9: "10/27～10/30 校內國語文競賽\n10/28 自然作業抽查",
  10: "11/2 八年級職業試探（801～806，上午四節）\n11/4 歷史作業抽查",
  11: "11/9 八年級職業試探（807～812，上午四節）",
  12: "11/16 八年級職業試探（807～812，上午四節）\n11/18 地理作業抽查",
  13: "11/25～11/26 第二次段考",
  15: "12/7 國中英文單字競賽初賽　｜　12/7～12/11 運動會預賽週\n12/9 國文作業抽查\n12/10 國中英文單字競賽決賽",
  16: "12/16 公民作業抽查",
  17: "12/23 圖書館耶誕節活動\n12/24（升旗）八年級露營行前說明",
  18: "12/29～12/31 八年級童軍露營\n12/30 英文作業抽查",
  19: "1/8 第8節輔導課、學習扶助結束",
  20: "1/11 圖書館停止借還書\n1/13～1/15 第三次段考暨非會考科目期末考",
  21: "1/18 運動會預演\n1/19 運動會\n1/20 休業式",
};
const DOCUMENT_CALENDAR_SOURCE_VERSION = 2;
const DOCUMENT_CALENDAR_HOLIDAYS = new Set(["9/25", "9/28", "10/9", "10/29", "12/25", "1/1"]);
const DOCUMENT_CALENDAR_TITLE = "前峰國中 115 學年度第一學期 八年級行事曆";
const DOCUMENT_EXAM_SCHEDULE = {
  title: "前峰國中 115 學年度第一學期 第一次段考時程表",
  dates: ["5/9（星期二）", "5/10（星期三）"],
  rows: [["第一節", "8：20－9：05", "公民 09", "科技 16"], ["第二節", "9：15－10：00", "自習", "地理 07"], ["第三節", "10：15－11：00", "英文（聽力與閱讀） 02", "自習"], ["第四節", "11：10－11：55", "歷史 08", "數學 03"], ["午休時間", "午休時間", "午休時間", "午休時間"], ["第五節", "13：20－14：05", "英文寫作", "作文"], ["第六節", "14：15－15：00", "自習", "自習"], ["第七節", "15：10－15：55", "自然 04", "國文 01"]],
};

const error = document.getElementById("login-error");
const schoolMessage = document.getElementById("school-calendar-message");
const schoolPreview = document.getElementById("school-import-preview");
const schoolMonth = document.getElementById("school-import-month");
const schoolList = document.getElementById("school-import-list");
const lines = (value) => value.split("\n").map((item) => item.trim()).filter(Boolean);
const escapeHtml = (text = "") => String(text).replace(/[&<'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const isHolidayEvent = (event) => /放假|補假|國定假日|春節|元旦|和平紀念|兒童節|清明|勞動節|端午|中秋|國慶/.test(event.title || "");
const EVENT_COLORS = [["blue", "預設藍"], ["teal", "青綠"], ["green", "綠色"], ["purple", "紫色"], ["amber", "琥珀"], ["slate", "灰藍"]];
const eventColorClass = (event) => ` event-color-${EVENT_COLORS.some(([color]) => color === event.color) ? event.color : "blue"}`;
const colorOptions = (selected = "blue") => EVENT_COLORS.map(([color, label]) => `<option value="${color}" ${color === selected ? "selected" : ""}>${label}</option>`).join("");

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
      if (new Date(year, month, day).getDay() === 0 || new Date(year, month, day).getDay() === 6 || events.some(isHolidayEvent)) cell.classList.add("is-holiday");
      cell.innerHTML = `<time>${day}</time>${events.slice(0, 3).map((event) => `<span class="admin-calendar-event${eventColorClass(event)}${isHolidayEvent(event) ? " is-holiday-event" : ""}" title="${escapeHtml(event.title)}">${escapeHtml(event.title)}</span>`).join("")}${events.length > 3 ? `<span class="more-events">另有 ${events.length - 3} 項</span>` : ""}`;
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
  dialog.innerHTML = `<form method="dialog" style="position:relative;display:grid;gap:.85rem;padding:1.35rem"><button class="dialog-close" type="button" aria-label="關閉" style="position:absolute;top:.65rem;right:.65rem;width:34px;min-height:34px;padding:0;border-radius:50%;background:#edf5f8;color:#185a87;font-size:1.45rem">×</button><p class="eyebrow">編輯年級行事曆</p><h2>修改事件</h2><label>標題<input name="title" maxlength="80" required value="${escapeHtml(event.title)}" /></label><label>日期<input name="date" type="date" required value="${escapeHtml(event.date)}" /></label><label>時間（選填）<input name="startTime" type="time" value="${escapeHtml(event.startTime || "")}" /></label><label>說明（選填）<textarea name="description" rows="4" maxlength="300">${escapeHtml(event.description || "")}</textarea></label><label>底色<select name="color">${colorOptions(event.color)}</select></label><button type="submit">儲存修改</button></form>`;
  document.body.append(dialog);
  dialog.querySelector(".dialog-close").onclick = () => dialog.close();
  dialog.onclose = () => dialog.remove();
  dialog.onclick = (click) => { if (click.target === dialog) dialog.close(); };
  dialog.querySelector("form").onsubmit = async (submit) => {
    submit.preventDefault();
    const data = new FormData(submit.currentTarget);
    try {
      await updateDoc(doc(db, "calendarEvents", event.id), { title: data.get("title").trim(), date: data.get("date"), startTime: data.get("startTime"), description: data.get("description").trim(), color: data.get("color"), updatedAt: serverTimestamp() });
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
      <label>底色<select data-import-field="color" data-index="${index}">${colorOptions(event.color)}</select></label>
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

const DEFAULT_CLASS_AFFAIRS_DATASET = { id: "roster", name: "班級名冊", fields: ["座號", "姓名", "OpenID 帳號"] };
function classAffairId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function activeClassAffairsDataset() { return classAffairsTemplates.find((dataset) => dataset.id === selectedClassAffairsDatasetId); }
function legacyClassAffairsRecords(students = []) { return students.map((student, index) => ({ id: student.id || `legacy-${index}`, values: { "座號": String(student.seatNumber || ""), "姓名": student.name || "", "OpenID 帳號": student.openId || "" } })); }
function normalizedClassAffairsGroups(data = {}) { return data.groups || (data.students ? { roster: { records: legacyClassAffairsRecords(data.students) } } : {}); }
function datasetRecords(datasetId) { return classAffairsGroups[datasetId]?.records || []; }
const normalizeDatasetName = (value) => String(value || "").toLowerCase().replace(/[\s_-]/g, "");
async function renderClassAffairsStatistics() {
  let root = document.getElementById("class-affairs-statistics");
  if (!root) { root = document.createElement("section"); root.id = "class-affairs-statistics"; root.className = "class-affairs-statistics"; root.setAttribute("aria-live", "polite"); const intro = document.querySelector("#admin-class-affairs > p:not(.eyebrow)"); intro.insertAdjacentElement("afterend", root); }
  const target = classAffairsTemplates.find((dataset) => dataset.id === classAffairsStatisticsSourceId) || classAffairsTemplates.find((dataset) => normalizeDatasetName(dataset.name) === normalizeDatasetName("學生openid帳號"));
  if (!target) { root.innerHTML = "<h3>班級人數統計</h3><p class=field-note>請先建立名稱為「學生openid帳號」的資料組，系統才會開始統計人數。</p>"; return; }
  try {
    const snapshot = await getDocs(collection(db, "classAffairs"));
    const recordsByClass = new Map(snapshot.docs.map((item) => [item.id, normalizedClassAffairsGroups(item.data())[target.id]?.records || []]));
    const counts = TEACHER_CODES.map((code) => [code, recordsByClass.get(code)?.length || 0]);
    const total = counts.reduce((sum, [, count]) => sum + count, 0);
    root.innerHTML = `<h3>班級人數統計</h3><p class="field-note">統計來源：資料組「${escapeHtml(target.name)}」</p><div class="class-statistics-grid">${counts.map(([code, count]) => `<span><strong>${code}</strong><b>${count} 人</b></span>`).join("")}</div><p class="class-statistics-total">年級總人數 <strong>${total}</strong> 人</p>`;
  } catch (exception) { root.innerHTML = `<h3>班級人數統計</h3><p class="field-note">統計讀取失敗：${escapeHtml(exception.message)}</p>`; }
}
function resetClassAffairsRecordForm() { editingClassAffairRecordId = null; document.getElementById("class-affairs-record-form").reset(); document.getElementById("class-affairs-record-submit").textContent = "新增資料"; document.getElementById("class-affairs-record-cancel").hidden = true; renderClassAffairsRecordFields(); }
function resetClassAffairsDatasetForm() { editingClassAffairsDatasetId = null; document.getElementById("class-affairs-dataset-form").reset(); document.getElementById("class-affairs-dataset-submit").textContent = "儲存資料組"; document.getElementById("class-affairs-dataset-cancel").hidden = true; }
async function loadClassAffairsTemplates() {
  const reference = doc(db, "classAffairsConfig", "settings");
  const snapshot = await getDoc(reference);
  const config = snapshot.exists() ? snapshot.data() : {};
  classAffairsTemplates = Array.isArray(config.datasets) ? config.datasets : [DEFAULT_CLASS_AFFAIRS_DATASET];
  classAffairsStatisticsSourceId = config.statisticsSourceDatasetId || classAffairsTemplates.find((dataset) => normalizeDatasetName(dataset.name) === normalizeDatasetName("學生openid帳號"))?.id || "";
  if (!snapshot.exists()) await setDoc(reference, { datasets: classAffairsTemplates, updatedAt: serverTimestamp() });
  if (selectedClassAffairsDatasetId && !classAffairsTemplates.some((dataset) => dataset.id === selectedClassAffairsDatasetId)) selectedClassAffairsDatasetId = "";
}
function renderClassAffairsDatasetList() {
  const root = document.getElementById("class-affairs-dataset-list");
  const visibleTemplates = classAffairsView === "detail" ? classAffairsTemplates.filter((dataset) => dataset.id === selectedClassAffairsDatasetId) : classAffairsView === "new" ? [] : classAffairsTemplates;
  root.innerHTML = visibleTemplates.length ? `<h3>資料組設定</h3><ul>${visibleTemplates.map((dataset) => `<li><span><strong>${escapeHtml(dataset.name)}</strong><small>${dataset.fields.map(escapeHtml).join("、")}</small></span><span><button class="secondary" data-edit-class-dataset="${dataset.id}">修改</button><button class="secondary" data-delete-class-dataset="${dataset.id}">刪除</button></span></li>`).join("")}</ul>` : classAffairsView === "new" ? "<p class=field-note>請設定新資料組名稱與欄位格式。</p>" : "<p class=field-note>目前尚未設定資料組。</p>";
  root.querySelectorAll("[data-edit-class-dataset]").forEach((button) => { button.onclick = () => { const dataset = classAffairsTemplates.find((item) => item.id === button.dataset.editClassDataset); if (!dataset) return; const form = document.getElementById("class-affairs-dataset-form"); form.elements.datasetName.value = dataset.name; form.elements.datasetFields.value = dataset.fields.join("\n"); editingClassAffairsDatasetId = dataset.id; document.getElementById("class-affairs-dataset-submit").textContent = "儲存格式修改"; document.getElementById("class-affairs-dataset-cancel").hidden = false; form.scrollIntoView({ behavior: "smooth", block: "center" }); }; });
  root.querySelectorAll("[data-delete-class-dataset]").forEach((button) => { button.onclick = async () => { const dataset = classAffairsTemplates.find((item) => item.id === button.dataset.deleteClassDataset); if (!dataset || !confirm(`確定刪除資料組「${dataset.name}」？已建立的資料不會立即刪除，但使用者將無法切換查看。`)) return; classAffairsTemplates = classAffairsTemplates.filter((item) => item.id !== dataset.id); if (selectedClassAffairsDatasetId === dataset.id) selectedClassAffairsDatasetId = ""; if (classAffairsStatisticsSourceId === dataset.id) classAffairsStatisticsSourceId = ""; classAffairsView = "overview"; await setDoc(doc(db, "classAffairsConfig", "settings"), { datasets: classAffairsTemplates, statisticsSourceDatasetId: classAffairsStatisticsSourceId, updatedAt: serverTimestamp() }, { merge: true }); renderClassAffairsAdmin(); }; });
}
function renderClassAffairsRecordFields(values = {}) { const dataset = activeClassAffairsDataset(); const root = document.getElementById("class-affairs-record-fields"); root.innerHTML = dataset ? dataset.fields.map((field, index) => `<label>${escapeHtml(field)}<input name="recordField${index}" maxlength="160" required value="${escapeHtml(values[field] || "")}" /></label>`).join("") : "<p class=field-note>請先建立資料組。</p>"; }
function renderClassAffairsRecordList() {
  const code = document.getElementById("class-affairs-code").value;
  const dataset = activeClassAffairsDataset();
  const root = document.getElementById("class-affairs-admin-list");
  const records = dataset ? datasetRecords(dataset.id) : [];
  root.innerHTML = dataset && records.length ? `<h3>${code} 班・${escapeHtml(dataset.name)}</h3><ul>${records.map((record, index) => `<li><span><strong>${index + 1}. ${dataset.fields.map((field) => `${escapeHtml(field)}：${escapeHtml(record.values?.[field] || "")}`).join("　")}</strong></span><span><button class="secondary" data-edit-class-record="${record.id}">修改</button><button class="secondary" data-delete-class-record="${record.id}">刪除</button></span></li>`).join("")}</ul>` : `<p class="field-note">${code} 班的「${escapeHtml(dataset?.name || "資料組")}」尚未建立資料。</p>`;
  root.querySelectorAll("[data-edit-class-record]").forEach((button) => { button.onclick = () => { const record = datasetRecords(dataset.id).find((item) => item.id === button.dataset.editClassRecord); if (!record) return; editingClassAffairRecordId = record.id; document.getElementById("class-affairs-record-submit").textContent = "儲存修改"; document.getElementById("class-affairs-record-cancel").hidden = false; renderClassAffairsRecordFields(record.values || {}); document.getElementById("class-affairs-record-form").scrollIntoView({ behavior: "smooth", block: "center" }); }; });
  root.querySelectorAll("[data-delete-class-record]").forEach((button) => { button.onclick = async () => { if (!confirm("確定刪除這筆資料？")) return; const groups = { ...classAffairsGroups, [dataset.id]: { records: datasetRecords(dataset.id).filter((item) => item.id !== button.dataset.deleteClassRecord) } }; await setDoc(doc(db, "classAffairs", code), { groups, updatedAt: serverTimestamp() }, { merge: true }); classAffairsGroups = groups; resetClassAffairsRecordForm(); renderClassAffairsRecordList(); renderClassAffairsStatistics(); }; });
}
async function renderClassAffairsAdmin() {
  const root = document.getElementById("class-affairs-admin-list"); root.textContent = "載入中…";
  try {
    await loadClassAffairsTemplates();
    const code = document.getElementById("class-affairs-code").value;
    const snapshot = await getDoc(doc(db, "classAffairs", code));
    classAffairsGroups = normalizedClassAffairsGroups(snapshot.exists() ? snapshot.data() : {});
    const section = document.getElementById("admin-class-affairs"); const intro = section.querySelector("p:not(.eyebrow)"); section.querySelector("h2").textContent = "班務資料";
    let overview = document.getElementById("class-affairs-overview"); if (!overview) { overview = document.createElement("section"); overview.id = "class-affairs-overview"; overview.className = "class-affairs-overview"; document.querySelector("#admin-class-affairs .class-affairs-config").before(overview); }
    const statistics = document.getElementById("class-affairs-statistics"); const config = document.querySelector("#admin-class-affairs .class-affairs-config"); const recordsPanel = document.querySelector("#admin-class-affairs .class-affairs-records");
    if (classAffairsView === "overview") { selectedClassAffairsDatasetId = ""; overview.hidden = false; config.hidden = true; recordsPanel.hidden = true; if (statistics) statistics.hidden = true; overview.innerHTML = `<h3>班務資料</h3><p class="field-note">選擇已建立的資料組，或建立新的資料組。</p><div class="class-affairs-labels">${classAffairsTemplates.map((dataset) => `<button data-open-class-dataset="${dataset.id}">${escapeHtml(dataset.name)}</button>`).join("")}<button class="class-affairs-add" data-new-class-dataset="true">＋ 新增資料組</button></div>`; overview.querySelectorAll("[data-open-class-dataset]").forEach((button) => { button.onclick = () => { selectedClassAffairsDatasetId = button.dataset.openClassDataset; classAffairsView = "detail"; resetClassAffairsDatasetForm(); renderClassAffairsAdmin(); }; }); overview.querySelector("[data-new-class-dataset]").onclick = () => { selectedClassAffairsDatasetId = ""; classAffairsView = "new"; resetClassAffairsDatasetForm(); renderClassAffairsAdmin(); }; return; }
    overview.hidden = true; config.hidden = false; const back = document.createElement("button"); back.type = "button"; back.className = "secondary class-affairs-back"; back.textContent = "‹ 返回班務資料"; if (!config.querySelector(".class-affairs-back")) config.prepend(back); config.querySelector(".class-affairs-back").onclick = () => { classAffairsView = "overview"; selectedClassAffairsDatasetId = ""; resetClassAffairsDatasetForm(); renderClassAffairsAdmin(); };
    document.getElementById("class-affairs-dataset").innerHTML = classAffairsTemplates.map((dataset) => `<option value="${dataset.id}" ${dataset.id === selectedClassAffairsDatasetId ? "selected" : ""}>${escapeHtml(dataset.name)}</option>`).join("");
    renderClassAffairsDatasetList();
    if (classAffairsView === "new") { recordsPanel.hidden = true; if (statistics) statistics.hidden = true; return; }
    recordsPanel.hidden = false; if (statistics) statistics.hidden = false; renderClassAffairsRecordFields(); renderClassAffairsRecordList(); renderClassAffairsStatistics();
  } catch (exception) { root.innerHTML = `<p class="field-note">讀取失敗：${escapeHtml(exception.message)}</p>`; }
}
function parseClassAffairsRows(text) { const delimiter = text.includes("\t") ? "\t" : text.includes(",") ? "," : text.includes("|") ? "|" : null; if (!delimiter) return text.split(/\r?\n/).map((line) => line.trim().split(/\s+/).filter(Boolean)).filter((row) => row.length); const rows = [[]]; let value = "", quoted = false; for (let index = 0; index < text.length; index += 1) { const character = text[index]; if (character === '"') { if (quoted && text[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted; } else if (!quoted && character === delimiter) { rows.at(-1).push(value.trim()); value = ""; } else if (!quoted && (character === "\n" || character === "\r")) { if (character === "\r" && text[index + 1] === "\n") index += 1; rows.at(-1).push(value.trim()); value = ""; rows.push([]); } else value += character; } rows.at(-1).push(value.trim()); return rows.map((row) => { if (delimiter !== "|") return row; if (!row[0]) row.shift(); if (!row.at(-1)) row.pop(); return row; }).filter((row) => row.some(Boolean) && !row.every((cell) => /^:?-{2,}:?$/.test(cell))); }

async function renderCalendarAdminList() {
  const root = document.getElementById("calendar-admin-list");
  const snapshot = await getDocs(collection(db, "calendarEvents"));
  const events = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => `${a.date}${a.startTime || ""}`.localeCompare(`${b.date}${b.startTime || ""}`));
  adminCalendarEvents = events;
  renderAdminCalendar();
  renderCalendarAdminItems();
}

function renderCalendarAdminItems() {
  const root = document.getElementById("calendar-admin-list");
  const monthKey = `${adminCurrentMonth.getFullYear()}-${String(adminCurrentMonth.getMonth() + 1).padStart(2, "0")}`;
  const monthEvents = adminCalendarEvents.filter((event) => event.date?.startsWith(monthKey));
  root.innerHTML = monthEvents.length ? `<h3>${monthKey.replace("-", " 年 ")} 月已發布事件</h3><ul>${monthEvents.map((event) => `<li><span><strong>${escapeHtml(event.date)}</strong> ${escapeHtml(event.title)}</span><button data-delete-event="${event.id}" class="secondary">刪除</button></li>`).join("")}</ul>` : `<p class="field-note">${monthKey.replace("-", " 年 ")} 月尚未建立行事曆事件。</p>`;
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
  const tumbler = document.getElementById("lottery-tumbler");
  tumbler.className = `lottery-tumbler${pendingLottery.classes.length > 4 ? " has-many-classes" : ""}`;
  tumbler.textContent = "?";
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
    tumbler.textContent = shuffle(pendingLottery.classes).join(" · ");
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

function setupSettingsPanels() {
  const accounts = document.getElementById("admin-accounts");
  const classAffairs = document.getElementById("admin-class-affairs");
  if (!accounts || !classAffairs) return;
  accounts.dataset.settingsPanel = "accounts";
  classAffairs.dataset.settingsPanel = "class-affairs";
  let home = document.getElementById("admin-settings-home");
  if (!home) { home = document.createElement("article"); home.id = "admin-settings-home"; home.className = "panel admin-feature"; home.dataset.adminPage = "settings"; home.dataset.settingsPanel = "home"; home.innerHTML = `<p class="eyebrow">設定</p><h2>設定中心</h2><div class="settings-summary-grid"><article class="card"><h3>帳號與驗證碼</h3><p>查看導師驗證碼設定狀態與重置功能。</p><button data-settings-target="accounts">查看設定</button></article><article class="card"><h3>班務資料組</h3><p>管理資料組、班級資料與人數統計。</p><button data-settings-target="class-affairs">查看設定</button></article></div>`; accounts.parentElement.insertBefore(home, accounts); }
  [[accounts, "accounts"], [classAffairs, "class-affairs"]].forEach(([section, panel]) => { if (!section.querySelector("[data-settings-target='home']")) { const back = document.createElement("button"); back.type = "button"; back.className = "secondary settings-back"; back.dataset.settingsTarget = "home"; back.textContent = "‹ 返回設定中心"; section.prepend(back); } });
  document.querySelectorAll("[data-settings-target]").forEach((button) => { button.onclick = () => chooseSettingsPanel(button.dataset.settingsTarget); });
}
function chooseSettingsPanel(panel) { setupSettingsPanels(); document.querySelectorAll("[data-settings-panel]").forEach((section) => section.classList.toggle("is-active", section.dataset.settingsPanel === panel)); window.scrollTo({ top: 0, behavior: "smooth" }); }
function documentEventText(value = "") { return escapeHtml(value).replace(/｜/g, "<span class=calendar-event-separator>｜</span>").replace(/\n/g, "<br>"); }
function documentEventDays() {
  const days = new Set(Object.values(documentCalendarEvents).flatMap((value) => String(value).match(/\b\d{1,2}\/\d{1,2}\b/g) || []));
  Object.values(documentCalendarEvents).forEach((value) => {
    const ranges = String(value).matchAll(/(\d{1,2})\/(\d{1,2})\s*[～~]\s*(?:(\d{1,2})\/)?(\d{1,2})/g);
    for (const range of ranges) {
      const startMonth = Number(range[1]); const startDay = Number(range[2]); const endMonth = Number(range[3] || range[1]); const endDay = Number(range[4]);
      const startYear = startMonth >= 8 ? 2026 : 2027; let endYear = endMonth >= 8 ? 2026 : 2027;
      if (endMonth < startMonth && endYear === startYear) endYear += 1;
      const current = new Date(startYear, startMonth - 1, startDay); const end = new Date(endYear, endMonth - 1, endDay);
      while (current <= end) { days.add(`${current.getMonth() + 1}/${current.getDate()}`); current.setDate(current.getDate() + 1); }
    }
  });
  return days;
}
function formatDocumentExam(value) {
  const match = String(value).match(/^(.*?)\s+(\d{2})$/);
  const subject = (match ? match[1] : String(value)).trim();
  const code = match?.[2] || "";
  if (subject === "自習") return escapeHtml(subject);
  const english = subject.match(/^英文[（(](.+)[）)]$/);
  const englishWriting = subject === "英文寫作";
  const subjectHtml = english ? `<strong>英文</strong><span class="exam-subject-detail">（${escapeHtml(english[1])}）</span>` : englishWriting ? "<strong>英文</strong><span class=\"exam-subject-detail\">（寫作）</span>" : `<strong>${escapeHtml(subject)}</strong>`;
  return `${subjectHtml}${code ? `<small>${code}</small>` : ""}`;
}
function formatDocumentTime(value) { const match = String(value).match(/^(.+?)[－-](.+)$/); return match ? `${escapeHtml(match[1])}<br><span class="exam-time-end">${escapeHtml(match[2])}</span>` : escapeHtml(value); }
function setupDocumentsPanel() {
  if (document.getElementById("admin-documents")) return;
  const panel = document.createElement("article");
  panel.id = "admin-documents";
  panel.dataset.adminPage = "documents";
  panel.className = "panel admin-feature";
  document.querySelector(".admin-grid").append(panel);
  const nav = document.getElementById("admin-nav");
  const link = document.createElement("a");
  link.href = "#admin-documents";
  link.dataset.adminNav = "documents";
  link.innerHTML = "<span>▤</span>文件";
  const settings = nav.querySelector("[data-admin-nav='settings']");
  nav.insertBefore(link, settings || null);
  link.onclick = (event) => { event.preventDefault(); chooseAdminPage("documents"); };
  renderDocuments();
}
function renderDocuments() {
  const panel = document.getElementById("admin-documents");
  if (!panel) return;
  const examSchedule = documentExamSchedule || { ...DOCUMENT_EXAM_SCHEDULE, dates: [...DOCUMENT_EXAM_SCHEDULE.dates], rows: DOCUMENT_EXAM_SCHEDULE.rows.map((row) => [...row]) };
  const monthCounts = DOCUMENT_CALENDAR_ROWS.reduce((counts, [month]) => ({ ...counts, [month]: (counts[month] || 0) + 1 }), {});
  const shownMonths = new Set();
  const eventDays = documentEventDays();
  const calendarRows = DOCUMENT_CALENDAR_ROWS.map(([month, week, days], index) => {
    const monthCell = shownMonths.has(month) ? "" : `<th scope="rowgroup" rowspan="${monthCounts[month]}" class="document-calendar-month">${month}</th>`;
    shownMonths.add(month);
    const cells = days.map((day, dayIndex) => {
      const date = new Date(2026, 7, 23 + index * 7 + dayIndex);
      const key = `${date.getMonth() + 1}/${date.getDate()}`;
      return `<td class="${dayIndex === 0 || dayIndex === 6 ? "is-weekend" : ""}${eventDays.has(key) ? " has-event" : ""}${DOCUMENT_CALENDAR_HOLIDAYS.has(key) ? " is-holiday" : ""}">${day}</td>`;
    }).join("");
    return `<tr>${monthCell}<th scope="row">${week}</th>${cells}<td class="document-calendar-events">${documentEventText(documentCalendarEvents[index] || "")}</td></tr>`;
  }).join("");
  const editorRows = DOCUMENT_CALENDAR_ROWS.map(([month, week], index) => `<label><span>${month}・第 ${week} 週</span><textarea data-document-calendar-event="${index}" rows="2" maxlength="500">${escapeHtml(documentCalendarEvents[index] || "")}</textarea></label>`).join("");
  const examRows = examSchedule.rows.map(([period, time, first, second]) => `<tr class="${period === "午休時間" ? "is-lunch" : ""}"><th scope="row">${period}</th><td>${formatDocumentTime(time)}</td><td>${formatDocumentExam(first)}</td><td>${formatDocumentExam(second)}</td></tr>`).join("");
  panel.innerHTML = `<p class="eyebrow">DOCUMENTS</p><h2>文件</h2><p class="field-note">整合學期行事與段考時程，可在手機上查看或列印。</p><div class="document-tabs" role="tablist"><button type="button" data-document-view="calendar" class="${activeDocumentView === "calendar" ? "is-selected" : ""}">行事曆</button><button type="button" data-document-view="exam" class="${activeDocumentView === "exam" ? "is-selected" : ""}">考程表</button></div><section class="document-view ${activeDocumentView === "calendar" ? "is-active" : ""}" data-document-section="calendar"><div class="document-heading"><div><h3>115 學年度第一學期 八年級行事曆</h3><p>週表式學期行事</p></div><div><button type="button" class="secondary" id="edit-document-calendar">編修行事</button><button type="button" id="print-document-calendar">列印</button></div></div><div class="document-table-wrap"><table class="document-calendar-table"><thead><tr><th rowspan="2">月份</th><th rowspan="2">週次</th><th colspan="7">星期</th><th rowspan="2">重要行事</th></tr><tr><th>日</th><th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th>六</th></tr></thead><tbody>${calendarRows}</tbody></table></div><section id="document-calendar-editor" class="document-calendar-editor" hidden><h3>編修重要行事</h3><p class="field-note">每週一格，修改後會儲存至 Firebase，其他管理者登入時也會看到。</p><div>${editorRows}</div><button type="button" id="save-document-calendar">儲存修改</button><button type="button" id="cancel-document-calendar" class="secondary">取消</button><p id="document-calendar-message" class="field-note" role="status"></p></section></section><section class="document-view ${activeDocumentView === "exam" ? "is-active" : ""}" data-document-section="exam"><div class="document-heading"><div><h3>考程表</h3><p>第一次段考時程</p></div><button type="button" id="print-document-exam">列印</button></div><section class="document-exam"><h3>${escapeHtml(DOCUMENT_EXAM_SCHEDULE.title)}</h3><div class="document-table-wrap"><table><thead><tr><th>堂次</th><th>時間</th><th>${DOCUMENT_EXAM_SCHEDULE.dates.map(escapeHtml).join("</th><th>")}</th></tr></thead><tbody>${examRows}</tbody></table></div></section></section>`;
  const calendarScreen = panel.querySelector(".document-calendar-table").closest(".document-table-wrap");
  calendarScreen.classList.add("document-calendar-screen");
  panel.querySelector("[data-document-section='calendar'] .document-heading h3").textContent = DOCUMENT_CALENDAR_TITLE;
  const calendarCopies = document.createElement("div");
  calendarCopies.className = "document-calendar-print-copies";
  for (let copy = 0; copy < 2; copy += 1) { const page = document.createElement("section"); const tableCopy = calendarScreen.cloneNode(true); tableCopy.classList.remove("document-calendar-screen"); page.innerHTML = `<h3>${DOCUMENT_CALENDAR_TITLE}</h3>`; page.append(tableCopy); calendarCopies.append(page); }
  calendarScreen.after(calendarCopies);
  const examScreen = panel.querySelector(".document-exam table").closest(".document-table-wrap");
  examScreen.classList.add("document-exam-screen");
  examScreen.querySelector("table").classList.add("document-exam-table");
  panel.querySelector(".document-exam h3").textContent = examSchedule.title;
  const examHeaderCells = examScreen.querySelectorAll("thead th");
  examHeaderCells[0].textContent = "節次";
  examHeaderCells[2].textContent = examSchedule.dates[0];
  examHeaderCells[3].textContent = examSchedule.dates[1];
  const examCopies = document.createElement("div");
  examCopies.className = "document-exam-print-copies";
  for (let copy = 0; copy < 4; copy += 1) { const page = document.createElement("section"); const tableCopy = examScreen.cloneNode(true); tableCopy.classList.remove("document-exam-screen"); page.innerHTML = `<h3>${escapeHtml(examSchedule.title)}</h3>`; page.append(tableCopy); examCopies.append(page); }
  examScreen.after(examCopies);
  const printExam = panel.querySelector("#print-document-exam");
  const examActions = document.createElement("div");
  examActions.className = "document-actions";
  printExam.before(examActions);
  const editExam = document.createElement("button");
  editExam.type = "button";
  editExam.id = "edit-document-exam";
  editExam.className = "secondary";
  editExam.textContent = "編修考程";
  examActions.append(editExam, printExam);
  const examEditor = document.createElement("section");
  examEditor.id = "document-exam-editor";
  examEditor.className = "document-exam-editor";
  examEditor.hidden = true;
  examEditor.innerHTML = `<h3>編修考程表</h3><label>標題<input data-exam-title maxlength="120" value="${escapeHtml(examSchedule.title)}" /></label><div class="document-exam-editor-dates"><label>第一天日期<input data-exam-date="0" maxlength="30" value="${escapeHtml(examSchedule.dates[0])}" /></label><label>第二天日期<input data-exam-date="1" maxlength="30" value="${escapeHtml(examSchedule.dates[1])}" /></label></div><div class="document-exam-editor-rows">${examSchedule.rows.map((row, rowIndex) => `<section><label>堂次<input data-exam-row="${rowIndex}" data-exam-col="0" maxlength="20" value="${escapeHtml(row[0])}" /></label><label>時間<input data-exam-row="${rowIndex}" data-exam-col="1" maxlength="30" value="${escapeHtml(row[1])}" /></label><label>第一天考科<input data-exam-row="${rowIndex}" data-exam-col="2" maxlength="80" value="${escapeHtml(row[2])}" /></label><label>第二天考科<input data-exam-row="${rowIndex}" data-exam-col="3" maxlength="80" value="${escapeHtml(row[3])}" /></label></section>`).join("")}</div><button type="button" id="save-document-exam">儲存修改</button><button type="button" id="cancel-document-exam" class="secondary">取消</button><p id="document-exam-message" class="field-note" role="status"></p>`;
  examCopies.after(examEditor);
  panel.querySelectorAll("[data-document-view]").forEach((button) => { button.onclick = () => { activeDocumentView = button.dataset.documentView; renderDocuments(); }; });
  panel.querySelector("#edit-document-calendar").onclick = () => { panel.querySelector("#document-calendar-editor").hidden = false; panel.querySelector("#edit-document-calendar").hidden = true; };
  panel.querySelector("#cancel-document-calendar").onclick = () => renderDocuments();
  panel.querySelector("#save-document-calendar").onclick = async () => {
    const message = panel.querySelector("#document-calendar-message");
    panel.querySelectorAll("[data-document-calendar-event]").forEach((field) => { documentCalendarEvents[field.dataset.documentCalendarEvent] = field.value.trim(); });
    message.textContent = "儲存中…";
    try { await setDoc(doc(db, "classAffairsConfig", "teacherDocuments"), { events: documentCalendarEvents, calendarSourceVersion: DOCUMENT_CALENDAR_SOURCE_VERSION, updatedAt: serverTimestamp() }, { merge: true }); message.textContent = "已儲存。"; renderDocuments(); } catch (exception) { message.textContent = `儲存失敗：${exception.message}`; }
  };
  const printCalendar = panel.querySelector("#print-document-calendar");
  printCalendar.textContent = "列印／另存 PDF";
  printCalendar.onclick = () => printDocument("calendar");
  printExam.textContent = "列印／另存 PDF";
  printExam.onclick = () => printDocument("exam");
  editExam.onclick = () => { examEditor.hidden = false; editExam.hidden = true; };
  panel.querySelector("#cancel-document-exam").onclick = () => renderDocuments();
  panel.querySelector("#save-document-exam").onclick = async () => {
    const message = panel.querySelector("#document-exam-message");
    const next = { title: panel.querySelector("[data-exam-title]").value.trim(), dates: [panel.querySelector("[data-exam-date='0']").value.trim(), panel.querySelector("[data-exam-date='1']").value.trim()], rows: examSchedule.rows.map((row, rowIndex) => row.map((value, columnIndex) => panel.querySelector(`[data-exam-row="${rowIndex}"][data-exam-col="${columnIndex}"]`).value.trim())) };
    if (!next.title || next.dates.some((date) => !date) || next.rows.some((row) => row.some((value) => !value))) { message.textContent = "請完整填寫所有欄位。"; return; }
    message.textContent = "儲存中…";
    try { await setDoc(doc(db, "classAffairsConfig", "teacherDocuments"), { exam: next, updatedAt: serverTimestamp() }, { merge: true }); documentExamSchedule = next; renderDocuments(); } catch (exception) { message.textContent = `儲存失敗：${exception.message}`; }
  };
}
async function loadDocumentCalendar() {
  documentCalendarEvents = { ...SOURCE_DOCUMENT_CALENDAR_EVENTS };
  documentExamSchedule = { ...DOCUMENT_EXAM_SCHEDULE, dates: [...DOCUMENT_EXAM_SCHEDULE.dates], rows: DOCUMENT_EXAM_SCHEDULE.rows.map((row) => [...row]) };
  try { const snapshot = await getDoc(doc(db, "classAffairsConfig", "teacherDocuments")); if (snapshot.exists()) { const data = snapshot.data(); if (data.events) { if (data.calendarSourceVersion === DOCUMENT_CALENDAR_SOURCE_VERSION) documentCalendarEvents = { ...documentCalendarEvents, ...data.events }; else Object.entries(data.events).forEach(([index, value]) => { if (value !== DEFAULT_DOCUMENT_CALENDAR_EVENTS[index]) documentCalendarEvents[index] = value; }); } if (data.exam?.title && Array.isArray(data.exam?.dates) && Array.isArray(data.exam?.rows)) documentExamSchedule = data.exam; } } catch (exception) { console.warn("無法讀取文件資料", exception); }
  renderDocuments();
}
function printDocument(kind) {
  const isCalendar = kind === "calendar";
  const copies = document.querySelector(isCalendar ? ".document-calendar-print-copies" : ".document-exam-print-copies");
  if (!copies) { alert("找不到可列印的文件內容。 "); return; }
  const title = isCalendar ? DOCUMENT_CALENDAR_TITLE : (documentExamSchedule || DOCUMENT_EXAM_SCHEDULE).title;
  const pageSize = isCalendar ? "landscape" : "portrait";
  const copyGrid = isCalendar ? "grid-template-columns:1fr 1fr;height:200mm;gap:3mm" : "grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;height:291mm;column-gap:3mm;row-gap:11mm";
  const printStyles = `@page{size:A4 ${pageSize};margin:3mm}*{box-sizing:border-box}body{margin:0;color:#000;font-family:"Microsoft JhengHei",sans-serif}.copies{display:grid;${copyGrid}}.copies section{display:grid;grid-template-rows:auto 1fr;min-height:0}.copies h3{margin:0 0 2mm;text-align:center;font-size:${isCalendar ? "15" : "11.5"}pt;font-weight:900;line-height:1.2}.document-table-wrap{overflow:visible;border:1px solid #000}.document-calendar-table,.document-exam table{width:100%;height:100%;border-collapse:collapse;table-layout:fixed;color:#000}.document-calendar-table th,.document-calendar-table td{border:1px solid #000;padding:1px;text-align:center;font-size:5.3pt;line-height:1.05}.document-calendar-table thead tr:first-child th{font-size:9.5pt;font-weight:900}.document-calendar-table thead tr:nth-child(2) th{font-size:6.2pt}.document-calendar-table tbody tr{height:${isCalendar ? "8.4mm" : "7.5mm"}}.document-calendar-table th:first-child{width:7%}.document-calendar-table th:nth-child(2){width:8%}.document-calendar-table th:last-child{width:56%}.document-calendar-events{text-align:left!important;font-size:5.8pt!important;line-height:1.28}.calendar-event-separator{color:#007f8b;font-weight:900}.document-exam th,.document-exam td{border:1px solid #000;padding:1px;text-align:center;font-size:8.5pt;line-height:1.12}.document-exam th{font-weight:900}.document-exam table th:first-child{width:13%}.document-exam table th:nth-child(2){width:18%}.document-exam td:nth-child(2){white-space:nowrap;line-height:1.15}.document-exam small{display:block;font-size:7.3pt}.document-exam .is-lunch th,.document-exam .is-lunch td{font-weight:900}`;
  const examPrintStyles = `.document-exam-table{width:100%;height:100%;border-collapse:collapse;table-layout:fixed;color:#000}.document-exam-table th,.document-exam-table td{border:1px solid #000!important;padding:1px;text-align:center;font-size:8.5pt;line-height:1.12}.document-exam-table th{font-weight:900}.document-exam-table th:first-child{width:13%}.document-exam-table th:nth-child(2){width:18%}.document-exam-table thead th:nth-child(3),.document-exam-table thead th:nth-child(4){white-space:nowrap;font-size:7.2pt}.document-exam-table td:nth-child(2){white-space:nowrap;line-height:1.15}.document-exam-table .exam-time-end{display:block;margin-top:2.2pt}.document-exam-table strong{display:block;font-size:12.2pt;line-height:1.05}.document-exam-table .exam-subject-detail{display:block;font-size:7.3pt;line-height:1.08}.document-exam-table small{display:block;font-size:7.3pt}.document-exam-table .is-lunch th,.document-exam-table .is-lunch td{font-weight:900}`;
  const calendarPrintStyles = `.document-calendar-table .has-event{text-decoration:underline;text-decoration-color:#007f8b;text-decoration-thickness:1.5px;text-underline-offset:2px;font-weight:900}.document-calendar-table .is-weekend,.document-calendar-table .is-holiday{-webkit-print-color-adjust:exact;print-color-adjust:exact}.document-calendar-table .is-weekend{background:#fff4f3!important;color:#b42318;font-weight:900}.document-calendar-table .is-holiday{background:#ffebee!important;color:#b42318;font-weight:900}`;
  const printFrame = document.createElement("iframe");
  printFrame.title = "列印文件";
  printFrame.setAttribute("aria-hidden", "true");
  printFrame.style.cssText = "position:fixed;left:-2px;bottom:-2px;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
  const originalPageTitle = document.title;
  document.title = title;
  printFrame.onload = () => { const frameWindow = printFrame.contentWindow; if (!frameWindow) return; frameWindow.onafterprint = () => { document.title = originalPageTitle; printFrame.remove(); }; window.setTimeout(() => { frameWindow.focus(); frameWindow.print(); }, 180); };
  printFrame.srcdoc = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${printStyles}${examPrintStyles}${calendarPrintStyles}</style></head><body><main class="copies">${copies.innerHTML}</main></body></html>`;
  document.body.append(printFrame);
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
      return start && { ...start, sourceMonth: start.date.slice(0, 7), title: item.summary || "未命名行程", description: item.description || "", color: "blue", selected: true };
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
      setupDocumentsPanel();
      await loadDocumentCalendar();
      chooseAdminPage("calendar");
      renderActivity();
      if (!activityRefreshTimer) activityRefreshTimer = setInterval(renderActivity, 30000);
      renderTeacherStatus();
      renderCalendarAdminList();
      renderClassAffairsAdmin();
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
  document.querySelectorAll("#lottery-form input[name='source']").forEach((input) => { input.onchange = (event) => { document.getElementById("lottery-custom-wrap").hidden = event.target.value !== "custom"; }; });
  document.querySelectorAll("#lottery-form input[name='mode']").forEach((input) => { input.onchange = (event) => { document.getElementById("lottery-count-wrap").hidden = event.target.value === "rank"; }; });
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
    sessionStorage.setItem("pendingLotteryDraw", JSON.stringify({ title: data.get("title").trim(), source, classes, mode, results }));
    location.href = "lottery-draw.html";
  };
  const calendarForm = document.getElementById("calendar-event-form");
  calendarForm.querySelector("label:last-of-type").insertAdjacentHTML("afterend", `<label>底色<select name="color">${colorOptions()}</select></label>`);
  calendarForm.onsubmit = async (event) => { event.preventDefault(); const data = new FormData(event.target); await publish("calendarEvents", { title: data.get("title"), date: data.get("date"), startTime: data.get("startTime"), description: data.get("description"), color: data.get("color") || "blue" }, event.target); renderCalendarAdminList(); };
  document.getElementById("read-school-calendar").onclick = readSchoolCalendar;
  document.getElementById("confirm-school-import").onclick = importSchoolMonth;
  schoolMonth.onchange = renderSchoolPreview;
  document.getElementById("admin-calendar-prev").onclick = () => { adminCurrentMonth = new Date(adminCurrentMonth.getFullYear(), adminCurrentMonth.getMonth() - 1, 1); renderAdminCalendar(); renderCalendarAdminItems(); };
  document.getElementById("admin-calendar-next").onclick = () => { adminCurrentMonth = new Date(adminCurrentMonth.getFullYear(), adminCurrentMonth.getMonth() + 1, 1); renderAdminCalendar(); renderCalendarAdminItems(); };
  document.getElementById("admin-calendar-today").onclick = () => { adminCurrentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); renderAdminCalendar(); renderCalendarAdminItems(); };
  document.querySelectorAll("[data-admin-nav]").forEach((link) => { link.onclick = (event) => { event.preventDefault(); chooseAdminPage(link.dataset.adminNav); }; });
  document.getElementById("class-affairs-code").onchange = () => { editingClassAffairRecordId = null; renderClassAffairsAdmin(); };
  document.getElementById("class-affairs-dataset").onchange = (event) => { selectedClassAffairsDatasetId = event.target.value; resetClassAffairsRecordForm(); renderClassAffairsRecordList(); };
  document.getElementById("class-affairs-record-cancel").onclick = resetClassAffairsRecordForm;
  document.getElementById("class-affairs-dataset-cancel").onclick = resetClassAffairsDatasetForm;
  document.getElementById("class-affairs-dataset-form").onsubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("datasetName")).trim();
    const fields = lines(String(data.get("datasetFields")));
    if (!name || !fields.length) return;
    if (classAffairsTemplates.some((dataset) => dataset.name === name && dataset.id !== editingClassAffairsDatasetId)) return alert("已有相同名稱的資料組。");
    const dataset = { id: editingClassAffairsDatasetId || classAffairId(), name, fields };
    classAffairsTemplates = editingClassAffairsDatasetId ? classAffairsTemplates.map((item) => item.id === editingClassAffairsDatasetId ? dataset : item) : [...classAffairsTemplates, dataset];
    selectedClassAffairsDatasetId = dataset.id;
    classAffairsView = "detail";
    if (normalizeDatasetName(name) === normalizeDatasetName("學生openid帳號")) classAffairsStatisticsSourceId = dataset.id;
    try { await setDoc(doc(db, "classAffairsConfig", "settings"), { datasets: classAffairsTemplates, statisticsSourceDatasetId: classAffairsStatisticsSourceId, updatedAt: serverTimestamp() }, { merge: true }); resetClassAffairsDatasetForm(); renderClassAffairsAdmin(); } catch (exception) { alert(`儲存資料組失敗：${exception.message}`); }
  };
  document.getElementById("class-affairs-record-form").onsubmit = async (event) => {
    event.preventDefault();
    const dataset = activeClassAffairsDataset();
    if (!dataset) return;
    const data = new FormData(event.currentTarget);
    const values = Object.fromEntries(dataset.fields.map((field, index) => [field, String(data.get(`recordField${index}`)).trim()]));
    if (Object.values(values).some((value) => !value)) return;
    const code = document.getElementById("class-affairs-code").value;
    const record = { id: editingClassAffairRecordId || classAffairId(), values };
    const records = editingClassAffairRecordId ? datasetRecords(dataset.id).map((item) => item.id === editingClassAffairRecordId ? record : item) : [...datasetRecords(dataset.id), record];
    const groups = { ...classAffairsGroups, [dataset.id]: { records } };
    const message = document.getElementById("class-affairs-message"); message.textContent = "儲存中…";
    try { await setDoc(doc(db, "classAffairs", code), { groups, updatedAt: serverTimestamp() }, { merge: true }); classAffairsGroups = groups; message.textContent = "資料已儲存。"; resetClassAffairsRecordForm(); renderClassAffairsRecordList(); renderClassAffairsStatistics(); } catch (exception) { message.textContent = `儲存失敗：${exception.message}`; }
  };
  document.getElementById("class-affairs-batch-file").onchange = async (event) => { const file = event.target.files?.[0]; if (file) document.getElementById("class-affairs-batch-data").value = await file.text(); };
  document.getElementById("class-affairs-batch-import").onclick = async () => {
    const dataset = activeClassAffairsDataset(); const message = document.getElementById("class-affairs-message"); const rows = parseClassAffairsRows(document.getElementById("class-affairs-batch-data").value);
    if (!dataset || !rows.length) { message.textContent = "請貼上或選擇至少一筆資料。"; return; }
    let header = rows[0]; if (header.join(" ") === dataset.fields.join(" ")) header = [...dataset.fields]; let positions = dataset.fields.map((field) => header.indexOf(field));
    const hasHeader = positions.every((position) => position >= 0);
    if (hasHeader) rows.shift(); else { const looksLikeHeader = dataset.fields.some((field) => header.includes(field)); if (looksLikeHeader) { message.textContent = `標題列需包含：${dataset.fields.join("、")}`; return; } positions = dataset.fields.map((_, index) => index); }
    const records = rows.map((row) => ({ id: classAffairId(), values: Object.fromEntries(dataset.fields.map((field, index) => [field, row[positions[index]] || ""])) })).filter((record) => Object.values(record.values).some(Boolean));
    if (!records.length) { message.textContent = "找不到可匯入的資料。"; return; }
    const code = document.getElementById("class-affairs-code").value; const groups = { ...classAffairsGroups, [dataset.id]: { records: [...datasetRecords(dataset.id), ...records] } };
    message.textContent = `正在匯入 ${records.length} 筆資料…`;
    try { await setDoc(doc(db, "classAffairs", code), { groups, updatedAt: serverTimestamp() }, { merge: true }); classAffairsGroups = groups; document.getElementById("class-affairs-batch-data").value = ""; document.getElementById("class-affairs-batch-file").value = ""; message.textContent = `已匯入 ${records.length} 筆資料。`; renderClassAffairsRecordList(); renderClassAffairsStatistics(); } catch (exception) { message.textContent = `匯入失敗：${exception.message}`; }
  };
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
