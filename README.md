# 115 八導 公佈網

這是以 GitHub Pages 與 Firebase 免費服務建立的簡易班級公告系統。

- 學生與一般使用者：閱讀公告、簽名、投票與表單登記。
- 導師：使用代號 `801`～`812`，首次自行設定 6 位數驗證碼；功能與一般使用者相同。
- 級導師：使用 Firebase 電子郵件／密碼登入，可發布公告、投票與表單，並可把導師驗證碼重置為未設定。
- 班務：管理者可先設定資料組名稱與欄位格式，再建立 801～812 各班資料；導師端只顯示登入班級資料，並可切換資料組。支援 CSV 或 Excel 貼上批次匯入。

## Firebase 一次性設定

1. Firebase Authentication 啟用「匿名」與「電子郵件／密碼」登入。
2. 在 Users 建立級導師的完整帳號，例如 `teacher01@qfm.kh.edu.tw`。網站登入時只需輸入 `teacher01`。
3. 建立 Cloud Firestore 資料庫，把 [firestore.rules](firestore.rules) 貼到 Rules 分頁並發布。
4. Authentication → Settings → Authorized domains 加入 `suyungsheng-qfm.github.io`。

此版本不使用 Cloud Functions、不需 Blaze 方案，也不需要從本機部署。網站由 GitHub Pages 直接提供。

## 導師驗證碼

導師驗證碼會先在瀏覽器轉成雜湊值才存入 Firestore，管理頁沒有查看或直接指定驗證碼的功能；管理者只能重置為空白。這是適合校內使用的簡易機制，並非高安全性帳號系統。
