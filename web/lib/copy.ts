// Traditional Chinese copy for the shell (Spec 074 user story 29).
// Every user-facing string lives here; no hardcoded text in components.
export const COPY = {
  appName: "顯恩堂系統",
  login: {
    title: "登入",
    usernameLabel: "用戶名稱",
    passwordLabel: "密碼",
    submit: "登入",
    submitting: "登入中…",
    error: "用戶名稱或密碼不正確。",
    upgradeRequired: "此帳戶需要先設定新密碼才能登入。",
    networkError: "無法連接伺服器，請檢查網路後再試。",
    success: "登入成功。",
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
    restored: "工作階段已還原。",
    expired: "工作階段已過期，請重新登入。",
  },
  logout: {
    submit: "登出",
    error: "登出時發生錯誤，但已安全終止工作階段。",
    failedNotice: "登出請求失敗，但本機工作階段已清除。",
    success: "已登出。",
  },
  sections: {
    profile: "個人檔案",
    programs: "課程與活動",
    events: "聚會管理",
    scanner: "掃描簽到",
    care: "關懷儀表板",
    permissions: "權限管理",
    placeholder: "內容建置中。",
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
  code?: string,
  // _detail reserved for future fallback; centralized copy is the sole user-facing source.
  _detail?: string
): string {
  if (code === "NETWORK_ERROR") {
    return COPY.error.networkError;
  }
  if (code === "AUTH_REQUIRED") {
    return COPY.restore.expired;
  }
  if (code === "FORBIDDEN") {
    return COPY.error.forbidden;
  }
  if (code === "VALIDATION") {
    return COPY.error.validation;
  }
  if (code === "NOT_FOUND" || (code && code.endsWith("_NOT_FOUND"))) {
    return COPY.error.notFound;
  }
  if (code === "CONFLICT") {
    return COPY.error.conflict;
  }
  if (code === "UNAVAILABLE") {
    return COPY.error.unavailable;
  }
  if (code === "INTERNAL_ERROR") {
    return COPY.error.serverError;
  }
  if (code === "MALFORMED_RESPONSE" || code === "MALFORMED_REQUEST") {
    return COPY.error.malformed;
  }
  return COPY.error.unknown;
}

// Traditional Chinese landing-page copy for the signed-out Persuade surface.
// Drawn from the real sections the app ships (Spec 000 / Spec 074); no
// testimonials, metrics, or security claims are invented on this surface.
export const LANDING = {
  skipToLogin: "跳到登入",
  brand: "顯恩堂",
  brandSystem: "系統",
  homeLabel: "顯恩堂系統首頁",
  navLabel: "頁面導覽",
  featuresNav: "認識功能",
  loginNav: "登入",
  heroTitle: "一堂的相聚，有據可依",
  heroSub:
    "將課程報名、聚會管理、掃描簽到與關懷追蹤，收進同一本會友名冊——讓牧養有事可循，讓服事有據可查。",
  primaryCta: "立即登入",
  secondaryCta: "認識功能",
  registerTitle: "一本名冊，涵蓋一堂",
  registerLead: "以下都是顯恩堂系統實際提供的功能。",
  featurePrograms: "課程與活動",
  featureProgramsDesc: "活動與課程的報名、名單，一處掌握。",
  featureEvents: "聚會管理",
  featureEventsDesc: "定期聚會與日程安排，一目了然。",
  featureScanner: "掃描簽到",
  featureScannerDesc: "以 QR 碼即時記錄出席，無需手寫名單。",
  featureCare: "關懷儀表板",
  featureCareDesc: "把需要跟進的會友，放在事奉者眼前。",
  loginPanelLead: "使用你的用戶名稱與密碼。",
  loginAfterNote: "登入後，將進入你獲授權的功能頁面。",
  footerMotto: "一堂之務，一處安放。",
  footerNote: "顯恩堂系統 — 教會管理系統",
} as const;
