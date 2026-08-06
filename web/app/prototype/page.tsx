"use client";

import { useState } from "react";
import styles from "./prototype.module.css";

/* System copy constants drawn from real product behavior (Spec 000 / Spec 074 / Spec 077) */
const SYSTEM_TITLE = "中國基督教播道會顯恩堂";

type Variant = "A" | "B" | "C";
type Viewport = "mobile" | "desktop";
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
  | "loading"
  | "empty"
  | "error"
  | "recovery";

export default function RedesignPrototypePage() {
  const [variant, setVariant] = useState<Variant>("A");
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [surface, setSurface] = useState<Surface>("login");

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
        <button
          className={surface === "approval" ? styles.activeSurface : ""}
          onClick={() => setSurface("approval")}
        >
          審核隊列 (Approval)
        </button>

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
          權限管理 (Permissions)
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
          <RenderSurface surface={surface} variant={variant} viewport={viewport} />
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
}: {
  surface: Surface;
  variant: Variant;
  viewport: Viewport;
}) {
  switch (surface) {
    case "login":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} />
         <div className={styles.mockBodyCenter}>
              <div className={styles.formCard}>
                <div className={styles.cardHead}>
                  <SealSlot />
                  <h3>登入系統</h3>
                  </div>
                <p className={styles.cardLead}>使用你的用戶名稱與密碼。</p>
                <form onSubmit={(e) => e.preventDefault()} className={styles.form}>
                  <div className={styles.field}>
                   <label htmlFor="prototype-login-username">用戶名稱</label>
                   <input id="prototype-login-username" type="text" placeholder="E2E_ test fixture" autoComplete="username" />
                  </div>
                  <div className={styles.field}>
                   <label htmlFor="prototype-login-password">密碼</label>
                   <input id="prototype-login-password" type="password" placeholder="—" autoComplete="current-password" />
                  </div>
                  <button type="button" className={styles.btnPrimary}>
                    登入
                  </button>
                  <p className={styles.fieldNote}>
                   登入後，將進入你獲授權的功能頁面。
                  </p>
                </form>
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
                <SealSlot />
                <h3>設定新密碼</h3>
              </div>
              <div className={styles.noticeAlert}>
                此帳戶需要先設定新密碼才能登入。
              </div>
              <form onSubmit={(e) => e.preventDefault()} className={styles.form}>
                <div className={styles.field}>
                 <label htmlFor="prototype-upgrade-username">用戶名稱</label>
                   <input id="prototype-upgrade-username" type="text" placeholder="E2E_ test fixture" disabled autoComplete="username" />
                </div>
                <div className={styles.field}>
                 <label htmlFor="prototype-upgrade-pin">舊 PIN 碼</label>
                   <input id="prototype-upgrade-pin" type="password" placeholder="—" autoComplete="current-password" />
                </div>
                <div className={styles.field}>
                 <label htmlFor="prototype-upgrade-new">新密碼</label>
                   <input id="prototype-upgrade-new" type="password" placeholder="—" autoComplete="new-password" />
                </div>
                <button type="button" className={styles.btnPrimary}>
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
                 <input id="prototype-register-name" type="text" placeholder="—" autoComplete="name" />
                </div>
                <div className={styles.field}>
                 <label htmlFor="prototype-register-username">用戶名稱</label>
                 <input id="prototype-register-username" type="text" placeholder="建議使用英文或數字" autoComplete="username" />
                </div>
                <div className={styles.field}>
                 <label htmlFor="prototype-register-phone">聯絡電話</label>
                 <input id="prototype-register-phone" type="tel" placeholder="8 位數香港電話號碼" autoComplete="tel" />
                </div>
                <div className={styles.field}>
                 <label htmlFor="prototype-register-password">密碼</label>
                 <input id="prototype-register-password" type="password" placeholder="請設定登入密碼" autoComplete="new-password" />
                </div>
                <button type="button" className={styles.btnPrimary}>
                  提交註冊申請
                </button>
              </form>
            </div>
          </div>
        </div>
      );

    case "approval":
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
                  <button className={styles.btnSmSuccess}>批准 Member</button>
                  <button className={styles.btnSmDanger}>拒絕</button>
                </div>
              </div>
              <div className={styles.dataRow}>
                <div>
                 <strong className={styles.placeholder}>— 申請者 —</strong>
                 <span className={`${styles.subText} ${styles.placeholder}`}>— 電話 — • — 申請日期 —</span>
                </div>
                <div className={styles.actionRow}>
                  <button className={styles.btnSmSuccess}>批准 Member</button>
                  <button className={styles.btnSmDanger}>拒絕</button>
                </div>
              </div>
            </div>
          </div>
          <MockNav active="permissions" viewport={viewport} />
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
                 <span className={styles.roleTag}>Member / Staff / Admin</span>
                </div>
             <div className={styles.profileQuickInfo}>
                 <span className={styles.placeholder}>— 電話 —</span>
                 <span>— 狀態 —</span>
              </div>
                </div>
           <div className={styles.qrCenter}>
             <div className={styles.qrSquare}>
               <span>QR</span>
                </div>
                </div>
              </div>
          <MockNav active="profile" viewport={viewport} />
            </div>
      );

    case "programs":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} authenticated />
          <div className={styles.mockBody}>
            <div className={styles.sectionHead}>
              <h2>課程與活動 (Programs)</h2>
            </div>
           <div className={styles.stateCenter}>
             <p className={styles.placeholderText}>內容建置中</p>
                </div>
              </div>
          <MockNav active="programs" viewport={viewport} />
                </div>
      );

    case "events":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} authenticated />
          <div className={styles.mockBody}>
            <div className={styles.sectionHead}>
              <h2>聚會管理 (Events)</h2>
            </div>
           <div className={styles.stateCenter}>
             <p className={styles.placeholderText}>內容建置中</p>
                </div>
              </div>
          <MockNav active="events" viewport={viewport} />
                </div>
      );

    case "scanner":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} authenticated />
          <div className={styles.mockBody}>
            <div className={styles.sectionHead}>
              <h2>掃描簽到 (Scanner)</h2>
            </div>
           <div className={styles.stateCenter}>
             <p className={styles.placeholderText}>內容建置中</p>
            </div>
            </div>
          <MockNav active="scanner" viewport={viewport} />
          </div>
      );

    case "care":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} authenticated />
          <div className={styles.mockBody}>
            <div className={styles.sectionHead}>
              <h2>關懷儀表板 (Care)</h2>
            </div>
           <div className={styles.stateCenter}>
             <p className={styles.placeholderText}>內容建置中</p>
                </div>
              </div>
          <MockNav active="care" viewport={viewport} />
            </div>
      );

    case "permissions":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} authenticated />
          <div className={styles.mockBody}>
            <div className={styles.sectionHead}>
              <h2>權限與角色管理 (Permissions)</h2>
            </div>
           <div className={styles.stateCenter}>
             <p className={styles.placeholderText}>內容建置中</p>
                </div>
              </div>
          <MockNav active="permissions" viewport={viewport} />
                </div>
      );

    case "loading":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} />
          <div className={styles.stateCenter}>
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
          <MockNav active="programs" viewport={viewport} />
        </div>
      );

    case "error":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} />
          <div className={styles.stateCenter}>
            <div className={styles.noticeAlert}>
              您沒有權限執行此操作。
            </div>
            <button className={styles.btnSecondary}>返回個人檔案</button>
          </div>
        </div>
      );

    case "recovery":
      return (
        <div className={styles.mockShell}>
          <MockHeader title={SYSTEM_TITLE} />
          <div className={styles.stateCenter}>
            <div className={styles.noticeAlert}>
              無法連接伺服器，請檢查網路後再試。
            </div>
            <button className={styles.btnPrimary}>重試連接</button>
          </div>
        </div>
      );
  }
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
        <SealSlot />
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
}: {
  active: string;
  viewport: Viewport;
}) {
  const items = [
    { id: "profile", label: "個人檔案" },
    { id: "programs", label: "課程與活動" },
    { id: "events", label: "聚會管理" },
    { id: "scanner", label: "掃描簽到" },
    { id: "care", label: "關懷" },
    { id: "permissions", label: "權限" },
  ];

  return (
    <nav
      className={`${styles.shellNav} ${
        viewport === "mobile" ? styles.navPhone : styles.navDesktop
      }`}
    >
      {items.map((item) => (
        <button
          key={item.id}
          className={`${styles.navItem} ${
            active === item.id ? styles.navItemActive : ""
          }`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function SealSlot() {
  return (
    <div className={styles.sealSlot} title="Replaceable mark slot (Interim 恩 seal)">
      恩
    </div>
  );
}
