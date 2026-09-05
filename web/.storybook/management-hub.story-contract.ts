export const MANAGEMENT_HUB_PRESENTATION = {
  default: {
    psn: "PSN-MGMT-HUB-DEFAULT",
    storyId: "t07-1-management-hub--default",
  },
  loading: {
    psn: "PSN-MGMT-HUB-LOADING",
    storyId: "t07-1-management-hub--loading",
  },
  empty: {
    psn: "PSN-MGMT-HUB-EMPTY",
    storyId: "t07-1-management-hub--empty",
  },
  recoverableError: {
    psn: "PSN-MGMT-HUB-RECOVERABLE-ERROR",
    storyId: "t07-1-management-hub--recoverable-error",
  },
} as const;

export const MANAGEMENT_HUB_PRESENTATION_DECLARATIONS = [
  { ...MANAGEMENT_HUB_PRESENTATION.default, state: "default" },
  { ...MANAGEMENT_HUB_PRESENTATION.loading, state: "loading" },
  { ...MANAGEMENT_HUB_PRESENTATION.empty, state: "empty" },
  {
    ...MANAGEMENT_HUB_PRESENTATION.recoverableError,
    state: "recoverable-error",
  },
] as const;
