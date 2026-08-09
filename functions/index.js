const crypto = require("node:crypto");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore, Timestamp } = require("firebase-admin/firestore");

initializeApp();

const TEACHER_CODES = new Set(Array.from({ length: 12 }, (_, index) => String(801 + index)));
const PIN_PATTERN = /^\d{6}$/;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function validateCode(code) {
  if (typeof code !== "string" || !TEACHER_CODES.has(code)) throw new HttpsError("invalid-argument", "無效的導師代號。");
}
function validatePin(pin) {
  if (typeof pin !== "string" || !PIN_PATTERN.test(pin)) throw new HttpsError("invalid-argument", "驗證碼必須是 6 位數字。");
}
function hashPin(pin, salt) { return crypto.scryptSync(pin, salt, 64).toString("hex"); }
function isPinValid(pin, record) {
  const expected = Buffer.from(record.pinHash, "hex");
  const actual = Buffer.from(hashPin(pin, record.salt), "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
function tokenFor(code) { return getAuth().createCustomToken(`teacher-${code}`, { role: "basic_teacher", teacherCode: code }); }

// 一般導師：先查詢是否首次使用，再設定或驗證自己的 6 位數驗證碼。
exports.authenticateTeacher = onCall(async (request) => {
  const { code, pin, mode } = request.data || {};
  validateCode(code);
  const credentialRef = getFirestore().collection("teacherCredentials").doc(code);
  const record = (await credentialRef.get()).data();

  if (mode === "status") return { needsSetup: !record?.pinHash };
  validatePin(pin);

  if (mode === "setup") {
    if (record?.pinHash) throw new HttpsError("failed-precondition", "此代號已設定驗證碼，請使用驗證碼登入。");
    const salt = crypto.randomBytes(16).toString("hex");
    await credentialRef.set({ pinHash: hashPin(pin, salt), salt, failedAttempts: 0, lockedUntil: null, createdAt: FieldValue.serverTimestamp() }, { merge: true });
    return { token: await tokenFor(code) };
  }

  if (mode !== "login" || !record?.pinHash) throw new HttpsError("failed-precondition", "請先設定驗證碼。");
  if (record.lockedUntil?.toDate?.() > new Date()) throw new HttpsError("resource-exhausted", "嘗試次數過多，請 15 分鐘後再試。");
  if (!isPinValid(pin, record)) {
    const failures = (record.failedAttempts || 0) + 1;
    const update = { failedAttempts: failures, lastFailedAt: FieldValue.serverTimestamp() };
    if (failures >= MAX_FAILED_ATTEMPTS) { update.failedAttempts = 0; update.lockedUntil = Timestamp.fromDate(new Date(Date.now() + LOCK_MINUTES * 60 * 1000)); }
    await credentialRef.update(update);
    throw new HttpsError("unauthenticated", "代號或驗證碼錯誤。");
  }
  await credentialRef.update({ failedAttempts: 0, lockedUntil: null, lastLoginAt: FieldValue.serverTimestamp() });
  return { token: await tokenFor(code) };
});

// 只有帶有 admin custom claim 的級導師可重置；雜湊值不會回傳到瀏覽器。
exports.resetTeacherPin = onCall(async (request) => {
  if (!request.auth?.token?.admin) throw new HttpsError("permission-denied", "只有管理者可重置驗證碼。");
  const { code } = request.data || {};
  validateCode(code);
  await getFirestore().collection("teacherCredentials").doc(code).set({ pinHash: null, salt: null, failedAttempts: 0, lockedUntil: null, resetAt: FieldValue.serverTimestamp(), resetBy: request.auth.uid }, { merge: true });
  return { reset: true };
});

// 票數由伺服器端函式累加，避免一般使用者竄改計數。
exports.countVote = onDocumentCreated("polls/{pollId}/votes/{userId}", async (event) => {
  const vote = event.data.data();
  await getFirestore().collection("polls").doc(event.params.pollId).update({ [`counts.${vote.option}`]: FieldValue.increment(1) });
});
