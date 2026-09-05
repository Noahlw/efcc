/**
 * EFCC UI Control Recovery — Canonical Governance Registries.
 *
 * Six closed, code-owned typed registries providing machine-enforced governance
 * for route scenarios, UI contracts, owner approvals, exact-scope waivers,
 * preservation references, and documented native exceptions.
 *
 * Baseline SHA anchors:
 * - Rescue integration HEAD: 6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2 (T02 merged)
 * - T04 Worker suites reviewed HEAD: cdbe4757af51247a78bc3a1c94ade1f11c332a6a
 * - Frozen Phase F SHA: 6edf28c0f8f7058cf992416e7b517824c3178c8
 * - Phase A head: 3cc674f4e2240abaebb47bb75c6614a8c3d7c624
 */

import type {
  ApprovalPackage,
  GovernanceRegistries,
  NativeException,
  PreservationReference,
  RouteScenario,
  UIContract,
  Waiver,
} from "./types";

/**
 * Canonical Scenario Registry.
 * Maps every core route scenario to its viewports, browsers, UI contracts, and ownership layer.
 */
export const SCENARIO_REGISTRY: readonly RouteScenario[] = [
  {
    id: "SCN-SHELL-BASE",
    route: "/",
    scenario: "default",
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium", "firefox", "webkit"],
    contractIds: [
      "CTR-TK-01",
      "CTR-TK-04",
      "CTR-TK-05",
      "CTR-TK-07",
      "CTR-TK-08",
      "CTR-TK-10",
      "CTR-CSS-01",
      "CTR-STY-01",
    ],
    coverageDisposition: "covered",
    layer: "global",
    description:
      "Authenticated and guest shell responsive structure, single landmark, and token consumption",
  },
  {
    id: "SCN-HOME-FEED",
    route: "/home",
    scenario: "default",
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium", "firefox", "webkit"],
    contractIds: [
      "CTR-TK-01",
      "CTR-FEED-01",
      "CTR-TK-07",
      "CTR-CSS-01",
      "CTR-STY-01",
    ],
    coverageDisposition: "covered",
    layer: "route",
    description:
      "Home announcement feed, upcoming events list, and quick actions",
  },
  {
    id: "SCN-SCANNER-CHOOSER",
    route: "/scanner",
    scenario: "default",
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium"],
    contractIds: [
      "CTR-TK-01",
      "CTR-ATT-01",
      "CTR-NEX-01",
      "CTR-CSS-01",
      "CTR-STY-01",
    ],
    coverageDisposition: "covered",
    layer: "route",
    description: "Self and assisted scanner mode chooser and camera viewport",
  },
  {
    id: "SCN-GUEST-CHECK-IN",
    route: "/guest-check-in",
    scenario: "default",
    viewports: [320, 390, 600, 799, 800],
    browsers: ["chromium"],
    contractIds: ["CTR-TK-01", "CTR-TK-07", "CTR-CSS-01", "CTR-STY-01"],
    coverageDisposition: "covered",
    layer: "route",
    description: "Phone-first guest check-in form and confirmation",
  },
  {
    id: "SCN-NOTICES-FEED",
    route: "/notices",
    scenario: "default",
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium"],
    contractIds: ["CTR-TK-01", "CTR-FEED-01", "CTR-CSS-01", "CTR-STY-01"],
    coverageDisposition: "covered",
    layer: "route",
    description: "Notices feed with unread indicators and list presentation",
  },
  {
    id: "SCN-MESSAGES-FEED",
    route: "/messages",
    scenario: "default",
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium"],
    contractIds: ["CTR-TK-01", "CTR-FEED-01", "CTR-CSS-01", "CTR-STY-01"],
    coverageDisposition: "covered",
    layer: "route",
    description: "Messages inbox, message items, and empty/loading states",
  },
  {
    id: "SCN-PROGRAMS-BOUNDARY",
    route: "/programs",
    scenario: "default",
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium"],
    contractIds: [
      "CTR-TK-01",
      "CTR-TK-07",
      "CTR-NEX-01",
      "CTR-CSS-01",
      "CTR-STY-01",
    ],
    coverageDisposition: "covered",
    layer: "route",
    description:
      "Programs participant/management directory and workspace boundary",
  },
  {
    id: "SCN-MANAGEMENT-HUB",
    route: "/management",
    scenario: "default",
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium"],
    contractIds: [
      "CTR-TK-01",
      "CTR-DIR-01",
      "CTR-ACT-01",
      "CTR-CSS-01",
      "CTR-STY-01",
    ],
    coverageDisposition: "covered",
    layer: "route",
    description: "Management hub navigation grid and task groups",
  },
  {
    id: "SCN-MEMBER-DIRECTORY",
    route: "/management/member-directory",
    scenario: "default",
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium"],
    contractIds: ["CTR-TK-01", "CTR-DIR-01", "CTR-CSS-01", "CTR-STY-01"],
    coverageDisposition: "covered",
    layer: "pattern",
    description:
      "Member directory frame with search, pagination, and detail drawer",
  },
  {
    id: "SCN-ACCOUNT-DIRECTORY",
    route: "/management/account-directory",
    scenario: "default",
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium"],
    contractIds: [
      "CTR-TK-01",
      "CTR-DIR-01",
      "CTR-NEX-01",
      "CTR-CSS-01",
      "CTR-STY-01",
    ],
    coverageDisposition: "covered",
    layer: "pattern",
    description:
      "Account directory frame with status/department filters and account rows",
  },
  {
    id: "SCN-ROLE-HIERARCHY",
    route: "/management/role-hierarchy",
    scenario: "default",
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium"],
    contractIds: [
      "CTR-TK-01",
      "CTR-ID-01",
      "CTR-ACT-01",
      "CTR-CSS-01",
      "CTR-STY-01",
    ],
    coverageDisposition: "covered",
    layer: "pattern",
    description:
      "Role hierarchy category tree, role ordering, and action surface",
  },
  {
    id: "SCN-PERMISSION-EDITOR",
    route: "/management/permission-editor",
    scenario: "default",
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium"],
    contractIds: [
      "CTR-TK-01",
      "CTR-ID-02",
      "CTR-ACT-01",
      "CTR-CSS-01",
      "CTR-STY-01",
    ],
    coverageDisposition: "covered",
    layer: "pattern",
    description:
      "Permission editor capability matrix and scope assignment drawer",
  },
  {
    id: "SCN-HOME-CMS-EDITOR",
    route: "/management/home-cms",
    scenario: "default",
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium"],
    contractIds: [
      "CTR-TK-01",
      "CTR-CMS-01",
      "CTR-NEX-01",
      "CTR-ACT-01",
      "CTR-CSS-01",
      "CTR-STY-01",
    ],
    coverageDisposition: "covered",
    layer: "pattern",
    description:
      "Home CMS announcement template editor and scheduling controls",
  },
  {
    id: "SCN-APPROVAL-QUEUE",
    route: "/approvals",
    scenario: "default",
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium"],
    contractIds: ["CTR-TK-01", "CTR-ACT-01", "CTR-CSS-01", "CTR-STY-01"],
    coverageDisposition: "covered",
    layer: "pattern",
    description:
      "Member registration approval queue, batch selection, and decision modals",
  },
  {
    id: "SCN-PROFILE-SETTINGS",
    route: "/profile/settings",
    scenario: "default",
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium"],
    contractIds: ["CTR-TK-01", "CTR-TK-07", "CTR-CSS-01", "CTR-STY-01"],
    coverageDisposition: "covered",
    layer: "route",
    description:
      "Account profile settings, PIN reset, and credential management",
  },
  {
    id: "SCN-ATTENTION-DIALOG",
    route: "/",
    scenario: "attention-overlay",
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium"],
    contractIds: [
      "CTR-TK-01",
      "CTR-TK-09",
      "CTR-TK-10",
      "CTR-CSS-01",
      "CTR-STY-01",
    ],
    coverageDisposition: "covered",
    layer: "primitive",
    description:
      "Attention overlay dialog primitive with tab strip accessibility",
  },
] as const;

/**
 * Canonical UI Contract Registry.
 * Defines executable assertions and probes for tokens, primitives, patterns, and global invariants.
 */
export const UI_CONTRACT_REGISTRY: readonly UIContract[] = [
  {
    id: "CTR-TK-01",
    name: "Civic Minimal Token Contract",
    layer: "global",
    scope: "web/app/globals.css",
    probes: [
      {
        id: "probe-token-surface",
        selector: ":root",
        property: "--surface",
        expected: "#f4f5f3",
        description: "Civic Minimal base light surface token",
      },
      {
        id: "probe-token-accent",
        selector: ":root",
        property: "--accent",
        expected: "#9c302c",
        description: "Civic Minimal cinnabar action accent token",
      },
      {
        id: "probe-token-focus",
        selector: ":root",
        property: "--focus",
        expected: "#176a87",
        description: "Civic Minimal teal focus indicator token",
      },
    ],
    coverageDisposition: "covered",
    baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
    status: "active",
    description:
      "Declares complete Civic Minimal design tokens on root with strict naming",
  },
  {
    id: "CTR-TK-04",
    name: "800px Shell Breakpoint Transition",
    layer: "global",
    scope: "web/app/globals.css",
    probes: [
      {
        id: "probe-breakpoint-800",
        selector: "@media (min-width: 800px)",
        property: "layout-mode",
        expected: "desktop-rail",
        description: "Single 800px media query transition for dock vs rail",
      },
    ],
    coverageDisposition: "covered",
    baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
    status: "active",
    description:
      "Single 800px breakpoint transition between phone dock and desktop rail",
  },
  {
    id: "CTR-TK-05",
    name: "Dock and Rail Single Navigation Landmark",
    layer: "global",
    scope: "web/lib/nav-bar.tsx",
    probes: [
      {
        id: "probe-nav-landmark-count",
        selector: "nav#main-navigation",
        property: "count",
        expected: 1,
        description: "Exactly one navigation landmark rendered in the DOM",
      },
    ],
    coverageDisposition: "covered",
    baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
    status: "active",
    description:
      "Exactly one navigation landmark present across phone and desktop viewports",
  },
  {
    id: "CTR-TK-07",
    name: "44px Minimum Tap Target Size",
    layer: "primitive",
    scope: "web/components/ui/*",
    probes: [
      {
        id: "probe-target-min-height",
        selector: "button, [role='button'], a",
        property: "minHeight",
        expected: 44,
        tolerance: 0,
        description: "Interactive controls meet minimum 44px height",
      },
    ],
    coverageDisposition: "covered",
    baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
    status: "active",
    description:
      "App-facing interactive elements enforce minimum 44px tap target size",
  },
  {
    id: "CTR-TK-08",
    name: "Safe-Area Clearance Geometry",
    layer: "global",
    scope: "web/app/globals.css",
    probes: [
      {
        id: "probe-safe-area-dock",
        selector: "#main-navigation",
        property: "bottom",
        expected: "calc(0.625rem + env(safe-area-inset-bottom, 0px))",
        description: "Main navigation floating dock clears iOS safe area inset",
      },
      {
        id: "probe-safe-area-shell-content",
        selector: "#shell-content",
        property: "paddingBottom",
        expected: "calc(84px + env(safe-area-inset-bottom, 0px))",
        description:
          "Shell content scroll container clears safe area and dock height",
      },
    ],
    coverageDisposition: "covered",
    baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
    status: "active",
    description:
      "Main navigation dock and shell content respect safe-area environment insets",
  },
  {
    id: "CTR-TK-09",
    name: "Attention Overlay Dialog Primitive",
    layer: "primitive",
    scope: "web/components/ui/dialog.tsx",
    probes: [
      {
        id: "probe-dialog-role",
        selector: "[role='dialog']",
        property: "aria-modal",
        expected: "true",
        description: "Radix Dialog modal overlay semantics",
      },
    ],
    coverageDisposition: "covered",
    baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
    status: "active",
    description: "Accessible Dialog primitive with tab strip accessibility",
  },
  {
    id: "CTR-TK-10",
    name: "Primitive Visible Focus Ring",
    layer: "primitive",
    scope: "web/components/ui/*",
    probes: [
      {
        id: "probe-focus-ring",
        selector: ":focus-visible",
        property: "outlineColor",
        expected: "var(--focus)",
        description: "3px teal focus ring on keyboard focus-visible",
      },
    ],
    coverageDisposition: "covered",
    baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
    status: "active",
    description: "Consistent 3px focus ring across all interactive primitives",
  },
  {
    id: "CTR-ACT-01",
    name: "Action Surface Sticky Dock",
    layer: "pattern",
    scope: "web/app/management/management-action-framework.tsx",
    probes: [
      {
        id: "probe-action-surface-dock",
        selector: "[data-action-surface]",
        property: "display",
        expected: "grid",
        description: "Action Surface responsive grid layout",
      },
    ],
    coverageDisposition: "covered",
    baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
    status: "active",
    description: "Sticky action dock on mobile and inline surface on desktop",
  },
  {
    id: "CTR-DIR-01",
    name: "Directory Frame Responsive Layout",
    layer: "pattern",
    scope: "web/app/management/directory-frame.tsx",
    probes: [
      {
        id: "probe-directory-frame-split",
        selector: "[data-directory-frame]",
        property: "responsiveMode",
        expected: "list-detail",
        description: "Responsive list and detail drawer composition",
      },
    ],
    coverageDisposition: "covered",
    baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
    status: "active",
    description:
      "Shared directory search, filter, list, and detail composition",
  },
  {
    id: "CTR-FEED-01",
    name: "Feed Presentation Semantic List",
    layer: "pattern",
    scope: "web/lib/feed-presentation.tsx",
    probes: [
      {
        id: "probe-feed-presentation-semantics",
        selector: "[data-feed-presentation]",
        property: "role",
        expected: "feed",
        description: "Feed presentation semantic article/section structure",
      },
    ],
    coverageDisposition: "covered",
    baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
    status: "active",
    description:
      "Semantic feed presentation shared across Home, Notices, and Messages",
  },
  {
    id: "CTR-ID-01",
    name: "Role Hierarchy Order and Scope",
    layer: "pattern",
    scope: "web/app/management/role-hierarchy-panel.tsx",
    probes: [
      {
        id: "probe-role-hierarchy-order",
        selector: "[data-role-category]",
        property: "categoryBoundary",
        expected: "enforced",
        description: "Role ordering constrained to category siblings",
      },
    ],
    coverageDisposition: "covered",
    baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
    status: "active",
    description:
      "Role hierarchy tree with category boundary and sibling reordering",
  },
  {
    id: "CTR-ID-02",
    name: "Permission Editor Matrix Drawer",
    layer: "pattern",
    scope: "web/app/management/permission-editor-panel.tsx",
    probes: [
      {
        id: "probe-permission-matrix",
        selector: "[data-permission-matrix]",
        property: "capabilityToggles",
        expected: "additive",
        description: "Capability toggles follow additive grant model",
      },
    ],
    coverageDisposition: "covered",
    baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
    status: "active",
    description:
      "Permission editor capability matrix and scope assignment drawer",
  },
  {
    id: "CTR-CMS-01",
    name: "Home CMS Scheduled Announcement",
    layer: "pattern",
    scope: "web/app/management/home-cms-editor.tsx",
    probes: [
      {
        id: "probe-cms-schedule-controls",
        selector: "#home-cms-publish-scheduled",
        property: "type",
        expected: "radio",
        description: "Schedule vs immediate radio control",
      },
    ],
    coverageDisposition: "covered",
    baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
    status: "active",
    description:
      "Home CMS template selection and scheduled publication controls",
  },
  {
    id: "CTR-ATT-01",
    name: "Attendance Scanner Event Chooser",
    layer: "route",
    scope: "web/lib/attendance-scanner-ui.tsx",
    probes: [
      {
        id: "probe-attendance-radio-group",
        selector:
          "input[type='radio'][name='scanner-event'], input[type='radio'][name='choose-event']",
        property: "fieldsetContract",
        expected: "ATT-02",
        description: "GOV.UK Attendance chooser radio group",
      },
    ],
    coverageDisposition: "covered",
    baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
    status: "active",
    description:
      "GOV.UK Attendance chooser ATT-02 accessible fieldset contract",
  },
  {
    id: "CTR-NEX-01",
    name: "Native Exception Containment",
    layer: "primitive",
    scope: "web/COMPONENT_INVENTORY.md",
    probes: [
      {
        id: "probe-native-exception-registry",
        selector: "table#native-exceptions",
        property: "uninventoriedCount",
        expected: 0,
        description: "Zero uninventoried native element occurrences",
      },
    ],
    coverageDisposition: "covered",
    baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
    status: "active",
    description:
      "All native controls are explicitly registered with documented rationale",
  },
  {
    id: "CTR-CSS-01",
    name: "Zero Reintroduced CSS Modules",
    layer: "global",
    scope: "web/app/**;web/lib/**",
    probes: [
      {
        id: "probe-zero-css-modules",
        selector: "import-statement",
        property: "cssModuleCount",
        expected: 0,
        description: "Zero .module.css imports in shipped app/lib code",
      },
    ],
    coverageDisposition: "covered",
    baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
    status: "active",
    description: "Zero CSS module islands in shipped app and lib surfaces",
  },
  {
    id: "CTR-STY-01",
    name: "Zero Ordinary Inline Style Declarations",
    layer: "global",
    scope: "web/app/**;web/lib/**",
    probes: [
      {
        id: "probe-zero-inline-styles",
        selector: "jsx-attribute[name='style']",
        property: "visualStyleCount",
        expected: 0,
        description:
          "Zero ordinary visual inline style declarations in app code",
      },
    ],
    coverageDisposition: "covered",
    baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
    status: "active",
    description:
      "Zero ordinary visual inline styles outside explicit ledger-backed waivers",
  },
] as const;

/**
 * Canonical Approval Package Registry.
 * Formal owner approvals referencing immutable baseline commit SHAs.
 */
export const APPROVAL_PACKAGE_REGISTRY: readonly ApprovalPackage[] = [
  {
    id: "APV-S4-PHASE-A-FOUNDATION",
    title: "S4 Phase A Civic Minimal Foundation and Token Contract",
    rationale:
      "Established Civic Minimal design tokens, single 800px transition, and local shadcn primitives",
    scope: ["web/app/globals.css", "web/components/ui/*", "web/lib/shell/*"],
    baselineSha: "3cc674f4e2240abaebb47bb75c6614a8c3d7c624",
    approvedBy: "Product Owner / #477",
    approvedAt: "2026-08-28T12:00:00Z",
    affectedRoutes: ["/", "/home", "/profile"],
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium", "firefox", "webkit"],
    contractIds: [
      "CTR-TK-01",
      "CTR-TK-04",
      "CTR-TK-05",
      "CTR-TK-07",
      "CTR-TK-08",
      "CTR-TK-09",
      "CTR-TK-10",
      "CTR-NEX-01",
    ],
    evidenceRef: "docs/specs/s4-phase-a-acceptance-trace.md",
    status: "approved",
  },
  {
    id: "APV-S4-PHASE-B-SHARED-MODULES",
    title: "S4 Phase B Shared Modules and Identity Projections",
    rationale:
      "Standardized DirectoryFrame, FeedPresentation, ActionSurface, and role hierarchy reordering",
    scope: [
      "web/app/management/*",
      "web/lib/feed-presentation.tsx",
      "web/lib/directory-frame.tsx",
    ],
    baselineSha: "3cc674f4e2240abaebb47bb75c6614a8c3d7c624",
    approvedBy: "Product Owner / #479-#484",
    approvedAt: "2026-08-29T14:00:00Z",
    affectedRoutes: ["/home", "/notices", "/messages", "/management/*"],
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium", "firefox", "webkit"],
    contractIds: [
      "CTR-DIR-01",
      "CTR-FEED-01",
      "CTR-ACT-01",
      "CTR-ID-01",
      "CTR-ID-02",
    ],
    evidenceRef: "docs/specs/s4-phase-b-acceptance-trace.md",
    status: "approved",
  },
  {
    id: "APV-S4-PHASE-F-CONTRACTION",
    title: "S4 Phase F Contraction and Release Gate",
    rationale:
      "Frozen zero-CSS-module invariant across all shipped surfaces and verified contraction gates",
    scope: ["web/app/*", "web/lib/*"],
    baselineSha: "6edf28c0f8f7058cf992416e7b517824c3178c8",
    approvedBy: "Product Owner / #494-#495",
    approvedAt: "2026-08-31T18:00:00Z",
    affectedRoutes: ["/*"],
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium", "firefox", "webkit"],
    contractIds: ["CTR-CSS-01", "CTR-STY-01"],
    evidenceRef: "docs/specs/s4-phase-f-acceptance-trace.md",
    status: "approved",
  },
  {
    id: "APV-T02-UI-GOVERNANCE-AUTHORITY",
    title: "T02 UI Governance Authority and Change Control",
    rationale:
      "Formal operating authority for UI rescue, change control boundaries, and four ownership layers",
    scope: [
      "docs/implementation/ui-control-recovery-governance.md",
      "docs/implementation/ui-control-recovery-plan.md",
    ],
    baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
    approvedBy: "Product Owner / #507",
    approvedAt: "2026-09-02T10:52:13Z",
    affectedRoutes: ["/*"],
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium", "firefox", "webkit"],
    contractIds: [
      "CTR-TK-01",
      "CTR-TK-04",
      "CTR-TK-05",
      "CTR-TK-07",
      "CTR-TK-08",
      "CTR-TK-09",
      "CTR-TK-10",
      "CTR-ACT-01",
      "CTR-DIR-01",
      "CTR-FEED-01",
      "CTR-ID-01",
      "CTR-ID-02",
      "CTR-CMS-01",
      "CTR-ATT-01",
      "CTR-NEX-01",
      "CTR-CSS-01",
      "CTR-STY-01",
    ],
    evidenceRef: "docs/implementation/ui-control-recovery-governance.md",
    status: "approved",
  },
] as const;

/**
 * Canonical Waiver Registry.
 * Exact-scope, ledger-backed temporary exceptions carrying owner, rationale, and removal condition.
 */
export const WAIVER_REGISTRY: readonly Waiver[] = [
  {
    id: "WVR-HISTORICAL-PROTOTYPE-MODULE-CSS",
    ruleId: "RULE-NO-CSS-MODULES",
    route: "/prototype",
    scenario: "default",
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium", "firefox", "webkit"],
    affectedFiles: [
      "web/app/prototype/page.tsx",
      "web/app/prototype/prototype.module.css",
    ],
    owner: "Phase F Contraction Ledger / #494",
    createdAt: "2026-08-31",
    expiresAt: "2026-12-31",
    rationale:
      "Retired prototype sandbox retained for historical comparison; excluded from shipped bundles",
    removalCondition:
      "Retire or isolate prototype route when UI rescue reaches final release",
    ledgerRef: "docs/implementation/ui-control-recovery-preservation-ledger.md",
    status: "active",
  },
  {
    id: "WVR-HISTORICAL-PROTOTYPE-INLINE-STYLES",
    ruleId: "RULE-NO-INLINE-STYLES",
    route: "/prototype",
    scenario: "default",
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium", "firefox", "webkit"],
    affectedFiles: ["web/app/prototype/page.tsx"],
    owner: "Phase F Contraction Ledger / #494",
    createdAt: "2026-08-31",
    expiresAt: "2026-12-31",
    rationale:
      "Prototype swatch cards declare dynamic token preview inline styles",
    removalCondition:
      "Retire or isolate prototype route when UI rescue reaches final release",
    ledgerRef: "docs/implementation/ui-control-recovery-preservation-ledger.md",
    status: "active",
  },
  {
    id: "WVR-HISTORICAL-PROTOTYPE-NATIVE-CONTROLS",
    ruleId: "RULE-UNDOCUMENTED-NATIVE-EXCEPTION",
    route: "/prototype",
    scenario: "default",
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium", "firefox", "webkit"],
    affectedFiles: ["web/app/prototype/page.tsx"],
    owner: "Phase F Contraction Ledger / #494",
    createdAt: "2026-08-31",
    expiresAt: "2026-12-31",
    rationale:
      "Prototype sandbox uses native buttons and form controls for interactive preview",
    removalCondition:
      "Retire or isolate prototype route when UI rescue reaches final release",
    ledgerRef: "docs/implementation/ui-control-recovery-preservation-ledger.md",
    status: "active",
  },
  {
    id: "WVR-HISTORICAL-PROTOTYPE-CSS-HOOKS",
    ruleId: "RULE-NO-FORBIDDEN-STYLING-HOOKS",
    route: "/prototype",
    scenario: "default",
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium", "firefox", "webkit"],
    affectedFiles: ["web/app/prototype/prototype.module.css"],
    owner: "Phase F Contraction Ledger / #494",
    createdAt: "2026-08-31",
    expiresAt: "2026-12-31",
    rationale: "Prototype CSS contains legacy color override containment hook",
    removalCondition:
      "Retire or isolate prototype route when UI rescue reaches final release",
    ledgerRef: "docs/implementation/ui-control-recovery-preservation-ledger.md",
    status: "active",
  },
  {
    id: "WVR-HISTORICAL-NOT-FOUND-INLINE-STYLES",
    ruleId: "RULE-NO-INLINE-STYLES",
    route: "/not-found",
    scenario: "default",
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium", "firefox", "webkit"],
    affectedFiles: ["web/app/not-found.tsx"],
    owner: "Phase A Civic Minimal Foundation / #477",
    createdAt: "2026-08-28",
    expiresAt: "2026-12-31",
    rationale:
      "404 page created in Phase A prior to complete Tailwind token utility migration",
    removalCondition:
      "Migrate 404 Not Found page to Civic Minimal Tailwind tokens and shadcn Card/Button during S1 route rescue",
    ledgerRef: "docs/implementation/ui-control-recovery-preservation-ledger.md",
    status: "active",
  },
  {
    id: "WVR-HISTORICAL-MANAGEMENT-PANEL-CVA",
    ruleId: "RULE-NO-ROUTE-CVA",
    route: "/management",
    scenario: "default",
    viewports: [320, 390, 600, 799, 800, 1024, 1440],
    browsers: ["chromium", "firefox", "webkit"],
    affectedFiles: [
      "web/app/management/account-access-panel.tsx",
      "web/app/management/permission-editor-panel.tsx",
      "web/app/management/role-hierarchy-panel.tsx",
      "web/app/management/settings-ui.tsx",
      "web/app/management/directory-frame.tsx",
      "web/app/management/management-action-framework.tsx",
    ],
    owner: "Phase C Stackable Identity / #485-#487",
    createdAt: "2026-08-29",
    expiresAt: "2026-12-31",
    rationale:
      "Management panel variants created during Phase C identity integration",
    removalCondition:
      "Promote management panel variants to shared ActionSurface and DirectoryFrame patterns during S4 management route rescue",
    ledgerRef: "docs/implementation/ui-control-recovery-preservation-ledger.md",
    status: "active",
  },
];

/**
 * Canonical Preservation Reference Registry.
 * Preserves the post-main S4 implementation lineage and domain ownership rules.
 */
export const PRESERVATION_REFERENCE_REGISTRY: readonly PreservationReference[] =
  [
    {
      id: "REF-S4-LINEAGE-473",
      lineageRef: "#473",
      scope: "S4 Full Implementation Base",
      invariants: [
        "Preserve post-main S4 lineage",
        "Preserve Civic Minimal design tokens",
        "Preserve phone-first shell navigation",
      ],
      layer: "global",
      ledgerRef:
        "docs/implementation/ui-control-recovery-preservation-ledger.md",
      notes: "Base origin PR #473 for full S4 shadcn migration",
    },
    {
      id: "REF-S4-PHASE-A-496",
      lineageRef: "#496",
      scope: "Phase A Foundation",
      invariants: [
        "800px shell transition",
        "Single navigation landmark",
        "44px minimum touch target",
        "Civic Minimal token contract",
      ],
      layer: "global",
      ledgerRef: "docs/specs/s4-phase-a-acceptance-trace.md",
      notes: "Phase A Civic Minimal token and shell foundation",
    },
    {
      id: "REF-S4-PHASE-B-501",
      lineageRef: "#501",
      scope: "Phase B Shared Modules",
      invariants: [
        "DirectoryFrame responsive list/detail",
        "FeedPresentation semantic list",
        "ActionSurface bottom dock",
      ],
      layer: "pattern",
      ledgerRef: "docs/specs/s4-phase-b-acceptance-trace.md",
      notes: "Phase B shared UI patterns and role definitions",
    },
    {
      id: "REF-S4-PHASE-C-502",
      lineageRef: "#502",
      scope: "Phase C Stackable Identity",
      invariants: [
        "Role hierarchy category ordering",
        "Permission editor capability matrix",
        "Server-authoritative identity",
      ],
      layer: "pattern",
      ledgerRef: "docs/specs/s4-phase-c-acceptance-trace.md",
      notes: "Phase C stackable identity and permission editor",
    },
    {
      id: "REF-S4-PHASE-E-504",
      lineageRef: "#504",
      scope: "Phase E Shared Integration",
      invariants: [
        "Zero route module.css files",
        "Zero route-owned global selectors in globals.css",
        "Documented native exceptions",
      ],
      layer: "global",
      ledgerRef: "docs/specs/s4-phase-e-acceptance-trace.md",
      notes: "Phase E operations route wave and CSS module deletion",
    },
    {
      id: "REF-S4-PHASE-F-FROZEN",
      lineageRef: "6edf28c0f8f7058cf992416e7b517824c3178c8",
      scope: "Phase F Contraction Gate",
      invariants: [
        "Zero module.css in shipped app/lib code",
        "Preserved S4 verification gates",
      ],
      layer: "global",
      ledgerRef: "docs/specs/s4-phase-f-acceptance-trace.md",
      notes: "Frozen Phase F baseline SHA",
    },
    {
      id: "REF-T01-RECOVERY-544",
      lineageRef: "#544",
      scope: "T01 Full Lineage Recovery",
      invariants: ["Clean ancestry reconciliation", "No phantom regressions"],
      layer: "global",
      ledgerRef: "docs/implementation/ui-control-recovery-plan.md",
      notes: "T01 lineage reconciliation into rescue branch",
    },
    {
      id: "REF-T02-GOVERNANCE-545",
      lineageRef: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
      scope: "T02 UI Governance Authority",
      invariants: [
        "Precedence: domain > visual",
        "Contract change requires owner approval",
        "No waiver without removal condition",
      ],
      layer: "global",
      ledgerRef: "docs/implementation/ui-control-recovery-governance.md",
      notes: "T02 UI Governance Authority operating authority",
    },
  ] as const;

/**
 * Canonical Native Exception Registry (TK-11).
 * Documented native HTML controls retained for accessibility, test contracts, or device APIs.
 */
export const NATIVE_EXCEPTION_REGISTRY: readonly NativeException[] = [
  {
    id: "NEX-ATTENDANCE-RADIO-CHOOSER",
    control: "input[type=radio]",
    location: "web/lib/attendance-scanner-ui.tsx",
    reason: "GOV.UK Attendance chooser ATT-02 accessible fieldset contract",
    layer: "route",
    status: "approved",
  },
  {
    id: "NEX-ASSISTED-SCANNER-SELECT",
    control: "select#assisted-event-context",
    location: "web/lib/assisted-scanner-panel.tsx",
    reason: "Assisted scanner event selector with native option list contract",
    layer: "route",
    status: "approved",
  },
  {
    id: "NEX-HOME-CMS-RADIO-AND-DATETIME",
    control: "input[type=radio], input[type=datetime-local]",
    location: "web/app/management/home-cms-editor.tsx",
    reason: "Immediate/scheduled publishing radio and native datetime picker",
    layer: "pattern",
    status: "approved",
  },
  {
    id: "NEX-PROGRAM-EVENT-SELECTS",
    control: "select[name=event_type], select[name=recurrence_tag]",
    location: "web/lib/programs/event-detail.tsx",
    reason:
      "Programs event type and recurrence native selects with option tests",
    layer: "route",
    status: "approved",
  },
  {
    id: "NEX-PROGRAM-MEMBER-HIDDEN-INPUT",
    control: "input[type=hidden]",
    location: "web/lib/programs/member-picker.tsx",
    reason: "Form submit value carrier for selected user id",
    layer: "pattern",
    status: "approved",
  },
  {
    id: "NEX-PROGRAMS-NOTIFICATION-DIALOG",
    control: "dialog#programs-notification-panel",
    location: "web/lib/programs/programs-notifications.tsx",
    reason: "Native HTMLDialogElement for notification popover fallback",
    layer: "pattern",
    status: "approved",
  },
] as const;

/**
 * Returns the full suite of default canonical registries.
 */
export function getCanonicalRegistries(): GovernanceRegistries {
  return {
    scenarios: SCENARIO_REGISTRY,
    contracts: UI_CONTRACT_REGISTRY,
    approvals: APPROVAL_PACKAGE_REGISTRY,
    waivers: WAIVER_REGISTRY,
    preservations: PRESERVATION_REFERENCE_REGISTRY,
    nativeExceptions: NATIVE_EXCEPTION_REGISTRY,
  };
}

const SCENARIOS_BY_ID: Record<string, RouteScenario> = Object.fromEntries(
  SCENARIO_REGISTRY.map((s) => [s.id, s])
);

const CONTRACTS_BY_ID: Record<string, UIContract> = Object.fromEntries(
  UI_CONTRACT_REGISTRY.map((c) => [c.id, c])
);

const APPROVALS_BY_ID: Record<string, ApprovalPackage> = Object.fromEntries(
  APPROVAL_PACKAGE_REGISTRY.map((a) => [a.id, a])
);

const WAIVERS_BY_ID: Record<string, Waiver> = Object.fromEntries(
  WAIVER_REGISTRY.map((w) => [w.id, w])
);

const PRESERVATIONS_BY_ID: Record<string, PreservationReference> =
  Object.fromEntries(PRESERVATION_REFERENCE_REGISTRY.map((p) => [p.id, p]));

const NATIVE_EXCEPTIONS_BY_ID: Record<string, NativeException> =
  Object.fromEntries(NATIVE_EXCEPTION_REGISTRY.map((n) => [n.id, n]));

export function getScenario(id: string): RouteScenario | undefined {
  return SCENARIOS_BY_ID[id];
}

export function getUIContract(id: string): UIContract | undefined {
  return CONTRACTS_BY_ID[id];
}

export function getApprovalPackage(id: string): ApprovalPackage | undefined {
  return APPROVALS_BY_ID[id];
}

export function getWaiver(id: string): Waiver | undefined {
  return WAIVERS_BY_ID[id];
}

export function getPreservationReference(
  id: string
): PreservationReference | undefined {
  return PRESERVATIONS_BY_ID[id];
}

export function getNativeException(id: string): NativeException | undefined {
  return NATIVE_EXCEPTIONS_BY_ID[id];
}
