import { delay, http, HttpResponse } from "msw";

import type { AuthMeResult, PublicUser } from "@/lib/api";
import { COPY } from "@/lib/copy";
import type {
  ManagementHubRow,
  ManagementHubView,
} from "@/lib/programs/hub-types";
import { projectNavigation, projectSections } from "@/lib/sections";

const STORYBOOK_REQUEST_ID = "t07-1-storybook";
const MANAGEMENT_HUB_ENDPOINT = "/api/v1/programs/hub";
const AUTH_ME_ENDPOINT = "/api/v1/auth/me";

const row = (
  key: string,
  label: string,
  description: string,
  href: string
): ManagementHubRow => ({ key, label, description, href });

export const MANAGEMENT_HUB_DEFAULT: ManagementHubView = {
  groups: [
    {
      key: "members-and-permissions",
      label: COPY.management.groupMemberPermissions,
      rows: [
        row(
          "approvals",
          COPY.management.approvalsRow,
          COPY.management.approvalsRowHint,
          "/management?module=approvals"
        ),
        row(
          "permissions",
          COPY.management.permissionsRow,
          COPY.management.permissionsRowHint,
          "/management?module=permissions"
        ),
      ],
    },
    {
      key: "ministry-operations",
      label: COPY.management.groupOperations,
      rows: [
        row(
          "departments",
          COPY.management.departmentsRow,
          COPY.management.departmentsRowHint,
          "/management?module=departments"
        ),
        row(
          "attendance",
          COPY.management.attendanceRow,
          COPY.management.attendanceRowHint,
          "/management?module=attendance"
        ),
        row(
          "members",
          COPY.management.membersRow,
          COPY.management.membersRowHint,
          "/management?module=members"
        ),
      ],
    },
    {
      key: "content-and-system",
      label: COPY.management.groupContentSystem,
      rows: [
        row(
          "home-content",
          COPY.management.homeContentRow,
          COPY.management.homeContentRowHint,
          "/management?module=home-content"
        ),
      ],
    },
  ],
  entryCard: row(
    "course-management",
    COPY.management.goCourseManagement,
    COPY.management.goCourseManagementHint,
    "/programs?mode=management"
  ),
};

export const MANAGEMENT_HUB_EMPTY: ManagementHubView = {
  groups: [],
  entryCard: null,
};

const STORYBOOK_CAPABILITIES = {
  "account.directory.read": true,
  "account.permissions.read": true,
  "department.manage": true,
  "department.module.configure": true,
  "department.publish": true,
  "home.publish": true,
  "program.manage": true,
  "program.publish": true,
  "registration.approval.manage": true,
  "role.permissions.read": true,
  "role.read": true,
};

export const STORYBOOK_USER: PublicUser = {
  userId: "t07-1-storybook-user",
  name: "T07.1 Storybook Manager",
  username: "t07-1-storybook-manager",
  phone: "00000000",
  identities: [
    {
      label: "T07.1 synthetic manager",
      scopeKind: "Global",
      scopeLabel: null,
    },
  ],
  capabilities: STORYBOOK_CAPABILITIES,
  status: "Active",
  qrCodeString: "t07-1-storybook-only",
};

export const AUTH_ME_RESULT: AuthMeResult = {
  user: STORYBOOK_USER,
  sections: projectSections(STORYBOOK_CAPABILITIES),
  navigation: projectNavigation(STORYBOOK_CAPABILITIES),
};

export const authMeHandler = http.get(AUTH_ME_ENDPOINT, () =>
  HttpResponse.json({
    requestId: `${STORYBOOK_REQUEST_ID}-auth`,
    data: AUTH_ME_RESULT,
  })
);

export const managementHubHandler = (
  view: ManagementHubView,
  requestId = `${STORYBOOK_REQUEST_ID}-hub`
) =>
  http.get(MANAGEMENT_HUB_ENDPOINT, () =>
    HttpResponse.json({ requestId, data: view })
  );

export const managementHubLoadingHandler = http.get(
  MANAGEMENT_HUB_ENDPOINT,
  async () => {
    await delay("infinite");
    return HttpResponse.json({
      requestId: `${STORYBOOK_REQUEST_ID}-loading`,
      data: MANAGEMENT_HUB_DEFAULT,
    });
  }
);

export const managementHubRecoverableErrorHandler = http.get(
  MANAGEMENT_HUB_ENDPOINT,
  () =>
    HttpResponse.json(
      {
        type: "https://example.invalid/problems/unavailable",
        title: "Management Hub unavailable",
        status: 503,
        detail: "Storybook-only recoverable Management Hub failure.",
        code: "UNAVAILABLE",
        requestId: `${STORYBOOK_REQUEST_ID}-error`,
      },
      {
        status: 503,
        headers: {
          "Content-Type": "application/problem+json",
          "X-Request-Id": `${STORYBOOK_REQUEST_ID}-error`,
        },
      }
    )
);
