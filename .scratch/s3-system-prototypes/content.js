/* Shared product truth for the three system candidates.
 *
 * Same semantic content in every candidate. Only the system CSS changes, so the
 * comparison judges hierarchy, density, materials and composition — not copy.
 */
const FIX = {
  program: "門徒訓練基礎課",
  event: "第三課聚會",
  when: "8月20日（三）晚上 7:30–9:00",
  where: "二樓禮堂",
  code: "482913",
};

const ICON = {
  back: "‹",
  chevron: "›",
  camera: "⌾",
  info: "ⓘ",
  check: "✓",
  calendar: "▣",
  pin: "⌖",
  keypad: "▦",
  qr: "▧",
};

const icon = (name) => `<span class="icon icon--${name}" aria-hidden="true">${ICON[name] || "•"}</span>`;

const nav = (operator = false) => `
  <nav class="mock-dock" aria-label="主要導航">
    <span>首頁</span><span>課程</span><span class="active">${operator ? "管理" : "掃描"}</span><span>${operator ? "掃描" : "通知"}</span><span>帳戶</span>
  </nav>`;

const cardFacts = () => `
  <div class="facts">
    <div>${icon("calendar")}<span>${FIX.when}</span></div>
    <div>${icon("pin")}<span>${FIX.where}</span></div>
  </div>`;

const S3 = [
  {
    id: "s3-live",
    track: "S3 · Member / Guest",
    label: "S3-01 · Camera-first live",
    note: "Plain /scanner opens here. Dark full-screen camera, persistent dock, one middle frame, one short hint, one stop action. No fallback cards while live.",
    body: `<section class="camera-stage">
      <p class="camera-hint">將二維碼放入框內掃描</p>
      <div class="camera-frame"><i></i><i></i><i></i><i></i></div>
      <button class="camera-stop">停止掃描</button>${nav()}
    </section>`,
  },
  {
    id: "s3-denied",
    track: "S3 · Member / Guest",
    label: "S3-02 · Permission denied",
    note: "Failure → cause → recovery. Retry is primary; fallback cards are equal secondary choices.",
    body: `<div class="light-page">
      <div class="eyebrow">掃描</div><h2>相機權限未開啟</h2>
      <div class="alert"><b>${icon("info")}相機權限未開啟</b><p>請在瀏覽器設定允許相機，再按「重試相機」。</p></div>
      <button class="primary wide">重試相機</button>
      <div class="section-label">其他簽到方式</div>
      <div class="method-stack"><button>${icon("keypad")}<b>輸入代碼</b><small>輸入現場顯示的六位數代碼。</small>${icon("chevron")}</button><button>${icon("qr")}<b>出示會員 QR</b><small>出示你的會員 QR 碼，由聚會負責人掃描。</small>${icon("chevron")}</button></div>
    </div>`,
  },
  {
    id: "s3-fallback",
    track: "S3 · Member / Guest",
    label: "S3-03 · Stop / fallback methods",
    note: "After 停止掃描, return to light surface. Member QR action navigates to existing Account Section; no new QR screen.",
    body: `<div class="light-page"><div class="backline">${icon("back")} 返回掃描</div><h2>其他簽到方式</h2><p class="lead">你已停止掃描。請選擇其他方式完成簽到。</p><div class="method-stack"><button>${icon("keypad")}<b>輸入代碼</b><small>輸入現場顯示的六位數代碼。</small>${icon("chevron")}</button><button data-destination="/account">${icon("qr")}<b>出示會員 QR</b><small>開啟帳戶，出示你的會員 QR 碼。</small>${icon("chevron")}</button></div></div>`,
  },
  {
    id: "s3-manual",
    track: "S3 · Member / Guest",
    label: "S3-04 · Manual code",
    note: "A single focused form. Event Manual Check-In Code is the product term; placeholder is an example, not a label.",
    body: `<div class="light-page"><div class="backline">${icon("back")} 返回其他方式</div><h2>輸入代碼</h2><p class="lead">輸入現場顯示的六位數代碼。</p><div class="form-card"><label>聚會代碼<input placeholder="例如 ${FIX.code}" inputmode="numeric" /></label><small>輸入現場顯示的六位數代碼。</small><button class="primary wide">繼續</button></div></div>`,
  },
  {
    id: "s3-confirm",
    track: "S3 · Member / Guest",
    label: "S3-05 · Confirmation",
    note: "Pre-commit identity card. No attendance mutation before this confirmation.",
    body: `<div class="light-page"><div class="backline">${icon("back")} 重新掃描</div><span class="status-pill">已辨識</span><h2>確認聚會</h2><p class="lead">請核對聚會資料，確認後才會記錄出席。</p><div class="event-card"><div class="eyebrow">${FIX.program}</div><h3>${FIX.event}</h3>${cardFacts()}</div><button class="primary wide">確認簽到</button><button class="secondary wide">不是這個聚會</button></div>`,
  },
  {
    id: "s3-result",
    track: "S3 · Member / Guest",
    label: "S3-06 · Result / duplicate",
    note: "Same result composition carries success and quiet duplicate variants without error styling.",
    body: `<div class="light-page result"><div class="result-icon">${icon("check")}</div><h2>簽到完成</h2><p>${FIX.program} · ${FIX.event}</p><button class="primary wide">返回首頁</button><button class="secondary wide">再次簽到</button><div class="duplicate-example"><b>已完成簽到</b><span>你已在此聚會簽到，無需重複。</span></div></div>`,
  },
  {
    id: "s3-guest",
    track: "S3 · Member / Guest",
    label: "S3-07 · Guest form / completion",
    note: "Public guest surface: one visible form, no camera permission, then explicit completion state.",
    body: `<div class="light-page guest"><div class="backline">${icon("back")} 返回</div><h2>訪客簽到</h2><p class="lead">輸入聚會代碼及聯絡資料，完成今次出席記錄。</p><div class="form-card"><label>聚會代碼<input placeholder="例如 ${FIX.code}" /></label><label>姓名<input /></label><label>電話號碼<input inputmode="tel" /><small>只用於今次聚會跟進。</small></label><button class="primary wide">確認簽到</button></div><div class="completion"><div class="result-icon">${icon("check")}</div><b>訪客簽到完成</b><p>歡迎參加今晚聚會。你的資料已安全提交。</p><button class="primary wide">完成</button></div></div>`,
  },
  {
    id: "s3-desktop",
    track: "S3 · Desktop boundary",
    label: "S3-08 · Desktop manual-only",
    note: "At ≥800px no camera Scanner page appears. Shared Shell rail remains; content exposes manual code only.",
    desktop: true,
    body: `<div class="desktop-page"><div class="eyebrow">簽到 · 桌面版</div><h2>輸入聚會代碼</h2><p class="lead">桌面版只支援手動代碼簽到。</p><div class="form-card"><label>聚會代碼<input placeholder="例如 ${FIX.code}" /></label><button class="primary wide">繼續</button></div></div>`,
  },
];

const S7 = [
  {
    id: "s7-mode",
    track: "S7 · Operator",
    label: "S7-01 · Mode-aware scanner",
    note: "Operator composition: top segmented switch is the mode selector; global dock remains navigation. This is not the S3 self camera state.",
    body: `<section class="operator-camera"><div class="operator-top"><span>${icon("back")}掃描二維碼</span><div class="mode-switch"><b>本人簽到</b><span>代為簽到</span></div></div><p class="camera-hint">將二維碼放入框內掃描</p><div class="camera-frame small"><i></i><i></i><i></i><i></i></div><button class="camera-fab">${icon("camera")}<small>開始掃描</small></button><button class="operator-link">無法使用相機？輸入代碼</button>${nav(true)}</section>`,
  },
];

const ALL_SCREENS = [...S3, ...S7];
