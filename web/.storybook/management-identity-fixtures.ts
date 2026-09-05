import { http, HttpResponse } from "msw";

import { authMeHandler } from "./management-hub-fixtures";

const envelope = <T>(data: T) =>
  HttpResponse.json({ requestId: "t07-4-storybook", data });

const ACCOUNT = {
  userId: "t07-4-account",
  name: "Storybook Management Member",
  username: "t07-4-member",
  phone: "00000000",
  identities: [],
  status: "Active",
  departments: [{ id: "t07-4-department", name: "Storybook Department" }],
  canOpenAccess: true,
};

const ROLE = {
  roleDefinitionId: "t07-4-role",
  label: "Storybook Manager",
  description: "Synthetic authorized management role.",
  kind: "CUSTOM",
  scopeKind: "Global",
  scopeId: null,
  scopeLabel: "全教會",
  position: 1,
  isProtected: false,
  isArchived: false,
  assignmentCount: 1,
  grantCount: 1,
  actions: [{ action: "rename", label: "重新命名" }],
  reorderActions: [],
};

const ROLE_HIERARCHY = {
  revision: 1,
  caller: { userId: "t07-4-manager", highestPosition: 0 },
  categories: [
    {
      categoryKey: "Global",
      label: "全教會",
      description: "Synthetic role hierarchy.",
      displayOrder: 0,
      childCount: 1,
      definitions: [ROLE],
      createOptions: [],
    },
    {
      categoryKey: "Department",
      label: "部門",
      description: "",
      displayOrder: 1,
      childCount: 0,
      definitions: [],
      createOptions: [],
    },
    {
      categoryKey: "Program",
      label: "課程",
      description: "",
      displayOrder: 2,
      childCount: 0,
      definitions: [],
      createOptions: [],
    },
  ],
};

const ROLE_DETAIL = {
  roleDefinition: ROLE,
  grants: [
    {
      capability: "program.manage",
      grantedBy: "t07-4-manager",
      grantedAt: "2099-09-01T00:00:00.000Z",
    },
  ],
  revision: 1,
};

const ACCESS_VIEW = {
  account: ACCOUNT,
  activeAssignments: [],
  revokedAssignments: [],
  assignmentHistory: [],
  effectiveAccess: {
    Global: [
      {
        capability: "program.manage",
        label: "管理課程",
        description: "",
        group: "Storybook",
        risk: "normal",
        scopeRequired: false,
        scopeKind: "Global",
        scopeId: null,
        scopeLabel: null,
        sources: ["Storybook Manager"],
        sourceRoleDefinitionIds: ["t07-4-role"],
      },
    ],
    Department: [],
    Program: [],
  },
  lifecycleImpacts: {},
  revision: 1,
  actions: {
    assign: true,
    revoke: false,
    archive: false,
    restore: false,
    revokeRoleDefinitionIds: [],
    archiveRoleDefinitionIds: [],
    restoreRoleDefinitionIds: [],
  },
  assignableRoles: [ROLE].map(
    ({
      roleDefinitionId,
      label,
      scopeKind,
      scopeId,
      scopeLabel,
      position,
    }) => ({
      roleDefinitionId,
      label,
      scopeKind,
      scopeId,
      scopeLabel,
      position,
    })
  ),
};

const CONTENT = {
  contentId: "t07-4-home-content",
  version: 1,
  templateType: "A",
  status: "Draft",
  publishMode: "immediate",
  startAt: null,
  endAt: null,
  title: "Storybook Home Content",
  summary: "Synthetic CMS content for the Management baseline.",
  bodyMarkdown: "Storybook-only content.",
  ctaLabel: "了解更多",
  ctaUrl: "https://example.invalid/storybook",
  imageUrl: null,
  imageAlt: null,
  featuredEventId: null,
  updatedBy: "t07-4-manager",
  updatedAt: "2099-09-01T00:00:00.000Z",
  publishedBy: null,
  publishedAt: null,
};

const REGISTRATION = {
  requestId: "t07-4-registration",
  username: "t07-4-applicant",
  name: "Storybook Applicant",
  phone: "00000000",
  submittedAt: Date.UTC(2099, 8, 1),
  accountStatus: "pending",
  decision: null,
  decisionNote: null,
};

const handlers = [
  authMeHandler,
  http.get("/api/v1/auth/registrations", () =>
    envelope({ registrations: [REGISTRATION], status: "Pending" })
  ),
  http.get("/api/v1/auth/registrations/:requestId", () =>
    envelope({ ...REGISTRATION, status: "Pending", decidedAt: null })
  ),
  http.get("/api/v1/programs/accounts", () =>
    envelope({
      accounts: [ACCOUNT],
      nextCursor: null,
      summary: { total: 1, active: 1, elevated: 1, pending: 0 },
    })
  ),
  http.get("/api/v1/programs/members", () =>
    envelope({
      members: [
        {
          userId: ACCOUNT.userId,
          name: ACCOUNT.name,
          phone: ACCOUNT.phone,
          identities: [],
          status: "Active",
          departments: ACCOUNT.departments,
        },
      ],
    })
  ),
  http.get("/api/v1/identity/roles", () => envelope(ROLE_HIERARCHY)),
  http.get("/api/v1/identity/role-definitions/:roleDefinitionId", () =>
    envelope(ROLE_DETAIL)
  ),
  http.get("/api/v1/identity/accounts/:userId/assignments", () =>
    envelope(ACCESS_VIEW)
  ),
  http.get("/api/v1/identity/accounts", () =>
    envelope({ accounts: [], nextOffset: null })
  ),
  http.get("/api/v1/home/content", () => envelope(CONTENT)),
  http.get("/api/v1/home/audit", () => envelope({ items: [] })),
  http.get("/api/v1/home", () =>
    envelope({ featuredEvent: null, announcement: null, exploreProgram: null })
  ),
];

export const managementIdentityHandlers = handlers;
