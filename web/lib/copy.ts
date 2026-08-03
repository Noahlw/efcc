// Traditional Chinese copy for the shell (Spec 074 user story 29).
// Every user-facing string lives here; no hardcoded text in components.
export const COPY = {
  appName: "顯恩堂系統",
  login: {
    title: "登入",
    usernameLabel: "用戶名稱",
    pinLabel: "PIN 碼",
    submit: "登入",
    submitting: "登入中…",
    error: "用戶名稱或 PIN 碼不正確。",
    networkError: "無法連接伺服器，請檢查網路後再試。",
  },
  profile: {
    title: "個人資料",
    name: "姓名",
    username: "用戶名稱",
    phone: "電話",
    role: "角色",
    status: "狀態",
    qrCode: "QR Code",
  },
  status: {
    loading: "載入中…",
    error: "發生錯誤",
  },
} as const;
