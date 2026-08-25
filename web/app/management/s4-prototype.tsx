"use client";

/* eslint-disable react/function-component-definition, no-use-before-define -- Named, hoisted variant components keep this throwaway comparison artifact easy to scan. */
// Three variants for each S4 workflow pack, switchable on the existing /management route with ?variant=.

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import styles from "./s4-prototype.module.css";

type Pack = "directory" | "approvals" | "permissions";
type Variant = "a" | "b" | "c";
type Role = "admin" | "staff" | "member";

interface Account {
  departments: string;
  id: string;
  login: string;
  name: string;
  phone: string;
  role: Role;
  status: "Active" | "Pending";
}

interface RegistrationRequest {
  id: string;
  login: string;
  name: string;
  phone: string;
  status: "Pending" | "Approved" | "Rejected";
  submitted: string;
}

interface Capability {
  admin: boolean;
  description: string;
  group: string;
  id: string;
  label: string;
  member: boolean;
  staff: boolean;
}

const ACCOUNTS: Account[] = [
  {
    id: "u-101",
    name: "陳小明",
    login: "siu.ming.chan",
    phone: "9123 4567",
    role: "admin",
    status: "Active",
    departments: "培育部、崇拜部",
  },
  {
    id: "u-102",
    name: "黃家豪",
    login: "ka.ho.wong",
    phone: "9234 5678",
    role: "staff",
    status: "Active",
    departments: "崇拜部",
  },
  {
    id: "u-103",
    name: "李靜怡",
    login: "ching.yi.lee",
    phone: "9345 6789",
    role: "staff",
    status: "Active",
    departments: "兒童部、家庭事工",
  },
  {
    id: "u-104",
    name: "王美玲",
    login: "mei.ling.wong",
    phone: "9456 7890",
    role: "member",
    status: "Pending",
    departments: "—",
  },
  {
    id: "u-105",
    name: "何志強",
    login: "chi.keung.ho",
    phone: "9567 8901",
    role: "member",
    status: "Active",
    departments: "成區",
  },
];

const REQUESTS: RegistrationRequest[] = [
  {
    id: "r-301",
    name: "王美玲",
    login: "mei.ling.wong",
    phone: "9456 7890",
    submitted: "今天 14:32",
    status: "Pending",
  },
  {
    id: "r-302",
    name: "梁頌恩",
    login: "grace.leung",
    phone: "9678 9012",
    submitted: "昨天 20:18",
    status: "Pending",
  },
  {
    id: "r-303",
    name: "張國榮",
    login: "kwok.wing.cheung",
    phone: "9789 0123",
    submitted: "8月23日 09:06",
    status: "Approved",
  },
];

const CAPABILITIES: Capability[] = [
  {
    id: "program.enroll",
    label: "提交課程報名",
    description: "以會友身份提交自己的課程報名",
    group: "會友基礎",
    admin: true,
    staff: true,
    member: true,
  },
  {
    id: "department.manage",
    label: "部門管理",
    description: "編輯部門資料及日常運作",
    group: "部門",
    admin: true,
    staff: true,
    member: false,
  },
  {
    id: "department.publish",
    label: "部門發佈",
    description: "將部門發佈為使用中",
    group: "部門",
    admin: true,
    staff: true,
    member: false,
  },
  {
    id: "department.module.configure",
    label: "部門模組設定",
    description: "啟用或停用部門模組",
    group: "部門",
    admin: true,
    staff: true,
    member: false,
  },
  {
    id: "department.manager.assign",
    label: "部門管理者指派",
    description: "指派或撤銷部門管理者",
    group: "部門",
    admin: true,
    staff: true,
    member: false,
  },
  {
    id: "program.manage",
    label: "課程管理",
    description: "建立及編輯課程與聚會",
    group: "課程",
    admin: true,
    staff: true,
    member: false,
  },
  {
    id: "program.publish",
    label: "課程發佈",
    description: "將課程列入會友目錄",
    group: "課程",
    admin: true,
    staff: true,
    member: false,
  },
  {
    id: "program.leader.assign",
    label: "事工負責人指派",
    description: "指派或撤銷課程負責人",
    group: "課程",
    admin: true,
    staff: true,
    member: false,
  },
  {
    id: "account.permissions.read",
    label: "查看權限政策",
    description: "查看帳戶與角色政策",
    group: "帳戶與系統",
    admin: true,
    staff: true,
    member: false,
  },
  {
    id: "account.directory.read",
    label: "查看帳戶名錄",
    description: "搜尋全教會登入帳戶",
    group: "帳戶與系統",
    admin: true,
    staff: true,
    member: false,
  },
  {
    id: "registration.approval.manage",
    label: "註冊審批",
    description: "核准或拒絕帳戶申請",
    group: "帳戶與系統",
    admin: true,
    staff: true,
    member: false,
  },
  {
    id: "home.publish",
    label: "首頁內容發佈",
    description: "發佈全教會首頁內容",
    group: "帳戶與系統",
    admin: true,
    staff: false,
    member: false,
  },
  {
    id: "account.permissions.write",
    label: "修改權限政策",
    description: "改變全系統角色權限",
    group: "帳戶與系統",
    admin: true,
    staff: false,
    member: false,
  },
];

const PACK_LABELS: Record<Pack, string> = {
  directory: "帳戶名錄",
  approvals: "註冊審批",
  permissions: "權限政策",
};

const VARIANT_LABELS: Record<Variant, string> = {
  a: "A · 任務導向",
  b: "B · 操作台帳",
  c: "C · 聚焦流程",
};

function isPack(value: string | null): value is Pack {
  return (
    value === "directory" || value === "approvals" || value === "permissions"
  );
}

function isVariant(value: string | null): value is Variant {
  return value === "a" || value === "b" || value === "c";
}

function roleLabel(role: Role) {
  if (role === "admin") {
    return "管理員";
  }
  if (role === "staff") {
    return "同工";
  }
  return "會友";
}

function PrototypeShell({
  children,
  pack,
}: {
  children: React.ReactNode;
  pack: Pack;
}) {
  return (
    <div className={styles.app}>
      <a className={styles.skipLink} href="#s4-prototype-main">
        跳到主要內容
      </a>
      <aside aria-label="主要導覽" className={styles.rail}>
        <div className={styles.brandMark}>恩</div>
        <strong>中國基督教播道會顯恩堂</strong>
        <nav>
          {[
            ["首頁", "⌂"],
            ["課程", "▤"],
            ["掃描", "⌗"],
            ["管理", "◇"],
            ["帳戶", "○"],
          ].map(([label, icon]) => (
            <button
              aria-current={label === "管理" ? "page" : undefined}
              key={label}
              type="button"
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
      </aside>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>管理工作</span>
          <strong>{PACK_LABELS[pack]}</strong>
        </div>
        <div className={styles.actor}>
          <span>陳小明</span>
          <small>管理員</small>
        </div>
      </header>
      <main className={styles.main} id="s4-prototype-main">
        {children}
      </main>
      <nav aria-label="手機主要導覽" className={styles.dock}>
        {["首頁", "課程", "掃描", "管理", "帳戶"].map((label) => (
          <button
            aria-current={label === "管理" ? "page" : undefined}
            key={label}
            type="button"
          >
            <span aria-hidden="true">{label === "管理" ? "◇" : "·"}</span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function SectionIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className={styles.sectionIntro}>
      <span className={styles.eyebrow}>{eyebrow}</span>
      <h1 tabIndex={-1}>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

function StatusPill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "pending" | "success" | "error";
}) {
  return (
    <span className={`${styles.statusPill} ${styles[tone]}`}>{children}</span>
  );
}

function AccountCard({
  account,
  selected,
  onSelect,
}: {
  account: Account;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      aria-pressed={selected}
      className={styles.accountCard}
      onClick={onSelect}
      type="button"
    >
      <span className={styles.avatar} aria-hidden="true">
        {account.name.slice(0, 1)}
      </span>
      <span>
        <strong>{account.name}</strong>
        <small>
          {account.login} · {roleLabel(account.role)}
        </small>
      </span>
      <StatusPill tone={account.status === "Active" ? "success" : "pending"}>
        {account.status === "Active" ? "生效" : "待審批"}
      </StatusPill>
    </button>
  );
}

function AccountDetail({ account }: { account: Account }) {
  return (
    <article className={styles.detailCard}>
      <div className={styles.detailHeading}>
        <span className={styles.avatarLarge} aria-hidden="true">
          {account.name.slice(0, 1)}
        </span>
        <div>
          <span className={styles.eyebrow}>帳戶詳情</span>
          <h2>{account.name}</h2>
          <p>{account.login}</p>
        </div>
      </div>
      <dl className={styles.factGrid}>
        <div>
          <dt>角色</dt>
          <dd>{roleLabel(account.role)}</dd>
        </div>
        <div>
          <dt>狀態</dt>
          <dd>{account.status === "Active" ? "生效帳戶" : "待審批"}</dd>
        </div>
        <div>
          <dt>電話</dt>
          <dd>{account.phone}</dd>
        </div>
        <div>
          <dt>部門關聯</dt>
          <dd>{account.departments}</dd>
        </div>
      </dl>
      <div className={styles.notice}>
        <strong>唯讀資料</strong>
        <p>帳戶停用、角色變更及憑證重設會由另一個決策流程定義。</p>
      </div>
    </article>
  );
}

function DirectoryPack({
  variant,
  scenario,
}: {
  variant: Variant;
  scenario: string;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(ACCOUNTS[0].id);
  const visible = useMemo(() => {
    if (scenario === "empty") {
      return [];
    }
    const term = query.trim().toLowerCase();
    if (!term) {
      return ACCOUNTS;
    }
    return ACCOUNTS.filter((account) =>
      [account.name, account.login, account.phone].some((value) =>
        value.toLowerCase().includes(term)
      )
    );
  }, [query, scenario]);
  const selected =
    ACCOUNTS.find((account) => account.id === selectedId) ?? ACCOUNTS[0];

  if (scenario === "forbidden") {
    return (
      <section className={styles.centredState} role="alert">
        <span className={styles.stateIcon}>!</span>
        <h1>未獲授權查看帳戶名錄</h1>
        <p>你可以返回管理工作，查看目前獲授權的工作。</p>
        <button className={styles.primaryButton} type="button">
          返回管理工作
        </button>
      </section>
    );
  }

  const search = (
    <label className={styles.searchField}>
      <span>搜尋帳戶</span>
      <input
        onChange={(event) => setQuery(event.target.value)}
        placeholder="姓名、登入名稱或電話"
        type="search"
        value={query}
      />
    </label>
  );

  if (variant === "b") {
    return (
      <section>
        <SectionIntro
          eyebrow="身份與存取"
          title="帳戶台帳"
          description="以角色與帳戶狀態快速核對全教會登入身份。"
        />
        <div className={styles.metrics}>
          <div>
            <strong>128</strong>
            <span>生效帳戶</span>
          </div>
          <div>
            <strong>12</strong>
            <span>同工及管理員</span>
          </div>
          <div>
            <strong>3</strong>
            <span>待處理申請</span>
          </div>
        </div>
        <div className={styles.toolbarRow}>
          {search}
          <button className={styles.secondaryButton} type="button">
            篩選角色
          </button>
        </div>
        {visible.length ? (
          <div className={styles.ledger}>
            <div className={styles.ledgerHead}>
              <span>帳戶</span>
              <span>角色</span>
              <span>部門</span>
              <span>狀態</span>
            </div>
            {visible.map((account) => (
              <button
                className={styles.ledgerRow}
                key={account.id}
                onClick={() => setSelectedId(account.id)}
                type="button"
              >
                <span>
                  <strong>{account.name}</strong>
                  <small>{account.login}</small>
                </span>
                <span>{roleLabel(account.role)}</span>
                <span>{account.departments}</span>
                <StatusPill
                  tone={account.status === "Active" ? "success" : "pending"}
                >
                  {account.status === "Active" ? "生效" : "待審批"}
                </StatusPill>
              </button>
            ))}
          </div>
        ) : (
          <EmptyDirectory />
        )}
        <div className={styles.drawer}>
          <AccountDetail account={selected} />
        </div>
      </section>
    );
  }

  if (variant === "c") {
    return (
      <section className={styles.lookupLayout}>
        <SectionIntro
          eyebrow="快速查找"
          title="你要找哪個帳戶？"
          description="先搜尋，再進入清晰、唯讀的身份與存取摘要。"
        />
        {search}
        {visible.length ? (
          <div className={styles.lookupResults}>
            {visible.map((account) => (
              <AccountCard
                account={account}
                key={account.id}
                onSelect={() => setSelectedId(account.id)}
                selected={selectedId === account.id}
              />
            ))}
          </div>
        ) : (
          <EmptyDirectory />
        )}
        <AccountDetail account={selected} />
      </section>
    );
  }

  return (
    <section>
      <SectionIntro
        eyebrow="管理工作 / 帳戶"
        title="帳戶名錄"
        description="搜尋登入身份，核對角色、狀態與部門關聯。"
      />
      <div className={styles.commandBar}>
        {search}
        <div className={styles.quickLinks}>
          <button type="button">
            <strong>3</strong>
            <span>待審批</span>
          </button>
          <button type="button">
            <strong>13</strong>
            <span>權限項目</span>
          </button>
        </div>
      </div>
      <div className={styles.splitView}>
        <div className={styles.accountList}>
          {visible.length ? (
            visible.map((account) => (
              <AccountCard
                account={account}
                key={account.id}
                onSelect={() => setSelectedId(account.id)}
                selected={selectedId === account.id}
              />
            ))
          ) : (
            <EmptyDirectory />
          )}
        </div>
        <AccountDetail account={selected} />
      </div>
    </section>
  );
}

function EmptyDirectory() {
  return (
    <div className={styles.emptyState}>
      <strong>沒有符合條件的帳戶</strong>
      <p>試試輸入另一個姓名、登入名稱或電話。</p>
    </div>
  );
}

function ApprovalActions({
  request,
  onResolve,
}: {
  request: RegistrationRequest;
  onResolve: (action: "approve" | "reject") => void;
}) {
  if (request.status !== "Pending") {
    return (
      <div className={styles.notice}>
        <strong>申請已處理</strong>
        <p>此詳情保持唯讀，方便日後核對。</p>
      </div>
    );
  }
  return (
    <div className={styles.actionRow}>
      <button
        className={styles.secondaryButton}
        onClick={() => onResolve("reject")}
        type="button"
      >
        拒絕申請
      </button>
      <button
        className={styles.primaryButton}
        onClick={() => onResolve("approve")}
        type="button"
      >
        核准帳戶
      </button>
    </div>
  );
}

function ApprovalDetailCard({
  request,
  onResolve,
}: {
  request: RegistrationRequest;
  onResolve: (action: "approve" | "reject") => void;
}) {
  return (
    <article className={styles.detailCard}>
      <div className={styles.detailTopline}>
        <span className={styles.eyebrow}>申請詳情</span>
        <StatusPill tone={request.status === "Pending" ? "pending" : "success"}>
          {request.status === "Pending"
            ? "待審批"
            : request.status === "Approved"
              ? "已核准"
              : "已拒絕"}
        </StatusPill>
      </div>
      <h2>{request.name}</h2>
      <dl className={styles.factGrid}>
        <div>
          <dt>登入名稱</dt>
          <dd>{request.login}</dd>
        </div>
        <div>
          <dt>電話</dt>
          <dd>{request.phone}</dd>
        </div>
        <div>
          <dt>申請時間</dt>
          <dd>{request.submitted}</dd>
        </div>
        <div>
          <dt>申請類型</dt>
          <dd>會友帳戶</dd>
        </div>
      </dl>
      <ApprovalActions onResolve={onResolve} request={request} />
    </article>
  );
}

function ApprovalsPack({
  variant,
  scenario,
}: {
  variant: Variant;
  scenario: string;
}) {
  const initial = scenario === "resolved" ? REQUESTS[2].id : REQUESTS[0].id;
  const [selectedId, setSelectedId] = useState(initial);
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const selected =
    REQUESTS.find((request) => request.id === selectedId) ?? REQUESTS[0];
  const onResolve = (action: "approve" | "reject") => setDialog(action);
  const queue = REQUESTS.filter((request) => request.status === "Pending");

  const list = (
    <div className={styles.approvalList}>
      {REQUESTS.map((request) => (
        <button
          aria-pressed={selectedId === request.id}
          className={styles.approvalRow}
          key={request.id}
          onClick={() => setSelectedId(request.id)}
          type="button"
        >
          <span>
            <strong>{request.name}</strong>
            <small>
              {request.submitted} · {request.login}
            </small>
          </span>
          <StatusPill
            tone={request.status === "Pending" ? "pending" : "success"}
          >
            {request.status === "Pending" ? "待處理" : "已完成"}
          </StatusPill>
        </button>
      ))}
    </div>
  );

  let content: React.ReactNode;
  if (scenario === "conflict") {
    content = (
      <section aria-live="polite" className={styles.centredState}>
        <span className={styles.stateIcon}>↻</span>
        <h1>申請已由另一位同工處理</h1>
        <p>最新結果為「已核准」。詳情已重新載入並轉為唯讀。</p>
        <button className={styles.primaryButton} type="button">
          查看最新詳情
        </button>
      </section>
    );
  } else if (variant === "b") {
    content = (
      <section>
        <SectionIntro
          eyebrow="今日待辦"
          title="註冊審批工作台"
          description="先處理最早提交的申請，再移到下一項。"
        />
        <div className={styles.progressLine}>
          <strong>{queue.length} 項待處理</strong>
          <span>目前 1 / {queue.length}</span>
        </div>
        <div className={styles.focusReview}>
          <ApprovalDetailCard onResolve={onResolve} request={selected} />
          <aside>
            <h2>接下來</h2>
            {queue
              .filter((request) => request.id !== selected.id)
              .map((request) => (
                <button
                  key={request.id}
                  onClick={() => setSelectedId(request.id)}
                  type="button"
                >
                  <strong>{request.name}</strong>
                  <span>{request.submitted}</span>
                </button>
              ))}
          </aside>
        </div>
      </section>
    );
  } else if (variant === "c") {
    content = (
      <section>
        <SectionIntro
          eyebrow="按時間排列"
          title="註冊申請紀錄"
          description="待處理與已完成決定放在同一條可追溯時間線。"
        />
        <div className={styles.timeline}>
          {REQUESTS.map((request) => (
            <article className={styles.timelineItem} key={request.id}>
              <span className={styles.timelineDot} />
              <button onClick={() => setSelectedId(request.id)} type="button">
                <span>{request.submitted}</span>
                <strong>{request.name}</strong>
                <small>{request.login}</small>
              </button>
              {selectedId === request.id ? (
                <ApprovalDetailCard onResolve={onResolve} request={request} />
              ) : null}
            </article>
          ))}
        </div>
      </section>
    );
  } else {
    content = (
      <section>
        <SectionIntro
          eyebrow="管理工作 / 帳戶"
          title="註冊審批"
          description="核對申請資料，再以清楚、可追溯的決定建立帳戶。"
        />
        <div className={styles.splitView}>
          <div>
            <div className={styles.listHeading}>
              <h2>申請佇列</h2>
              <StatusPill tone="pending">{queue.length} 待處理</StatusPill>
            </div>
            {list}
          </div>
          <ApprovalDetailCard onResolve={onResolve} request={selected} />
        </div>
      </section>
    );
  }

  return (
    <>
      {content}
      {dialog ? (
        <div className={styles.modalBackdrop}>
          <dialog
            aria-labelledby="approval-dialog-title"
            className={styles.modal}
            open
          >
            <span className={styles.eyebrow}>
              {dialog === "approve" ? "確認建立帳戶" : "拒絕申請"}
            </span>
            <h2 id="approval-dialog-title">
              {dialog === "approve"
                ? `核准 ${selected.name}？`
                : `拒絕 ${selected.name}？`}
            </h2>
            <p>
              {dialog === "approve"
                ? "系統會建立生效帳戶，申請人隨即可登入。"
                : "請留下原因，方便同工日後核對。"}
            </p>
            {dialog === "reject" ? (
              <label className={styles.textArea}>
                <span>拒絕原因</span>
                <textarea
                  onChange={(event) => setReason(event.target.value)}
                  rows={4}
                  value={reason}
                />
              </label>
            ) : null}
            <div className={styles.actionRow}>
              <button
                className={styles.secondaryButton}
                onClick={() => setDialog(null)}
                type="button"
              >
                取消
              </button>
              <button
                className={styles.primaryButton}
                disabled={dialog === "reject" && !reason.trim()}
                onClick={() => setDialog(null)}
                type="button"
              >
                確認{dialog === "approve" ? "核准" : "拒絕"}
              </button>
            </div>
          </dialog>
        </div>
      ) : null}
    </>
  );
}

function isLocked(capability: Capability, role: Role) {
  if (capability.id === "program.enroll") {
    return true;
  }
  if (role === "member") {
    return true;
  }
  if (capability.id === "home.publish" && role !== "admin") {
    return true;
  }
  if (capability.id === "account.permissions.write") {
    return true;
  }
  if (capability.id === "account.permissions.read" && role === "admin") {
    return true;
  }
  return false;
}

function CapabilityToggle({
  capability,
  role,
  value,
  onChange,
}: {
  capability: Capability;
  role: Role;
  value: boolean;
  onChange: () => void;
}) {
  const locked = isLocked(capability, role);
  return (
    <button
      aria-label={`${capability.label} · ${roleLabel(role)}`}
      aria-pressed={value}
      className={`${styles.policyCell} ${locked ? styles.lockedCell : ""}`}
      disabled={locked}
      onClick={onChange}
      type="button"
    >
      <span aria-hidden="true">{value ? "✓" : "—"}</span>
      <small>{locked ? "固定" : "可編輯"}</small>
    </button>
  );
}

function PermissionsPack({
  variant,
  scenario,
}: {
  variant: Variant;
  scenario: string;
}) {
  const [draft, setDraft] = useState(() =>
    CAPABILITIES.map((capability) => ({ ...capability }))
  );
  const [role, setRole] = useState<Role>("staff");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const toggle = (id: string, targetRole: Role) => {
    setDraft((current) =>
      current.map((capability) =>
        capability.id === id
          ? { ...capability, [targetRole]: !capability[targetRole] }
          : capability
      )
    );
    setDirty(true);
    setSaved(false);
  };
  const save = () => {
    setDirty(false);
    setSaved(true);
  };
  const groups = [...new Set(draft.map((capability) => capability.group))];

  if (scenario === "conflict") {
    return (
      <section className={styles.centredState} role="alert">
        <span className={styles.stateIcon}>↯</span>
        <h1>權限政策已有更新</h1>
        <p>另一位管理員已儲存較新版本。系統沒有覆蓋對方的變更。</p>
        <div className={styles.actionRow}>
          <button className={styles.secondaryButton} type="button">
            下載我的變更
          </button>
          <button className={styles.primaryButton} type="button">
            重新載入政策
          </button>
        </div>
      </section>
    );
  }

  let content: React.ReactNode;
  if (variant === "a") {
    content = (
      <section>
        <SectionIntro
          eyebrow="角色優先"
          title="權限政策"
          description="先選角色，再逐項理解這個角色可以做甚麼。"
        />
        <div className={styles.roleTabs} role="tablist">
          {(["admin", "staff", "member"] as Role[]).map((item) => (
            <button
              aria-selected={role === item}
              key={item}
              onClick={() => setRole(item)}
              role="tab"
              type="button"
            >
              {roleLabel(item)}
            </button>
          ))}
        </div>
        <div className={styles.policyCards}>
          {groups.map((group) => (
            <section key={group}>
              <h2>{group}</h2>
              {draft
                .filter((capability) => capability.group === group)
                .map((capability) => (
                  <article key={capability.id}>
                    <div>
                      <strong>{capability.label}</strong>
                      <p>{capability.description}</p>
                      <code>{capability.id}</code>
                    </div>
                    <CapabilityToggle
                      capability={capability}
                      onChange={() => toggle(capability.id, role)}
                      role={role}
                      value={capability[role]}
                    />
                  </article>
                ))}
            </section>
          ))}
        </div>
      </section>
    );
  } else if (variant === "c") {
    content = (
      <section>
        <SectionIntro
          eyebrow="變更導向"
          title="政策變更草稿"
          description="按工作範圍檢視能力，右側持續顯示尚未儲存的影響。"
        />
        <div className={styles.changeLayout}>
          <div className={styles.groupStack}>
            {groups.map((group) => (
              <details key={group} open>
                <summary>
                  {group}
                  <span>
                    {
                      draft.filter((capability) => capability.group === group)
                        .length
                    }{" "}
                    項
                  </span>
                </summary>
                {draft
                  .filter((capability) => capability.group === group)
                  .map((capability) => (
                    <div className={styles.changeRow} key={capability.id}>
                      <div>
                        <strong>{capability.label}</strong>
                        <small>{capability.description}</small>
                      </div>
                      <div>
                        {(["admin", "staff", "member"] as Role[]).map(
                          (item) => (
                            <CapabilityToggle
                              capability={capability}
                              key={item}
                              onChange={() => toggle(capability.id, item)}
                              role={item}
                              value={capability[item]}
                            />
                          )
                        )}
                      </div>
                    </div>
                  ))}
              </details>
            ))}
          </div>
          <aside className={styles.reviewPanel}>
            <span className={styles.eyebrow}>變更摘要</span>
            <h2>{dirty ? "有未儲存變更" : "政策已同步"}</h2>
            <p>
              {dirty
                ? "儲存時會以一個原子變更集更新政策。"
                : "目前顯示政策版本 18。"}
            </p>
            <button
              className={styles.primaryButton}
              disabled={!dirty}
              onClick={save}
              type="button"
            >
              檢視並儲存
            </button>
          </aside>
        </div>
      </section>
    );
  } else {
    content = (
      <section>
        <SectionIntro
          eyebrow="完整政策"
          title="角色 × 權限矩陣"
          description="一頁核對所有角色能力；固定格清楚顯示系統安全邊界。"
        />
        <div className={styles.matrixWrap}>
          <table className={styles.matrix}>
            <thead>
              <tr>
                <th>權限</th>
                <th>管理員</th>
                <th>同工</th>
                <th>會友</th>
              </tr>
            </thead>
            <tbody>
              {draft.map((capability) => (
                <tr key={capability.id}>
                  <th>
                    <strong>{capability.label}</strong>
                    <small>{capability.description}</small>
                    <code>{capability.id}</code>
                  </th>
                  {(["admin", "staff", "member"] as Role[]).map((item) => (
                    <td key={item}>
                      <CapabilityToggle
                        capability={capability}
                        onChange={() => toggle(capability.id, item)}
                        role={item}
                        value={capability[item]}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <>
      {content}
      <footer className={styles.saveBar} aria-live="polite">
        <div>
          <strong>
            {saved ? "政策已儲存" : dirty ? "有未儲存變更" : "政策版本 18"}
          </strong>
          <span>
            {saved
              ? "所有管理畫面會使用最新政策。"
              : "整份政策會以一個版本一次儲存。"}
          </span>
        </div>
        <button
          className={styles.primaryButton}
          disabled={!dirty}
          onClick={save}
          type="button"
        >
          儲存變更
        </button>
      </footer>
    </>
  );
}

function PrototypeSwitcher({
  pack,
  variant,
  scenario,
}: {
  pack: Pack;
  variant: Variant;
  scenario: string;
}) {
  const router = useRouter();
  const scenarios: Record<Pack, string[]> = {
    directory: ["default", "empty", "forbidden"],
    approvals: ["pending", "resolved", "conflict"],
    permissions: ["default", "conflict"],
  };
  const update = (
    nextPack: Pack,
    nextVariant: Variant,
    nextScenario = "default"
  ) =>
    router.replace(
      `/management?prototype=s4&pack=${nextPack}&variant=${nextVariant}&scenario=${nextScenario}`
    );
  const variants: Variant[] = ["a", "b", "c"];
  const move = (direction: -1 | 1) => {
    const index = variants.indexOf(variant);
    const next =
      variants[(index + direction + variants.length) % variants.length];
    update(pack, next, scenario);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable='true']")) {
        return;
      }
      if (event.key === "ArrowLeft") {
        move(-1);
      }
      if (event.key === "ArrowRight") {
        move(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <aside aria-label="S4 prototype switcher" className={styles.switcher}>
      <div className={styles.switcherVariants}>
        <button aria-label="上一個設計" onClick={() => move(-1)} type="button">
          ←
        </button>
        <strong>{VARIANT_LABELS[variant]}</strong>
        <button aria-label="下一個設計" onClick={() => move(1)} type="button">
          →
        </button>
      </div>
      <details className={styles.switcherMore}>
        <summary>切換畫面與狀態</summary>
        <div className={styles.switcherPacks}>
          {(Object.keys(PACK_LABELS) as Pack[]).map((item) => (
            <button
              aria-pressed={pack === item}
              key={item}
              onClick={() => update(item, variant, scenarios[item][0])}
              type="button"
            >
              {PACK_LABELS[item]}
            </button>
          ))}
        </div>
        <div className={styles.switcherStates}>
          <span>狀態</span>
          {scenarios[pack].map((item) => (
            <button
              aria-pressed={scenario === item}
              key={item}
              onClick={() => update(pack, variant, item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </details>
    </aside>
  );
}

export function S4Prototype() {
  const searchParams = useSearchParams();
  const packParam = searchParams.get("pack");
  const variantParam = searchParams.get("variant");
  const pack: Pack = isPack(packParam) ? packParam : "directory";
  const variant: Variant = isVariant(variantParam) ? variantParam : "a";
  const scenario = searchParams.get("scenario") ?? "default";

  let content: React.ReactNode;
  if (pack === "approvals") {
    content = <ApprovalsPack scenario={scenario} variant={variant} />;
  } else if (pack === "permissions") {
    content = <PermissionsPack scenario={scenario} variant={variant} />;
  } else {
    content = <DirectoryPack scenario={scenario} variant={variant} />;
  }

  return (
    <PrototypeShell pack={pack}>
      <div className={styles.prototypeNote}>
        <span>PROTOTYPE</span>
        <p>三個方向用作決定 S4 final UI；資料只存在記憶體。</p>
      </div>
      {content}
      <PrototypeSwitcher pack={pack} scenario={scenario} variant={variant} />
    </PrototypeShell>
  );
}
