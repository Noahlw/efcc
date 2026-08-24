/* S3 check-in prototype — canonical set.
 *
 * One version per screen. The earlier faithful-vs-hardened duplicates are gone.
 * `src` cites the design export where a screen reproduces it; `ext` marks where
 * this prototype extends the design, with the reason.
 *
 *   1. 掃描課程 QR      → self_qr_scan     (camera reads the venue Program QR)
 *   2. 輸入聚會代碼      → self_manual_code (six-digit Event Manual Check-In Code)
 *   3. 出示會員 QR       → /account       (existing Account Section owns the QR;
 *                                          no new Member QR screen)
 *
 * Path 3 is a navigation shortcut, not a new attendance state. It removes the
 * dead end where a member whose camera cannot run had only a six-digit code.
 *
 * The demo scenario switcher (scan.html:99-126) is absent by design:
 * design_export/README.md flags it demo-only.
 */

const F = {
  program: "門徒訓練基礎課",
  event: "第三課聚會",
  when: "8月20日（三）晚上 7:30",
  where: "二樓禮堂",
  alt: "慕道入門課程 · 第一課",
  altWhen: "9月7日（日）上午 11:00 · 一樓副堂",
  code: "482913",
  opensAt: "7:00 PM",
  member: "陳小明",
  memberId: "U-10482",
};

const ico = (id, w = 20) =>
  `<svg style="width:${w}px;height:${w}px" aria-hidden="true"><use href="#i-${id}"/></svg>`;

const chromeBar = (title) =>
  `<header class="chrome"><div>${title}</div></header>`;

const backBtn = (label) =>
  `<button type="button" class="back">${ico("back")}${label}</button>`;

/* Fallback methods — every row is a real control. Visible labels stay short;
 * supporting lines explain the consequence without making the card noisy. */
const fallbackMethods = () => `
  <section class="methods-section methods-section--fallback" aria-labelledby="fallback-methods-title">
    <h2 class="methods-title" id="fallback-methods-title">其他簽到方式</h2>
    <div class="methods">
      <button type="button" class="method">
        <span class="method-icon">${ico("keypad", 22)}</span>
        <span class="method-text">
          <strong>輸入代碼</strong>
          <span>輸入現場顯示的六位數代碼。</span>
        </span>
        ${ico("chevron")}
      </button>
      <button type="button" class="method" data-destination="/account">
        <span class="method-icon">${ico("qr", 22)}</span>
        <span class="method-text">
          <strong>出示會員 QR</strong>
          <span>開啟帳戶，出示你的會員 QR 碼。</span>
        </span>
        ${ico("chevron")}
      </button>
    </div>
  </section>`;

const cameraCorners = () => `
  <span class="camera-corner camera-corner--tl"></span>
  <span class="camera-corner camera-corner--tr"></span>
  <span class="camera-corner camera-corner--bl"></span>
  <span class="camera-corner camera-corner--br"></span>`;

const shellNav = () => `
  <nav class="mock-dock" aria-label="主要導航">
    <span>首頁</span>
    <span>課程</span>
    <span class="mock-dock--active">掃描</span>
    <span>通知</span>
    <span>帳戶</span>
  </nav>
  <nav class="mock-rail" aria-label="主要導航">
    <span>首頁</span><span>課程</span><span class="mock-rail--active">掃描</span><span>通知</span><span>帳戶</span>
  </nav>`;

const cameraStage = ({ opening = false } = {}) => `
  <div class="camera-stage${opening ? " camera-stage--opening" : ""}">
    ${opening ? `<p class="camera-state" role="status" aria-live="polite">正在開啟相機…</p>` : `<p class="camera-hint">將二維碼放入框內掃描</p>`}
    <div class="camera-frame" role="img" aria-label="相機掃描框">
      ${cameraCorners()}
    </div>
    <button type="button" class="camera-stop"${opening ? " disabled aria-busy=\"true\"" : ""}>停止掃描</button>
    ${shellNav()}
  </div>`;

const fallbackHeader = (title = "其他簽到方式") => `
  ${chromeBar(title)}
  <div style="padding:6px 0 18px">
    ${backBtn("返回掃描")}
    <h1 class="h1-sub">${title}</h1>
  </div>`;

const permissionDeniedNotice = () => `
  <div role="alert" class="notice notice--error">
    <span class="notice-icon">${ico("info", 20)}</span>
    <span class="notice-body">
      <span>相機權限未開啟。請在瀏覽器設定允許相機，再按「重試相機」。</span>
    </span>
  </div>`;

const unsupportedNotice = () => `
  <div role="alert" class="notice notice--error">
    <span class="notice-icon">${ico("info", 20)}</span>
    <span class="notice-body">
      <span>你仍可用以下方式簽到。</span>
    </span>
  </div>`;

const manualForm = (id = "manual-code") => `
  <article class="card card--task">
    <div class="field">
      <label for="${id}">聚會代碼</label>
      <input id="${id}" class="input-code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" placeholder="例如 ${F.code}" />
      <span class="field-hint">輸入現場顯示的六位數代碼。</span>
    </div>
    <p role="alert" class="alert-slot"></p>
    <button type="button" class="btn btn--primary">繼續</button>
  </article>`;

const scanHead = (lead) => `
  ${chromeBar("掃描")}
  <div style="padding:8px 0 20px">
    <h1 class="h1-top">聚會簽到</h1>
    <p class="lead">${lead}</p>
  </div>`;

const identityCard = () => `
  <article class="card card--identity">
    <span class="eyebrow">${F.program}</span>
    <h2 class="identity-title">${F.event}</h2>
    <div class="facts">
      <div class="fact">${ico("calendar", 19)}<span>${F.when}</span></div>
      <div class="fact">${ico("pin", 19)}<span>${F.where}</span></div>
    </div>
  </article>`;

const SCREENS = [
  /* ---------------- Camera-first entry ---------------- */
  {
    id: "scan-opening",
    group: "掃描入口",
    label: "正在開啟相機",
    camera: true,
    ext: "Camera starts on plain `/scanner` entry. The route becomes the dark camera surface immediately; this opening state holds the reticle and honest loading copy while permission/decoder readiness resolves. The bottom stop control is disabled until the stream is ready.",
    live: "正在開啟相機",
    body: `${cameraStage({ opening: true })}`,
  },

  {
    id: "scan-live",
    group: "掃描入口",
    label: "相機掃描中",
    camera: true,
    ext: "Camera-first live state: no top chrome, no dock, no method cards. One short instruction above the reticle and one bottom action. Pressing 停止掃描 releases tracks and reveals the light fallback surface.",
    live: "相機掃描中",
    body: `${cameraStage()}`,
  },
  {
    id: "scan-fallback",
    group: "掃描入口",
    label: "已停止掃描 · 其他簽到方式",
    ext: "After the user intentionally stops the camera, return to the light surface. The two fallback methods have equal visual weight; each row is a real control with a short label and outcome-oriented supporting line.",
    live: "其他簽到方式",
    body: `
      ${fallbackHeader("其他簽到方式")}
      <p class="lead-plain">你已停止掃描。請選擇其他方式完成簽到。</p>
      ${fallbackMethods()}`,
  },

  {
    id: "scan-denied",
    group: "掃描入口",
    label: "相機權限未開啟",
    ext: "Permission-denied state. Failure → cause → recovery. Retry is the separate primary recovery action; the two fallback cards remain equal secondary choices. The browser may require the user to change settings before retry can succeed.",
    live: "未能使用相機",
    body: `
      ${fallbackHeader("相機權限未開啟")}
      ${permissionDeniedNotice()}
      <button type="button" class="btn btn--primary">重試相機</button>
      ${fallbackMethods()}`,
  },

  {
    id: "scan-unsupported",
    group: "掃描入口",
    label: "相機掃描不可用",
    ext: "Unsupported/unavailable state. No retry promise: the browser/device has no usable camera decoder or the camera cannot be acquired. Keep the two equal fallback cards available.",
    live: "相機掃描不可用",
    body: `
      ${fallbackHeader("相機掃描不可用")}
      ${unsupportedNotice()}
      ${fallbackMethods()}`,
  },

  {
    id: "scan-manual",
    group: "掃描入口",
    label: "輸入代碼",
    ext: "Reached from either fallback card. Camera is no longer competing for attention; the manual path is one focused form.",
    live: "輸入聚會代碼",
    body: `
      ${fallbackHeader("輸入代碼")}
      <p class="lead-plain">輸入現場顯示的六位數代碼。</p>
      ${manualForm("manual-code")}`,
  },

  {
    id: "scan-invalid",
    group: "掃描入口",
    label: "找不到聚會",
    ext: "Zero open events matched. Error lands in the reserved slot; nothing is written and the code stays for correction.",
    live: "找不到此代碼對應的聚會",
    body: `
      ${fallbackHeader("輸入代碼")}
      <p class="lead-plain">輸入現場顯示的六位數代碼。</p>
      <article class="card card--task">
        <div class="field">
          <label for="invalid-code">聚會代碼</label>
          <input id="invalid-code" class="input-code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" value="482910" aria-invalid="true" />
          <span class="field-hint">輸入現場顯示的六位數代碼。</span>
        </div>
        <p role="alert" class="alert-slot">找不到此代碼對應的聚會，請確認後重試。</p>
        <button type="button" class="btn btn--primary">繼續</button>
      </article>`,
  },

  {
    id: "scan-offline",
    group: "掃描入口",
    label: "離線（核實階段）",
    ext: "Network failure while resolving — distinct from submit-phase offline because nothing has been committed yet.",
    live: "現時沒有網絡",
    body: `
      ${fallbackHeader("輸入代碼")}
      <div role="alert" class="notice notice--error">
        <span class="notice-icon">${ico("info", 20)}</span>
        <span class="notice-body">
          <strong>現時沒有網絡</strong>
          <span>未能核實聚會資料。請重新連線後再試一次。</span>
        </span>
      </div>
      ${manualForm("offline-code")}`,
  },

  /* ---------------- Desktop boundary ---------------- */
  {
    id: "desktop-manual",
    group: "桌面邊界",
    label: "桌面：只支援手動代碼",
    desktop: true,
    ext: "At ≥800px the Scanner Section does not render the camera attendance page. The Shared Shell rail remains visible, but the content boundary offers manual Event Check-In Code entry only, per the phone-first product constraint.",
    live: "桌面版只支援輸入聚會代碼",
    body: `
      ${chromeBar("簽到")}
      <div class="desktop-boundary">
        <h1 class="h1-sub">輸入聚會代碼</h1>
        <p class="lead-plain">桌面版只支援手動代碼簽到。請輸入現場顯示的六位數代碼。</p>
        ${manualForm("desktop-code")}
      </div>`,
  },

  /* ---------------- Resolve ---------------- */
  {
    id: "scan-chooser",
    group: "確認",
    label: "選擇聚會",
    src: "scan-chooser.html:84-103",
    live: "選擇要簽到的聚會",
    body: `
      ${chromeBar("選擇聚會")}
      <div style="padding:6px 0 20px">
        ${backBtn("重新掃描")}
        <span class="eyebrow eyebrow--spaced">已辨識多個聚會</span>
        <h1 class="h1-sub">選擇要簽到的聚會</h1>
        <p class="lead-plain">此二維碼可用於多個聚會，請揀選你參加的那一個。</p>
      </div>
      <div class="rows">
        <button type="button" class="row">
          <span><span class="row-title">${F.program} · ${F.event}</span><span class="row-sub">${F.when} · ${F.where}</span></span>
          ${ico("chevron")}
        </button>
        <button type="button" class="row">
          <span><span class="row-title">${F.alt}</span><span class="row-sub">${F.altWhen}</span></span>
          ${ico("chevron")}
        </button>
      </div>`,
  },

  {
    id: "scan-context",
    group: "確認",
    label: "確認聚會",
    src: "scan-context.html:88-107",
    live: "確認聚會",
    body: `
      ${chromeBar("確認簽到")}
      <div style="padding:6px 0 20px">
        ${backBtn("重新掃描")}
        <span class="badge">已辨識</span>
        <h1 class="h1-sub">確認聚會</h1>
        <p class="lead-plain">請核對聚會資料，確認後才會記錄出席。</p>
      </div>
      ${identityCard()}
      <div class="actions">
        <button type="button" class="btn btn--primary">確認簽到</button>
        <p role="alert" class="alert-slot"></p>
        <button type="button" class="btn btn--secondary">不是這個聚會</button>
      </div>`,
  },

  {
    id: "scan-context-busy",
    group: "確認",
    label: "送出中",
    ext: "Double-submission guard: primary disabled with aria-busy while in flight; the escape stays usable.",
    live: "正在送出簽到",
    body: `
      ${chromeBar("確認簽到")}
      <div style="padding:6px 0 20px">
        ${backBtn("重新掃描")}
        <span class="badge">已辨識</span>
        <h1 class="h1-sub">確認聚會</h1>
        <p class="lead-plain">請核對聚會資料，確認後才會記錄出席。</p>
      </div>
      ${identityCard()}
      <div class="actions">
        <button type="button" class="btn btn--primary" aria-busy="true" disabled>送出中…</button>
        <p role="alert" class="alert-slot"></p>
        <button type="button" class="btn btn--secondary">不是這個聚會</button>
      </div>`,
  },

  {
    id: "scan-context-failed",
    group: "確認",
    label: "送出失敗 + 重試",
    ext: "Recoverable server failure. Error lands in the design's reserved slot; production focuses the retry via retryRef (self-check-in-panel.tsx:187).",
    live: "未能完成簽到",
    body: `
      ${chromeBar("確認簽到")}
      <div style="padding:6px 0 20px">
        ${backBtn("重新掃描")}
        <span class="badge">已辨識</span>
        <h1 class="h1-sub">確認聚會</h1>
        <p class="lead-plain">請核對聚會資料，確認後才會記錄出席。</p>
      </div>
      ${identityCard()}
      <div class="actions">
        <p role="alert" class="alert-slot">未能完成簽到，請重試一次。</p>
        <button type="button" class="btn btn--primary">重試簽到</button>
        <button type="button" class="btn btn--secondary">不是這個聚會</button>
      </div>`,
  },

  /* ---------------- Terminal ---------------- */
  {
    id: "checkin-result",
    group: "結果",
    label: "簽到完成",
    src: "checkin-result.html:90-101",
    live: "簽到完成",
    body: `
      ${chromeBar("簽到結果")}
      <div class="result-wrap">
        <article class="card card--terminal">
          <div class="terminal-icon terminal-icon--ok">${ico("check", 34)}</div>
          <h1 class="h1-result">簽到完成</h1>
          <p class="lead-center">${F.program} · ${F.event}</p>
          <div class="actions">
            <button type="button" class="btn btn--primary">返回首頁</button>
            <button type="button" class="btn btn--secondary">再次簽到</button>
          </div>
        </article>
      </div>`,
  },

  {
    id: "checkin-duplicate",
    group: "結果",
    label: "已完成簽到（安靜）",
    ext: 'Server returned outcome:"duplicate". Neutral, never error styling — the member did nothing wrong and no second attendance row exists.',
    live: "你已在此聚會簽到",
    body: `
      ${chromeBar("簽到結果")}
      <div class="result-wrap">
        <article class="card card--terminal">
          <div class="terminal-icon terminal-icon--neutral">${ico("check", 34)}</div>
          <h1 class="h1-result">已完成簽到</h1>
          <p class="lead-center">你已在此聚會簽到，無需重複。</p>
          <div class="actions">
            <button type="button" class="btn btn--primary">返回首頁</button>
            <button type="button" class="btn btn--secondary">再次簽到</button>
          </div>
        </article>
      </div>`,
  },

  {
    id: "outcome-window",
    group: "結果",
    label: "簽到尚未開放",
    src: "scan-outcome.html:86-98",
    live: "簽到尚未開放",
    body: `
      ${chromeBar("簽到狀態")}
      <div class="outcome-wrap">
        <div class="terminal-icon terminal-icon--pending">${ico("clock", 34)}</div>
        <h1 class="h1-outcome">簽到尚未開放</h1>
        <p class="outcome-body">此聚會的簽到時段將於 <strong>${F.opensAt}</strong> 開始（聚會開始前 30 分鐘）。開放後可以重新掃描或輸入代碼簽到。</p>
        <div class="actions--outcome">
          <button type="button" class="btn btn--secondary">返回掃描</button>
        </div>
      </div>`,
  },

  {
    id: "outcome-cancelled",
    group: "結果",
    label: "此聚會已取消",
    ext: "EVENT_CANCELLED (410). Same outcome shell, different icon and copy.",
    live: "此聚會已取消",
    body: `
      ${chromeBar("簽到狀態")}
      <div class="outcome-wrap">
        <div class="terminal-icon terminal-icon--pending">${ico("info", 34)}</div>
        <h1 class="h1-outcome">此聚會已取消</h1>
        <p class="outcome-body">此聚會已取消，不能簽到。如有疑問，請聯絡聚會負責人。</p>
        <div class="actions--outcome">
          <button type="button" class="btn btn--secondary">返回掃描</button>
        </div>
      </div>`,
  },

  {
    id: "outcome-notenrolled",
    group: "結果",
    label: "尚未報名",
    ext: "ENROLLMENT_REQUIRED (403). The CTA must open the program actually resolved from the scan — the prototype hardcodes 'intro' (spec F-05).",
    live: "你尚未報名此課程",
    body: `
      ${chromeBar("簽到狀態")}
      <div class="outcome-wrap">
        <div class="terminal-icon terminal-icon--pending">${ico("info", 34)}</div>
        <h1 class="h1-outcome">你尚未報名此課程</h1>
        <p class="outcome-body">你尚未報名 ${F.program}。報名後即可簽到。</p>
        <div class="actions--outcome">
          <button type="button" class="btn btn--primary">查看課程詳情</button>
          <button type="button" class="btn btn--secondary">返回掃描</button>
        </div>
      </div>`,
  },

  /* ---------------- Guest ---------------- */
  {
    id: "guest-checkin",
    group: "訪客",
    label: "訪客簽到",
    src: "guest-checkin.html:63-73",
    narrow: true,
    live: "訪客簽到",
    body: `
      ${backBtn("返回")}
      <h1 class="h1-guest">訪客簽到</h1>
      <p class="lead-guest">輸入聚會代碼及聯絡資料，完成今次出席記錄。</p>
      <div class="fields">
        <div class="field"><label for="g-code">聚會代碼</label><input id="g-code" inputmode="numeric" placeholder="例如 ${F.code}" /></div>
        <div class="field"><label for="g-name">姓名</label><input id="g-name" /></div>
        <div class="field"><label for="g-phone">電話號碼</label><input id="g-phone" inputmode="tel" /><span class="field-hint">只用於今次聚會跟進。</span></div>
        <p role="alert" class="alert-slot"></p>
        <button type="button" class="btn btn--primary">確認簽到</button>
      </div>`,
  },

  {
    id: "guest-invalid",
    group: "訪客",
    label: "訪客 · 欠缺資料",
    ext: "Client validation before any request; offending fields carry aria-invalid.",
    narrow: true,
    live: "請輸入聚會代碼、姓名及電話",
    body: `
      ${backBtn("返回")}
      <h1 class="h1-guest">訪客簽到</h1>
      <p class="lead-guest">輸入聚會代碼及聯絡資料，完成今次出席記錄。</p>
      <div class="fields">
        <div class="field"><label for="gi-code">聚會代碼</label><input id="gi-code" inputmode="numeric" placeholder="例如 ${F.code}" aria-invalid="true" /></div>
        <div class="field"><label for="gi-name">姓名</label><input id="gi-name" aria-invalid="true" /></div>
        <div class="field"><label for="gi-phone">電話號碼</label><input id="gi-phone" inputmode="tel" aria-invalid="true" /><span class="field-hint">只用於今次聚會跟進。</span></div>
        <p role="alert" class="alert-slot">請輸入聚會代碼、姓名及電話。</p>
        <button type="button" class="btn btn--primary">確認簽到</button>
      </div>`,
  },

  {
    id: "guest-result",
    group: "訪客",
    label: "訪客簽到完成",
    src: "guest-result.html:65-71",
    narrow: true,
    live: "訪客簽到完成",
    body: `
      <article class="card card--terminal">
        <div class="terminal-icon terminal-icon--ok">${ico("check", 34)}</div>
        <h1 class="h1-result">訪客簽到完成</h1>
        <p class="lead-center">歡迎參加今晚聚會。你的資料已安全提交。</p>
        <button type="button" class="btn btn--primary" style="margin-top:18px">完成</button>
      </article>`,
  },

  {
    id: "guest-duplicate",
    group: "訪客",
    label: "訪客 · 此電話已簽到",
    ext: 'outcome:"duplicate" on the guest path. Withholds the attendance id so a stranger cannot probe who else checked in.',
    narrow: true,
    live: "此電話已簽到",
    body: `
      <article class="card card--terminal">
        <div class="terminal-icon terminal-icon--neutral">${ico("check", 34)}</div>
        <h1 class="h1-result">已完成簽到</h1>
        <p class="lead-center">此電話已簽到。如需協助，請聯絡聚會負責人。</p>
        <button type="button" class="btn btn--primary" style="margin-top:18px">完成</button>
      </article>`,
  },

  /* ---------------- Stress ---------------- */
  {
    id: "stress",
    group: "壓力測試",
    label: "極端內容",
    ext: "Long unbroken CJK names, a 40-character event title, a deep URL and a long location — all must wrap, never scroll. This is the case that breaks a chooser row and an identity card.",
    live: "內容壓力測試",
    body: `
      ${chromeBar("選擇聚會")}
      <div style="padding:6px 0 20px">
        ${backBtn("重新掃描")}
        <h1 class="h1-sub">選擇要簽到的聚會</h1>
      </div>
      <div class="rows">
        <button type="button" class="row">
          <span><span class="row-title">播道會顯恩堂青年成長門徒訓練基礎課程進階班 · 第十二課聚會（延長時段）</span><span class="row-sub">8月20日（三）晚上 7:30–9:30 · 二樓禮堂副堂東翼第三會議室</span></span>
          ${ico("chevron")}
        </button>
        <button type="button" class="row">
          <span><span class="row-title">ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz</span><span class="row-sub">https://example.church/a/very/long/deep/link/that/must/wrap</span></span>
          ${ico("chevron")}
        </button>
      </div>
      <div style="margin-top:18px">
        <article class="card card--identity">
          <span class="eyebrow">播道會顯恩堂青年成長門徒訓練基礎課程進階班</span>
          <h2 class="identity-title">第十二課聚會（延長時段，包含分組討論及晚餐）</h2>
          <div class="facts">
            <div class="fact">${ico("calendar", 19)}<span>8月20日（三）晚上 7:30–9:30</span></div>
            <div class="fact">${ico("pin", 19)}<span>二樓禮堂副堂東翼第三會議室（近後樓梯）</span></div>
          </div>
        </article>
      </div>`,
  },
];
