# 啟用 GitHub 自動部署 Firebase

此專案已設定：每次推送到 `main` 分支時，GitHub Actions 會自動部署 Firebase Hosting、Firestore 規則與 Cloud Functions。

## 一次性設定

1. 在 Firebase Console 將 `school-qfm` 升級為 Blaze 方案；Cloud Functions 需要此方案。
2. 到 Google Cloud Console，切換到 `school-qfm` 專案，開啟「IAM 與管理」→「服務帳戶」。
3. 建立專用服務帳戶，例如 `github-firebase-deploy`，並授予它能部署 Firebase 的專案權限。初次設定可請專案擁有者先授予「Editor」角色；確認成功後，建議改成最小權限角色。
4. 在該服務帳戶的「金鑰」分頁建立新的 JSON 金鑰，下載後請妥善保管，絕對不要提交到 GitHub。
5. 到 GitHub 專案 `school-qfm` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**：
   - Name：`FIREBASE_SERVICE_ACCOUNT_SCHOOL_QFM`
   - Secret：貼上整份下載的 JSON 內容。

完成後，到 GitHub 的 **Actions** 分頁選擇「Deploy Firebase」並按 **Run workflow** 執行第一次部署；日後每次推送 `main` 都會自動部署。

## 驗證

部署成功後，Firebase Console 的 Functions 頁面應出現：

- `authenticateTeacher`
- `resetTeacherPin`
- `countVote`

若工作流程失敗，請在 GitHub Actions 開啟失敗的步驟，查看它要求啟用的 Google Cloud API 或缺少的服務帳戶權限。
