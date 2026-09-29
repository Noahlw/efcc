import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "spa",
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:8799" } },
  build: { outDir: "../dist/spa", emptyOutDir: true },
});
