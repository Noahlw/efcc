// UI-04 (#196) — Traditional Chinese copy for the Profile 帳戶資料 (Account
// Settings) sub-surface. Centralized here (mirroring lib/registration-copy.ts,
// which keeps ticket-scoped copy out of lib/copy.ts) so no user-facing string
// lives in a component and no credential/token material ever appears.
//
// Error-code → user message mapping mirrors `errorCopyFor`'s vocabulary plus the
// Spec #191 inline-error contract: 409 duplicate username, 422
// wrong-current-password, short password, and validation all render inline.

const SESSION_EXPIRED = "工作階段已過期，請重新登入。";

export const ACCOUNT_SETTINGS_COPY = {
  sectionTitle: "帳戶資料",
  sectionLead: "更新你的登入用戶名稱或密碼。更改後將需要重新登入。",
  usernameTitle: "更改用戶名稱",
  usernameLabel: "新用戶名稱",
  usernameHint: "用戶名稱用於登入；大小寫與前後空白不會影響唯一性。",
  usernameSubmit: "更新用戶名稱",
  usernameSubmitting: "更新中…",
  passwordTitle: "更改密碼",
  currentPasswordLabel: "目前密碼",
  newPasswordLabel: "新密碼",
  passwordHint: "密碼須至少 8 個字元。",
  passwordSubmit: "更新密碼",
  passwordSubmitting: "更新中…",
  missingUsername: "請輸入用戶名稱。",
  missingPasswordFields: "請輸入目前密碼及新密碼。",
  shortPassword: "密碼須至少 8 個字元。",
  usernameTaken: "此用戶名稱已被使用。",
  wrongCurrentPassword: "目前密碼不正確。",
  usernameUnchanged: "用戶名稱沒有變更。",
  updated: "帳戶資料已更新。",
  updatedDetail: "所有登入工作階段已終止，即將返回登入頁面。",
  redirecting: "正在返回登入頁面…",
  networkError: "無法連接伺服器，請檢查網路後再試。",
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
  if (code === "NETWORK_ERROR") {
    return ACCOUNT_SETTINGS_COPY.networkError;
  }
  if (code === "AUTH_REQUIRED") {
    return ACCOUNT_SETTINGS_COPY.sessionExpired;
  }
  if (code === "FORBIDDEN") {
    return ACCOUNT_SETTINGS_COPY.forbidden;
  }
  if (code === "CONFLICT") {
    return field === "username"
      ? ACCOUNT_SETTINGS_COPY.usernameTaken
      : ACCOUNT_SETTINGS_COPY.genericError;
  }
  if (code === "VALIDATION") {
    const d = (detail ?? "").toLowerCase();
    if (d.includes("current password is incorrect")) {
      return ACCOUNT_SETTINGS_COPY.wrongCurrentPassword;
    }
    if (d.includes("at least 8 characters") || d.includes("8 chars")) {
      return ACCOUNT_SETTINGS_COPY.shortPassword;
    }
    if (d.includes("username is required")) {
      return ACCOUNT_SETTINGS_COPY.missingUsername;
    }
    return ACCOUNT_SETTINGS_COPY.validationError;
  }
  if (code === "UNAVAILABLE") {
    return ACCOUNT_SETTINGS_COPY.unavailable;
  }
  return ACCOUNT_SETTINGS_COPY.genericError;
}
