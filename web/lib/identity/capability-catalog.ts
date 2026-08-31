/**
 * Closed, code-owned capability catalog for normalized identities.
 *
 * Capability keys are intentionally finite. Product surfaces consume the
 * Cantonese metadata here; database grants store only the key and the Worker
 * revalidates both against this catalog and the actor's authority.
 */

export const CAPABILITY_CATALOG = [
  {
    capability: "role.read",
    label: "檢視身份組",
    description: "查看身份組分類、定義、指派帳戶及適用範圍。",
    group: "身份組管理",
    risk: "high",
    systemOnly: false,
    scopeRequired: false,
  },
  {
    capability: "role.assign",
    label: "指派身份組",
    description: "為符合資格的生效帳戶指派較低順位身份組。",
    group: "身份組管理",
    risk: "high",
    systemOnly: false,
    scopeRequired: true,
  },
  {
    capability: "role.revoke",
    label: "撤銷身份組",
    description: "在授權範圍內撤銷帳戶的身份組指派。",
    group: "身份組管理",
    risk: "high",
    systemOnly: false,
    scopeRequired: true,
  },
  {
    capability: "role.reorder",
    label: "調整身份組順序",
    description: "在固定分類內調整較低身份組的順位。",
    group: "身份組管理",
    risk: "high",
    systemOnly: false,
    scopeRequired: true,
  },
  {
    capability: "role.name.write",
    label: "編輯身份組名稱",
    description: "重新命名較低身份組，並保持名稱唯一。",
    group: "身份組管理",
    risk: "high",
    systemOnly: false,
    scopeRequired: true,
  },
  {
    capability: "role.permissions.read",
    label: "檢視權限",
    description: "查看其他較低身份組的權限狀態。",
    group: "身份組管理",
    risk: "high",
    systemOnly: false,
    scopeRequired: true,
  },
  {
    capability: "role.permissions.write",
    label: "編輯權限",
    description: "修改較低身份組的有效權限設定。",
    group: "身份組管理",
    risk: "high",
    systemOnly: false,
    scopeRequired: true,
  },
  {
    capability: "role.scope.read",
    label: "檢視適用範圍",
    description: "查看身份組所屬的部門或課程範圍。",
    group: "身份組管理",
    risk: "high",
    systemOnly: false,
    scopeRequired: true,
  },
  {
    capability: "role.scope.write",
    label: "編輯適用範圍",
    description: "修改較低身份組的單一部門或課程範圍。",
    group: "身份組管理",
    risk: "high",
    systemOnly: false,
    scopeRequired: true,
  },
  {
    capability: "role.create",
    label: "新增身份組",
    description: "在獲准的固定分類下建立自訂身份組。",
    group: "身份組管理",
    risk: "high",
    systemOnly: false,
    scopeRequired: true,
  },
  {
    capability: "role.delete",
    label: "停用身份組",
    description: "停用身份組並撤銷其生效中的帳戶指派。",
    group: "身份組管理",
    risk: "high",
    systemOnly: false,
    scopeRequired: true,
  },
  {
    capability: "department.manage",
    label: "部門管理",
    description: "編輯部門資料及日常運作。",
    group: "部門",
    risk: "normal",
    systemOnly: false,
    scopeRequired: true,
  },
  {
    capability: "department.publish",
    label: "部門發佈",
    description: "將部門發佈為使用中。",
    group: "部門",
    risk: "normal",
    systemOnly: false,
    scopeRequired: true,
  },
  {
    capability: "department.module.configure",
    label: "部門模組設定",
    description: "啟用或停用部門模組。",
    group: "部門",
    risk: "normal",
    systemOnly: false,
    scopeRequired: true,
  },
  {
    capability: "department.manager.assign",
    label: "部門管理者指派",
    description: "指派或撤銷部門管理者身份。",
    group: "部門",
    risk: "normal",
    systemOnly: false,
    scopeRequired: true,
  },
  {
    capability: "program.manage",
    label: "課程管理",
    description: "建立及編輯課程與聚會。",
    group: "課程",
    risk: "normal",
    systemOnly: false,
    scopeRequired: true,
  },
  {
    capability: "program.publish",
    label: "課程發佈",
    description: "將課程列入會友目錄。",
    group: "課程",
    risk: "normal",
    systemOnly: false,
    scopeRequired: true,
  },
  {
    capability: "program.enroll",
    label: "提交課程報名",
    description: "以會友身份提交自己的課程報名。",
    group: "會友基礎",
    risk: "normal",
    systemOnly: false,
    scopeRequired: false,
  },
  {
    capability: "program.leader.assign",
    label: "事工負責人指派",
    description: "指派或撤銷課程負責人身份。",
    group: "課程",
    risk: "normal",
    systemOnly: false,
    scopeRequired: true,
  },
  {
    capability: "account.permissions.read",
    label: "查看權限政策",
    description: "查看帳戶與身份組權限政策。",
    group: "帳戶與系統",
    risk: "normal",
    systemOnly: false,
    scopeRequired: false,
  },
  {
    capability: "account.permissions.write",
    label: "修改權限政策",
    description: "改變全系統身份組權限。",
    group: "帳戶與系統",
    risk: "high",
    systemOnly: true,
    scopeRequired: false,
  },
  {
    capability: "account.directory.read",
    label: "查看帳戶名錄",
    description: "搜尋全教會生效帳戶。",
    group: "帳戶與系統",
    risk: "normal",
    systemOnly: false,
    scopeRequired: false,
  },
  {
    capability: "registration.approval.manage",
    label: "註冊審批",
    description: "核准或拒絕帳戶註冊申請。",
    group: "帳戶與系統",
    risk: "high",
    systemOnly: true,
    scopeRequired: false,
  },
  {
    capability: "home.publish",
    label: "首頁內容發佈",
    description: "發佈全教會首頁公開內容。",
    group: "帳戶與系統",
    risk: "high",
    systemOnly: true,
    scopeRequired: false,
  },
] as const;

export type Capability = (typeof CAPABILITY_CATALOG)[number]["capability"];
export type CapabilityMetadata = (typeof CAPABILITY_CATALOG)[number];
export type CapabilityRisk = CapabilityMetadata["risk"];
export type CapabilityGroup = CapabilityMetadata["group"];

const METADATA_BY_CAPABILITY: Record<string, CapabilityMetadata> =
  Object.fromEntries(
    CAPABILITY_CATALOG.map((entry) => [entry.capability, entry])
  );

export function isCapability(value: string): value is Capability {
  return METADATA_BY_CAPABILITY[value] !== undefined;
}

export function capabilityMetadata(
  capability: string
): CapabilityMetadata | undefined {
  return METADATA_BY_CAPABILITY[capability];
}

export const HIGH_RISK_CAPABILITIES = CAPABILITY_CATALOG.filter(
  (entry) => entry.risk === "high"
).map((entry) => entry.capability) as readonly Capability[];
