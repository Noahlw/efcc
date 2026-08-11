import react from "@vitejs/plugin-react";
import { defineProject } from "vitest/config";

export default defineProject({
  plugins: [react()],
  resolve: {
    alias: { "@": import.meta.dirname ?? "" },
  },
  test: {
    environment: "jsdom",
    include: [
      "lib/app.test.tsx",
      "lib/sections.test.ts",
      "lib/api.test.ts",
      "lib/navigation-controller.test.ts",
      "lib/registration.test.tsx",
      "lib/approval-queue.test.tsx",
      "lib/section-view.test.tsx",
      "lib/account-settings.test.tsx",
      "lib/qr-code.test.tsx",
      "lib/programs/programs-events-panel.test.tsx",
      "lib/programs/programs-enrollment-panel.test.tsx",
      "lib/programs/programs-leaders-panel.test.tsx",
      "lib/programs/member-picker.test.tsx",
      "lib/programs/programs-boundary.test.tsx",
      "lib/programs/participant-directory.test.tsx",
      "lib/session-deep-link.test.tsx",
      "lib/programs/participant-program-detail.test.tsx",
      "lib/attendance-panel.test.tsx",
      "lib/attendance-operator-panel.test.tsx",
    ],
    setupFiles: ["./lib/test-setup.ts"],
    server: {
      deps: { inline: ["@testing-library/user-event"] },
    },
  },
});
