# 校務互動平台

純前端的班級公佈欄，使用 Firebase Authentication 與 Cloud Firestore 即時保存：

- 學生可匿名登入後閱讀公告、簽名確認、每題投一次票、每份表單登記一次。
- `admin.html` 是「級導師」入口，可用 Firebase Email/Password 教師帳號登入，發布公告、投票與表單，並查看回覆數。

## Firebase 設定

1. 在 Firebase Console 建立專案，啟用 **Authentication** 的「匿名」及「電子郵件/密碼」登入方式，並建立教師帳號。
2. 建立 Cloud Firestore 資料庫，將 [firestore.rules](firestore.rules) 的內容貼到 Rules 後發布。
3. 使用 Admin SDK 為教師帳號設定 custom claim `{ admin: true }`；這是發布內容所需的權限。設定後教師應重新登入。
4. 在 `functions` 資料夾執行 `npm install`，然後使用 Firebase CLI 部署 Functions 與 Hosting：`firebase deploy`。
5. 把網頁應用程式設定值填入 `firebase-config.js`。
6. 將資料夾以任何靜態網站服務部署（Firebase Hosting、GitHub Pages、Netlify 等）。不要直接用 `file://` 開啟。

## 投票計數的重要說明

`functions/index.js` 會在新增 `/polls/{pollId}/votes/{userId}` 時以伺服器端 `increment` 更新該選項票數，因此不會把票數寫入權限交給一般使用者。

## GitHub

本資料夾目前沒有設定 Git 遠端。建立 GitHub 空白倉庫後，在本機執行：

```powershell
git init
git add .
git commit -m "建立校務互動平台"
git branch -M main
git remote add origin https://github.com/帳號/倉庫名稱.git
git push -u origin main
```
