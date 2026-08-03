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
    ],
    setupFiles: ["./lib/test-setup.ts"],
    server: {
      deps: { inline: ["@testing-library/user-event"] },
    },
  },
});
