// AUTH-05 (#163) — Traditional Chinese copy for self-service registration and
// the Staff/Admin approval queue. Centralized here (matching the shell's
// COPY pattern in lib/copy.ts) so no user-facing string lives in a component.
// Kept separate from lib/copy.ts to avoid coupling this ticket to the
// concurrently-in-flight login landing copy (CF0-08).

export const REGISTRATION_COPY = {
  backToLogin: "返回登入",
  pageTitle: "註冊帳戶",
  pageLead: "提交後，帳戶將在 Staff 或 Admin 審批後啟用。",
  usernameLabel: "用戶名稱",
  passwordLabel: "密碼",
  nameLabel: "姓名",
  phoneLabel: "電話",
  submit: "提交註冊申請",
  submitting: "提交中…",
  missingFields: "請完成所有資料，密碼最少 8 個字元。",
  doneTitle: "申請已提交",
  doneMessage: "教會同工核對後會通知你。帳戶啟用前仍可使用訪客簽到。",
  submittedLive: "註冊申請已提交。",
  guestCheckIn: "訪客簽到",
} as const;

export const QUEUE_COPY = {
  backToHome: "返回首頁",
  pageTitle: "註冊審批",
  pageLead: "檢視待審批的註冊申請。",
  pendingCount: "筆待審核",
  loading: "載入中…",
  empty: "目前沒有待審批的申請。",
  refresh: "重新整理",
  approve: "批准",
  reject: "拒絕",
  approving: "批准中…",
  rejecting: "拒絕中…",
  username: "用戶名稱",
  name: "姓名",
  phone: "電話",
  submittedAt: "提交時間",
  done: "已更新申請狀態。",
  networkError: "無法連接伺服器，請檢查網路後再試。",
  forbidden: "您沒有權限執行此操作。",
  validation: "輸入資料無效，請檢查後再試。",
  conflict: "資料衝突，請重新整理後再試。",
  notFound: "找不到該申請，可能已被處理。",
  unauthorized: "請先登入具備註冊審批權限的帳戶。",
  unavailable: "系統暫時無法使用，請稍後再試。",
  unknownError: "發生未知錯誤，請稍後再試。",
} as const;

// Error-code → user message mapping, mirroring `errorCopyFor`'s vocabulary.
function registrationErrorFor(code: string, detail?: string): string {
  if (code === "NETWORK_ERROR") {
    return QUEUE_COPY.networkError;
  }
  if (code === "AUTH_REQUIRED") {
    return QUEUE_COPY.unauthorized;
  }
  if (code === "FORBIDDEN") {
    return QUEUE_COPY.forbidden;
  }
  if (code === "VALIDATION") {
    return detail ?? QUEUE_COPY.validation;
  }
  if (code === "CONFLICT") {
    return QUEUE_COPY.conflict;
  }
  if (code === "NOT_FOUND" || code.endsWith("_NOT_FOUND")) {
    return QUEUE_COPY.notFound;
  }
  if (code === "UNAVAILABLE") {
    return QUEUE_COPY.unavailable;
  }
  return QUEUE_COPY.unknownError;
}
export function registrationErrorCopy(code: string, detail?: string): string {
  return registrationErrorFor(code, detail);
}
