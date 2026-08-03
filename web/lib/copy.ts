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
  restore: {
    loading: "正在還原工作階段…",
    expired: "工作階段已過期，請重新登入。",
  },
  logout: {
    submit: "登出",
    error: "登出時發生錯誤，但已安全終止工作階段。",
  },
  nav: {
    backToHome: "返回首頁",
    loading: "載入中…",
    unauthorized: "您沒有權限存取此頁面。",
    unknownRoute: "找不到此頁面。",
    label: "主要導航",
  },
  error: {
    networkError: "無法連接伺服器，請檢查網路後再試。",
    unavailable: "系統暫時無法使用，請稍後再試。",
    serverError: "伺服器發生錯誤，請稍後再試。",
    forbidden: "您沒有權限執行此操作。",
    validation: "輸入資料無效，請檢查後再試。",
    notFound: "找不到請求的資料。",
    conflict: "資料衝突，請重新整理後再試。",
    malformed: "伺服器回應格式錯誤。",
    unknown: "發生未知錯誤。",
    retry: "重試",
  },
} as const;

export function errorCopyFor(
  code: string | undefined,
  detail?: string
): string {
  if (code === "NETWORK_ERROR") {return COPY.error.networkError;}
  if (code === "AUTH_REQUIRED") {return COPY.restore.expired;}
  if (code === "FORBIDDEN") {return COPY.error.forbidden;}
  if (code === "VALIDATION") {return COPY.error.validation;}
  if (code === "NOT_FOUND" || (code && code.endsWith("_NOT_FOUND")))
    {return COPY.error.notFound;}
  if (code === "CONFLICT") {return COPY.error.conflict;}
  if (code === "UNAVAILABLE") {return COPY.error.unavailable;}
  if (code === "INTERNAL_ERROR") {return COPY.error.serverError;}
  if (code === "MALFORMED_RESPONSE" || code === "MALFORMED_REQUEST")
    {return COPY.error.malformed;}
  return detail || COPY.error.unknown;
}
