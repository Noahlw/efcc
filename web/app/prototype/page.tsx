"use client";

import { useState, useCallback } from "react";
import styles from "./prototype.module.css";

/* System copy constants drawn from real product behavior (Spec 000 / Spec 074 / Spec 077) */
const SYSTEM_TITLE = "中國基督教播道會顯恩堂";

/*
 * Expansion contract (Spec 079): the prototype is the faithful design.
 * THESIS: a minimal civic-operational shell for one congregation; refuses the
 * SaaS marketing hero, slogans, and decorative cheer.
 * OWN-WORLD: off-white surface, ink type, hairline rules, one cinnabar accent
 * for submission and active state.
 * STORY: every surface the product actually ships, mockable in one artifact,
 * so the live codebase rebuilds onto this record rather than the reverse.
 * FIRST VIEWPORT: login — 2-col on desktop (minimal system copy left, form
 * right); stacked on phone with the form first.
 * FORM: Variant switch A/B/C over token sets; role switch Staff/Member for
  * shell gating; viewport switch for the response doctrine.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 * finish review, the verdict, and DESIGN.md.
 */
const SYSTEM_DESCRIPTION =
  "會友與教會同工的內部營運系統。";

type Variant = "A" | "B" | "C";
type Viewport = "mobile" | "desktop";
type AuthorizedRole = "Admin" | "Staff" | "Member";
type Surface =
  | "login"
  | "upgrade"
  | "register"
  | "approval"
  | "profile"
  | "programs"
  | "events"
  | "scanner"
  | "care"
  | "permissions"
  | "settings"
  | "loading"
  | "empty"
  | "error"
  | "recovery";

/* Canonical shell sections (Spec 000 / ADR-0025 roles). */
const SECTION_ITEMS = [
  { id: "profile", label: "個人檔案" },
  { id: "programs", label: "課程與活動" },
  { id: "events", label: "聚會管理" },
  { id: "scanner", label: "掃描簽到" },
  { id: "care", label: "關懷" },
  { id: "permissions", label: "權限與角色" },
] as const;

const ADMIN_STAFF_SECTION_IDS: Record<string, true> = {
  profile: true,
  programs: true,
  events: true,
  scanner: true,
  care: true,
  permissions: true,
};
const MEMBER_SECTION_IDS: Record<string, true> = {
  profile: true,
  programs: true,
};
/* Admin and Staff share the full authenticated shell; Member is restricted. */
const SECTION_IDS_FOR_ROLE: Record<AuthorizedRole, Record<string, true>> = {
  Admin: ADMIN_STAFF_SECTION_IDS,
  Staff: ADMIN_STAFF_SECTION_IDS,
  Member: MEMBER_SECTION_IDS,
};

export default function RedesignPrototypePage() {
  const [variant, setVariant] = useState<Variant>("A");
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [role, setRole] = useState<AuthorizedRole>("Staff");
  const [surface, setSurface] = useState<Surface>("login");
  const [loginError, setLoginError] = useState<string | null>(null);

  // ponytail: mock-only gallery gate — no API call, no session mutation.
  // The prototype is a local dev gallery only; noah/6883 lets the
  // designer walk every surface without a live backend. It is compiled
  // out of the production build (NODE_ENV guard) so no production
  // credential backdoor survives.
  const handlePrototypeLogin = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const username = (fd.get("username") as string).trim();
    const password = fd.get("password") as string;
    if (
      process.env.NODE_ENV !== "production" &&
      username === "noah" &&
      password === "6883"
    ) {
      setLoginError(null);
      setSurface("profile");
    } else {
      setLoginError("用戶名稱或密碼不正確。");
    }
  }, []);

  return (
    <div className={`${styles.container} ${styles[`variant${variant}`]}`}>
      {/* Top Prototype Control Panel */}
      <header className={styles.protoHeader}>
        <div className={styles.protoBrand}>
          <span className={styles.protoBadge}>PROTOTYPE (Issue #178)</span>
          <h1>EFCC Minimal Redesign — Interactive Prototype</h1>
        </div>

        <div className={styles.protoControls}>
          <div className={styles.controlGroup}>
            <label className={styles.controlLabel}>Design Variant:</label>
            <div className={styles.buttonGroup}>
              <button
                className={variant === "A" ? styles.activeBtn : ""}
                onClick={() => setVariant("A")}
              >
                A: Official Civic
              </button>
              <button
                className={variant === "B" ? styles.activeBtn : ""}
                onClick={() => setVariant("B")}
              >
                B: Congregation Register
              </button>
              <button
                className={variant === "C" ? styles.activeBtn : ""}
                onClick={() => setVariant("C")}
              >
                C: Slate Command Desk
              </button>
            </div>
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.controlLabel}>Viewport:</label>
            <div className={styles.buttonGroup}>
              <button
                className={viewport === "desktop" ? styles.activeBtn : ""}
                onClick={() => setViewport("desktop")}
              >
                Desktop (1280px)
              </button>
              <button
                className={viewport === "mobile" ? styles.activeBtn : ""}
                onClick={() => setViewport("mobile")}
              >
                Phone (375px)
              </button>
            </div>
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.controlLabel}>Authorized Role:</label>
            <div className={styles.buttonGroup}>
              <button
                className={role === "Admin" ? styles.activeBtn : ""}
                onClick={() => setRole("Admin")}
              >
                Admin
              </button>
              <button
                className={role === "Staff" ? styles.activeBtn : ""}
                onClick={() => setRole("Staff")}
              >
                Staff
              </button>
              <button
                className={role === "Member" ? styles.activeBtn : ""}
                onClick={() => setRole("Member")}
              >
                Member
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Surface Selector Navigation */}
      <nav className={styles.surfaceNav} aria-label="Prototype Surface Selector">
        <span className={styles.navGroupLabel}>Public & Auth:</span>
        <button
          className={surface === "login" ? styles.activeSurface : ""}
          onClick={() => setSurface("login")}
        >
          登入 (Login)
        </button>
        <button
          className={surface === "upgrade" ? styles.activeSurface : ""}
          onClick={() => setSurface("upgrade")}
        >
          設定新密碼 (PIN Upgrade)
        </button>
        <button
          className={surface === "register" ? styles.activeSurface : ""}
          onClick={() => setSurface("register")}
        >
          註冊帳戶 (Register)
        </button>
        {role !== "Member" && (
          <button
            className={surface === "approval" ? styles.activeSurface : ""}
            onClick={() => setSurface("approval")}
          >
            審核隊列 (Approval)
          </button>
        )}

        <span className={styles.navGroupLabel}>Authenticated Sections:</span>
        <button
          className={surface === "profile" ? styles.activeSurface : ""}
          onClick={() => setSurface("profile")}
        >
          個人檔案 (Profile)
        </button>
        <button
          className={surface === "programs" ? styles.activeSurface : ""}
          onClick={() => setSurface("programs")}
        >
          課程與活動 (Programs)
        </button>
        <button
          className={surface === "events" ? styles.activeSurface : ""}
          onClick={() => setSurface("events")}
        >
          聚會管理 (Events)
        </button>
        <button
          className={surface === "scanner" ? styles.activeSurface : ""}
          onClick={() => setSurface("scanner")}
        >
          掃描簽到 (Scanner)
        </button>
        <button
          className={surface === "care" ? styles.activeSurface : ""}
          onClick={() => setSurface("care")}
        >
          關懷儀表板 (Care)
        </button>
        <button
          className={surface === "permissions" ? styles.activeSurface : ""}
          onClick={() => setSurface("permissions")}
        >
          權限與角色 (Permissions)
        </button>

        <span className={styles.navGroupLabel}>Profile Sub-Surface:</span>
        <button
          className={surface === "settings" ? styles.activeSurface : ""}
          onClick={() => setSurface("settings")}
        >
          帳戶資料 (Account Settings)
        </button>

        <span className={styles.navGroupLabel}>System States:</span>
        <button
          className={surface === "loading" ? styles.activeSurface : ""}
          onClick={() => setSurface("loading")}
        >
          載入中 (Loading)
        </button>
        <button
          className={surface === "empty" ? styles.activeSurface : ""}
          onClick={() => setSurface("empty")}
        >
          無資料 (Empty)
        </button>
        <button
          className={surface === "error" ? styles.activeSurface : ""}
          onClick={() => setSurface("error")}
        >
          錯誤 (Error / 403)
        </button>
        <button
          className={surface === "recovery" ? styles.activeSurface : ""}
          onClick={() => setSurface("recovery")}
        >
          還原 (Recovery)
        </button>
      </nav>

      {/* Main Preview Stage */}
      <main className={styles.stage}>
        <div
          className={`${styles.viewportFrame} ${
            viewport === "mobile" ? styles.mobileFrame : styles.desktopFrame
          }`}
        >
          <RenderSurface
            surface={surface}
            variant={variant}
            viewport={viewport}
            role={role}
            onNavigate={(nextSurface) => setSurface(nextSurface)}
          onLogin={handlePrototypeLogin}
          loginError={loginError}
          />
        </div>
      </main>

      {/* System Palette & Tokens Legend */}
      <footer className={styles.tokensLegend}>
        <h3>Current System Primitives — Variant {variant}</h3>
        <div className={styles.tokenGrid}>
          <div className={styles.tokenCard}>
            <span className={styles.swatch} style={{ background: "var(--bg-primary)" }} />
            <span>Base Surface</span>
          </div>
          <div className={styles.tokenCard}>
            <span className={styles.swatch} style={{ background: "var(--bg-card)" }} />
            <span>Card Surface</span>
          </div>
          <div className={styles.tokenCard}>
            <span className={styles.swatch} style={{ background: "var(--txt-primary)" }} />
            <span>Ink Primary</span>
          </div>
          <div className={styles.tokenCard}>
            <span className={styles.swatch} style={{ background: "var(--accent)" }} />
            <span>Action Accent</span>
          </div>
          <div className={styles.tokenCard}>
            <span className={styles.swatch} style={{ background: "var(--border)" }} />
            <span>Divider Rule</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function RenderSurface({
  surface,
  variant,
  viewport,
  role,
  onNavigate,
  onLogin,
  loginError,
}: {
  surface: Surface;
  variant: Variant;
  viewport: Viewport;
  role: AuthorizedRole;
  onNavigate: (surface: Surface) => void;
  onLogin: (e: React.FormEvent<HTMLFormElement>) => void;
  loginError: string | null;
}) {
  switch (surface) {
    case "login":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} />
         <div
           className={`${styles.mockBodyCenter} ${
             viewport === "mobile" ? styles.mockBodyCenterMobile : ""
           }`}
         >
            <div
              className={`${styles.splitLogin} ${
                viewport === "mobile" ? styles.splitLoginMobile : ""
              }`}
            >
              <div className={styles.formCard}>
                <div className={styles.cardHead}>
                  <h3>登入系統</h3>
                </div>
                <p className={styles.cardLead}>使用你的用戶名稱與密碼。</p>
                <form onSubmit={onLogin} className={styles.form}>
                  <div className={styles.field}>
                   <label htmlFor="prototype-login-username">用戶名稱</label>
                    <input
                      id="prototype-login-username"
                      name="username"
                      type="text"
                      placeholder="—"
                      autoComplete="username"
                      required
                    />
                  </div>
                  <div className={styles.field}>
                   <label htmlFor="prototype-login-password">密碼</label>
                    <input
                      id="prototype-login-password"
                      name="password"
                      type="password"
                      placeholder="—"
                      autoComplete="current-password"
                      required
                    />
                  </div>
                  {loginError && (
                    <p role="alert" className={styles.fieldError}>{loginError}</p>
                  )}
                  <button type="submit" className={styles.btnPrimary}>
                    登入
                  </button>
                  <p className={styles.fieldNote}>
                   登入後，將進入你獲授權的功能頁面。
                  </p>
                </form>
              </div>
              <div className={styles.loginCopy}>
                <h2>{SYSTEM_TITLE}</h2>
                <p>{SYSTEM_DESCRIPTION}</p>
              </div>
            </div>
          </div>
        </div>
      );

    case "upgrade":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} />
          <div className={styles.mockBody}>
            <div className={styles.formCardSingle}>
              <div className={styles.cardHead}>
                <h3>設定新密碼</h3>
              </div>
              <div className={styles.noticeAlert} role="alert">
                此帳戶需要先設定新密碼才能登入。
              </div>
              <form onSubmit={(e) => e.preventDefault()} className={styles.form}>
                <div className={styles.field}>
                 <label htmlFor="prototype-upgrade-username">用戶名稱</label>
                   <input id="prototype-upgrade-username" type="text" placeholder="E2E_ test fixture" disabled autoComplete="username" />
                </div>
                <div className={styles.field}>
                 <label htmlFor="prototype-upgrade-pin">舊 PIN 碼</label>
                   <input id="prototype-upgrade-pin" type="password" placeholder="—" autoComplete="current-password" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} required />
                </div>
                <div className={styles.field}>
                 <label htmlFor="prototype-upgrade-new">新密碼</label>
                   <input id="prototype-upgrade-new" type="password" placeholder="—" autoComplete="new-password" minLength={8} required />
                </div>
                <button type="submit" className={styles.btnPrimary}>
                  設定新密碼並登入
                </button>
              </form>
            </div>
          </div>
        </div>
      );

    case "register":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} />
          <div className={styles.mockBody}>
            <div className={styles.formCardSingle}>
              <h3>註冊帳戶</h3>
              <p className={styles.cardLead}>填寫資料以申請顯恩堂系統會友帳戶。</p>
              <form onSubmit={(e) => e.preventDefault()} className={styles.form}>
                <div className={styles.field}>
                 <label htmlFor="prototype-register-name">中文姓名</label>
                 <input id="prototype-register-name" type="text" placeholder="—" autoComplete="name" required />
                </div>
                <div className={styles.field}>
                 <label htmlFor="prototype-register-username">用戶名稱</label>
                 <input id="prototype-register-username" type="text" placeholder="建議使用英文或數字" autoComplete="username" required />
                </div>
                <div className={styles.field}>
                 <label htmlFor="prototype-register-phone">聯絡電話</label>
                 <input id="prototype-register-phone" type="tel" placeholder="8 位數香港電話號碼" autoComplete="tel" inputMode="tel" required />
                </div>
                <div className={styles.field}>
                 <label htmlFor="prototype-register-password">密碼</label>
                 <input id="prototype-register-password" type="password" placeholder="請設定登入密碼" autoComplete="new-password" minLength={8} required />
                </div>
                <button type="submit" className={styles.btnPrimary}>
                  提交註冊申請
                </button>
              </form>
            </div>
          </div>
        </div>
      );

    case "approval":
      if (role === "Member") {
        return (
          <div className={styles.mockShell}>
            <MockHeader title={SYSTEM_TITLE} authenticated />
            <div className={styles.mockBody}>
              <div className={styles.stateCenter}>
                <div className={styles.noticeAlert} role="alert">
                  您沒有權限執行此操作。
                </div>
                <button type="button" className={styles.btnPrimary} onClick={() => onNavigate("profile")}>
                  返回個人檔案
                </button>
              </div>
            </div>
            <MockNav active="profile" viewport={viewport} role={role} onNavigate={onNavigate} />
          </div>
        );
      }
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} authenticated />
          <div className={styles.mockBody}>
            <div className={styles.sectionHead}>
              <h2>註冊審核隊列</h2>
             <span className={styles.badgeCount}>N 筆待審核</span>
            </div>
            <div className={styles.dataGrid}>
              <div className={styles.dataRow}>
                <div>
                 <strong className={styles.placeholder}>— 申請者 —</strong>
                 <span className={`${styles.subText} ${styles.placeholder}`}>— 電話 — • — 申請日期 —</span>
                </div>
                <div className={styles.actionRow}>
                  <button type="button" className={styles.btnSmSuccess}>批准 Member</button>
                  <button type="button" className={styles.btnSmDanger}>拒絕</button>
                </div>
              </div>
              <div className={styles.dataRow}>
                <div>
                 <strong className={styles.placeholder}>— 申請者 —</strong>
                 <span className={`${styles.subText} ${styles.placeholder}`}>— 電話 — • — 申請日期 —</span>
                </div>
                <div className={styles.actionRow}>
                  <button type="button" className={styles.btnSmSuccess}>批准 Member</button>
                  <button type="button" className={styles.btnSmDanger}>拒絕</button>
                </div>
              </div>
            </div>
          </div>
          <MockNav active="permissions" viewport={viewport} role={role} />
        </div>
      );

    case "profile":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} authenticated />
         <div className={styles.profileLayout}>
           <div className={styles.profileBar}>
               <div className={styles.avatar}>—</div>
             <div className={styles.profileMeta}>
               <span className={`${styles.profileName} ${styles.placeholder}`}>— 姓名 (用戶名稱) —</span>
                <span className={styles.roleTag}>{role}</span>
                </div>
             <div className={styles.profileQuickInfo}>
                 <span className={styles.placeholder}>— 電話 —</span>
                 <span>— 狀態 —</span>
              </div>
                </div>
          <div className={styles.profileActions}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => onNavigate("settings")}
            >
              帳戶資料
            </button>
          </div>
           <div className={styles.qrCenter}>
            <div className={styles.qrSquare} role="img" aria-label="簽到 QR 碼（示意）">
              <span className={styles.qrFind} data-corner="tl" />
              <span className={styles.qrFind} data-corner="tr" />
              <span className={styles.qrFind} data-corner="bl" />
            </div>
            <p className={styles.qrCaption}>簽到 QR 碼（示意）</p>
                </div>
                </div>
          <MockNav active="profile" viewport={viewport} role={role} />
              </div>
      );

    case "programs":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} authenticated />
          <div className={styles.mockBody}>
            <div className={styles.sectionHead}>
              <h2>課程與活動</h2>
            </div>
           <div className={styles.stateCenter}>
             <p className={styles.placeholderText}>內容建置中</p>
            </div>
              </div>
          <MockNav active="programs" viewport={viewport} role={role} />
                </div>
      );

    case "events":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} authenticated />
          <div className={styles.mockBody}>
            <div className={styles.sectionHead}>
              <h2>聚會管理</h2>
            </div>
           <div className={styles.stateCenter}>
             <p className={styles.placeholderText}>內容建置中</p>
            </div>
              </div>
          <MockNav active="events" viewport={viewport} role={role} />
                </div>
      );

    case "scanner":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} authenticated />
          <div className={styles.mockBody}>
            <div className={styles.sectionHead}>
              <h2>掃描簽到</h2>
            </div>
           <div className={styles.stateCenter}>
             <p className={styles.placeholderText}>內容建置中</p>
            </div>
            </div>
          <MockNav active="scanner" viewport={viewport} role={role} />
            </div>
      );

    case "care":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} authenticated />
          <div className={styles.mockBody}>
            <div className={styles.sectionHead}>
              <h2>關懷儀表板</h2>
            </div>
           <div className={styles.stateCenter}>
             <p className={styles.placeholderText}>內容建置中</p>
            </div>
              </div>
          <MockNav active="care" viewport={viewport} role={role} />
                </div>
      );

    case "permissions":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} authenticated />
          <div className={styles.mockBody}>
            <div className={styles.sectionHead}>
              <h2>權限與角色管理</h2>
            </div>
          <div className={styles.permCard}>
            <div className={styles.permRow}>
              <span className={styles.permLabel}>本帳戶角色</span>
              <span className={styles.roleTag}>{role}</span>
            </div>
            <div className={styles.permRow}>
              <span className={styles.permLabel}>可瀏覽區塊</span>
              <span className={styles.permValue}>
                {SECTION_ITEMS.filter(
                  (item) => SECTION_IDS_FOR_ROLE[role][item.id]
                )
                  .map((item) => item.label)
                  .join("・")}
              </span>
            </div>
            <p className={styles.permNote}>
              角色與權限調整屬管理範圍；此頁僅顯示目前狀態。
            </p>
          </div>
              </div>
          <MockNav active="permissions" viewport={viewport} role={role} />
                </div>
      );

    case "settings":
      return (
        <AccountSettings
          viewport={viewport}
          role={role}
          onNavigate={onNavigate}
        />
      );

    case "loading":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} />
          <div className={styles.stateCenter} role="status">
            <div className={styles.spinner} />
            <p>正在還原工作階段…</p>
          </div>
        </div>
      );

    case "empty":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} authenticated />
          <div className={styles.mockBody}>
            <div className={styles.sectionHead}>
              <h2>課程與活動</h2>
            </div>
            <div className={styles.stateCenter}>
             <p className={styles.placeholderText}>目前沒有課程資料。</p>
            </div>
          </div>
          <MockNav active="programs" viewport={viewport} role={role} />
        </div>
      );

    case "error":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} />
          <div className={styles.stateCenter}>
            <div className={styles.noticeAlert} role="alert">
              您沒有權限執行此操作。
            </div>
            <button type="button" className={styles.btnSecondary}>返回個人檔案</button>
          </div>
        </div>
      );

    case "recovery":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} />
          <div className={styles.stateCenter}>
            <div className={styles.noticeAlert} role="alert">
              無法連接伺服器，請檢查網路後再試。
            </div>
            <button type="button" className={styles.btnPrimary}>重試連接</button>
          </div>
        </div>
      );
  }
}

function AccountSettings({
  viewport,
  role,
  onNavigate,
}: {
  viewport: Viewport;
  role: AuthorizedRole;
  onNavigate: (surface: Surface) => void;
}) {
  return (
    <div className={styles.mockShell}>
      <MockHeader title={SYSTEM_TITLE} authenticated />
      <div
        className={`${styles.mockBody} ${
          viewport === "mobile" ? styles.settingsBodyMobile : ""
        }`}
      >
        <div className={styles.sectionHead}>
          <h2>帳戶資料</h2>
        </div>
        <div className={styles.successNotice} role="status">
          帳戶資料已更新，請重新登入。
        </div>
        <div className={styles.settingsStack}>
          <div className={styles.settingsCard}>
            <h3>更改用戶名稱</h3>
            <form onSubmit={(e) => e.preventDefault()} className={styles.form}>
              <div className={styles.field}>
                <label htmlFor="prototype-settings-username">新用戶名稱</label>
                <input
                  id="prototype-settings-username"
                  type="text"
                  placeholder="—"
                  autoComplete="username"
                  aria-describedby="prototype-settings-username-error"
                  aria-invalid
                  required
                />
              </div>
              <div
                id="prototype-settings-username-error"
                className={styles.formError}
                role="alert"
              >
                此用戶名稱已被使用
              </div>
              <button type="submit" className={styles.btnPrimary}>
                更新用戶名稱
              </button>
            </form>
          </div>
          <div className={styles.settingsCard}>
            <h3>更改密碼</h3>
            <form onSubmit={(e) => e.preventDefault()} className={styles.form}>
              <div className={styles.field}>
                <label htmlFor="prototype-settings-current">目前密碼</label>
                <input
                  id="prototype-settings-current"
                  type="password"
                  placeholder="—"
                  autoComplete="current-password"
                   aria-describedby="prototype-settings-current-error"
                   aria-invalid
                  required
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="prototype-settings-new">新密碼</label>
                <input
                  id="prototype-settings-new"
                  type="password"
                  placeholder="—"
                  autoComplete="new-password"
                  aria-describedby="prototype-settings-password-hint"
                  minLength={8}
                  required
                />
              </div>
              <div
                id="prototype-settings-current-error"
                className={styles.formError}
                role="alert"
              >
                目前密碼不正確
              </div>
              <p id="prototype-settings-password-hint" className={styles.formHint}>
                密碼須至少 8 個字元。
              </p>
              <button type="submit" className={styles.btnPrimary}>
                更新密碼
              </button>
            </form>
          </div>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => onNavigate("profile")}
          >
            返回個人檔案
          </button>
        </div>
      </div>
      <MockNav
        active="profile"
        viewport={viewport}
        role={role}
        onNavigate={onNavigate}
      />
    </div>
  );
}

function MockHeader({
  title,
  authenticated = false,
}: {
  title: string;
  authenticated?: boolean;
}) {
  return (
    <header className={styles.shellHeader}>
      <div className={styles.shellBrand}>
        <span className={styles.shellTitle}>{title}</span>
      </div>
      {authenticated && (
        <button type="button" className={styles.btnSignOut}>
          登出
        </button>
      )}
    </header>
  );
}

function MockNav({
  active,
  viewport,
  role,
  onNavigate,
}: {
  active: string;
  viewport: Viewport;
  role: AuthorizedRole;
  onNavigate?: (surface: Surface) => void;
}) {
  const items = SECTION_ITEMS.filter(
    (item) => SECTION_IDS_FOR_ROLE[role][item.id]
  );

  return (
    <nav
      className={`${styles.shellNav} ${
        viewport === "mobile" ? styles.navPhone : styles.navDesktop
      }`}
      aria-label="主要導航"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`${styles.navItem} ${
            active === item.id ? styles.navItemActive : ""
          }`}
          aria-current={active === item.id ? "page" : undefined}
          onClick={() => onNavigate?.(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
