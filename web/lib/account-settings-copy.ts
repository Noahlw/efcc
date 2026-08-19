// Spec 084 (Ticket 084-03 / #305) — Traditional Chinese copy for the Profile 帳戶設定
// (Account Settings) surface and sub-screens against canonical prototype design
// (design/efcc-participant-checkin-prototype.html).

const SESSION_EXPIRED = "工作階段已過期，請重新登入。";

export const ACCOUNT_SETTINGS_COPY = {
  sectionTitle: "帳戶設定",
  sectionLead: "更新你的登入資料。",
  backToProfile: "帳戶",
  headerTitle: "帳戶設定",

  // Section 1: 更改登入名稱
  usernameTitle: "更改登入名稱",
  usernameLabel: "新登入名稱",
  usernameHint: "用戶名稱用於登入；大小寫與前後空白不會影響唯一性。",
  usernameSubmit: "儲存登入名稱",
  usernameSubmitting: "儲存中…",
  usernameSuccess: "登入名稱已更新",
  missingUsername: "請輸入新登入名稱。",
  usernameTaken: "此用戶名稱已被使用。",
  usernameUnchanged: "用戶名稱沒有變更。",

  // Section 2: 更改密碼
  passwordTitle: "更改密碼",
  currentPasswordLabel: "現時密碼",
  newPasswordLabel: "新密碼",
  confirmPasswordLabel: "確認新密碼",
  passwordHint: "最少 8 個字元。",
  passwordNotice: "更改密碼後，你需要在所有裝置重新登入。",
  passwordSubmit: "更改密碼",
  passwordSubmitting: "更改中…",
  missingPasswordFields: "請輸入現時密碼及最少 8 個字元的新密碼。",
  passwordMismatch: "兩次輸入的新密碼不一致。",
  shortPassword: "最少 8 個字元。",
  wrongCurrentPassword: "現時密碼不正確。",
  passwordSuccess: "密碼已更新，請重新登入",

  // Offline and general errors
  offlineError: "未能更新。請重新連線後再試。",
  updated: "帳戶資料已更新。",
  updatedDetail: "所有登入工作階段已終止，即將返回登入頁面。",
  redirecting: "正在返回登入頁面…",
  networkError: "未能更新。請重新連線後再試。",
  retry: "重試連接",
  unavailable: "系統暫時無法使用，請稍後再試。",
  forbidden: "您沒有權限執行此操作。",
  validationError: "輸入資料無效，請檢查後再試。",
  genericError: "發生錯誤，請稍後再試。",
  sessionExpired: SESSION_EXPIRED,
} as const;

export function accountSettingsErrorCopy(
  code: string | undefined,
  detail?: string,
  field: "username" | "password" = "password"
): string {
  if (code === "NETWORK_ERROR") return ACCOUNT_SETTINGS_COPY.networkError;
  if (code === "AUTH_REQUIRED") return ACCOUNT_SETTINGS_COPY.sessionExpired;
  if (code === "FORBIDDEN") return ACCOUNT_SETTINGS_COPY.forbidden;
  if (code === "CONFLICT") {
    return field === "username"
      ? ACCOUNT_SETTINGS_COPY.usernameTaken
      : ACCOUNT_SETTINGS_COPY.genericError;
  }
  if (code === "VALIDATION") {
    const d = (detail ?? "").toLowerCase();
    if (
      d.includes("current password is incorrect") ||
      d.includes("wrong current password")
    ) {
      return ACCOUNT_SETTINGS_COPY.wrongCurrentPassword;
    }
    if (d.includes("at least 8 characters") || d.includes("8 chars")) {
      return ACCOUNT_SETTINGS_COPY.shortPassword;
    }
    if (d.includes("username is required")) {
      return ACCOUNT_SETTINGS_COPY.missingUsername;
    }
    if (d.includes("mismatch") || d.includes("passwords do not match")) {
      return ACCOUNT_SETTINGS_COPY.passwordMismatch;
    }
    return ACCOUNT_SETTINGS_COPY.validationError;
  }
  if (code === "UNAVAILABLE") return ACCOUNT_SETTINGS_COPY.unavailable;
  return ACCOUNT_SETTINGS_COPY.genericError;
}