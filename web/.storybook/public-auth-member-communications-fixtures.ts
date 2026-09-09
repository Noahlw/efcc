import { http, HttpResponse } from "msw";

import type { AuthMeResult } from "@/lib/api";
import type { HomeData } from "@/lib/home-api";
import type { ParticipantCatalogEntry } from "@/lib/programs/program-api";
import { projectNavigation, projectSections } from "@/lib/sections";

const REQUEST_ID = "t07-2-storybook";

const MEMBER_CAPABILITIES: Record<string, boolean> = {};
const MEMBER_AUTH_ME_RESULT: AuthMeResult = {
  user: {
    userId: "t07-2-storybook-member",
    name: "T07.2 Storybook Member",
    username: "t07-2-member",
    phone: "00000000",
    identities: [],
    capabilities: MEMBER_CAPABILITIES,
    status: "active",
    qrCodeString: "t07-2-synthetic-qr",
  },
  sections: projectSections(MEMBER_CAPABILITIES),
  navigation: projectNavigation(MEMBER_CAPABILITIES),
};

export const memberAuthMeHandler = http.get("/api/v1/auth/me", () =>
  HttpResponse.json({
    requestId: `${REQUEST_ID}-auth`,
    data: MEMBER_AUTH_ME_RESULT,
  })
);

const HOME_DATA: HomeData = {
  featuredEvent: {
    eventId: "t07-2-event",
    programId: "t07-2-program",
    programTitle: "Storybook 社區聚會",
    title: "Storybook 社區聚會",
    startsAt: "2099-09-06T10:00:00.000Z",
    endsAt: "2099-09-06T11:00:00.000Z",
    location: "Storybook 房間",
    status: "Active",
    isEnrolled: true,
  },
  announcement: {
    contentId: "t07-2-announcement",
    version: 1,
    title: "Storybook 公告",
    summary: "用於 Storybook baseline 的 synthetic 公告。",
    bodyMarkdown: "只供本地 presentation workshop 使用。",
    ctaLabel: null,
    ctaUrl: null,
    imageUrl: null,
    imageAlt: null,
    publishedAt: "2099-09-01T00:00:00.000Z",
  },
  exploreProgram: {
    programId: "t07-2-program",
    title: "Storybook 社區聚會",
    summary: "Synthetic member-facing programme projection.",
    category: "Community",
    enrollmentType: "MemberRequest",
    nextEventStartAt: "2099-09-06T10:00:00.000Z",
  },
};

const PARTICIPANT_CATALOG: ParticipantCatalogEntry[] = [];

const NOTICES = [
  {
    notice_id: "t07-2-notice",
    kind: "account" as const,
    title: "Synthetic account notice",
    body: "A deterministic notice for the Storybook baseline.",
    program_id: null,
    event_id: null,
    read_at: null,
    created_at: Date.UTC(2099, 8, 1),
  },
];

const ANNOUNCEMENTS = [
  {
    contentId: "t07-2-message",
    version: 1,
    title: "Synthetic message",
    summary: "A deterministic communications baseline message.",
    bodyMarkdown: "Storybook-only message body.",
    ctaLabel: null,
    ctaUrl: null,
    imageUrl: null,
    imageAlt: null,
    publishedAt: "2099-09-02T00:00:00.000Z",
  },
];

const envelope = <T>(data: T) =>
  HttpResponse.json({ requestId: REQUEST_ID, data });

const legacyCredentialLoginHandler = http.post("/api/v1/auth/login", () =>
  envelope({
    userId: "t07-2-upgrade-member",
    name: "T07.2 Synthetic Upgrade Member",
    status: "active",
    mustSetNewCredential: true,
  })
);

export const credentialUpgradeHandlers = [legacyCredentialLoginHandler];

export const publicAuthMemberCommunicationsHandlers = [
  memberAuthMeHandler,
  http.get("/api/v1/home", () => envelope(HOME_DATA)),
  http.get("/api/v1/home/announcements", () =>
    envelope({ announcements: ANNOUNCEMENTS })
  ),
  http.get("/api/v1/programs/access", () =>
    envelope({
      hasManagementCapability: false,
      departmentScopes: 0,
      programScopes: 0,
    })
  ),
  http.get("/api/v1/programs/catalog", () =>
    envelope({ catalog: PARTICIPANT_CATALOG })
  ),
  http.get("/api/v1/programs/notices", () =>
    envelope({ notices: NOTICES, unread_count: 1 })
  ),
  http.post("/api/v1/programs/notices/read-all", () =>
    envelope({ notices: [], unread_count: 0 })
  ),
];
