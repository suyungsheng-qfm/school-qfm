const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();

// 只有第一次建立投票紀錄時才執行；Firestore 規則同時確保每名使用者只能建立一次。
exports.countVote = onDocumentCreated("polls/{pollId}/votes/{userId}", async (event) => {
  const vote = event.data.data();
  const pollRef = getFirestore().collection("polls").doc(event.params.pollId);
  await pollRef.update({ [`counts.${vote.option}`]: FieldValue.increment(1) });
});
