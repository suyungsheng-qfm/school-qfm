# 導師基本登入（801～812）

導師代號限定 `801` 到 `812`。導師在 [teacher-login.html](teacher-login.html) 首次登入時自行設定 6 位數字驗證碼；後續使用代號與該驗證碼登入。驗證碼只以不可逆雜湊值保存於 Firebase，管理者不能查看或指定其內容。

管理者登入 `admin.html` 後，可在「導師驗證碼重置」選擇代號並重置為未設定。導師下次登入時才可設定新的驗證碼。

## 部署必要步驟

這項功能使用 Cloud Functions，請在 `functions` 資料夾安裝相依套件後，從專案根目錄部署：

```powershell
cd functions
npm install
cd ..
firebase deploy --only functions,firestore:rules,hosting
```

管理者 Firebase 帳號必須有 custom claim `{ admin: true }`，重置功能才會成功。

> 注意：代號本身是公開且容易猜測的。首次設定驗證碼時，任何先取得該代號的人都可先行設定；請只在校內受信任的情境下啟用，並在發現異常時由管理者立即重置。系統已加入連續 5 次錯誤後暫停 15 分鐘的防護。
