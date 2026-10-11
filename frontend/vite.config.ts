/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// changeOrigin stays false: Django must see the browser's Host (localhost:5173)
// so its CSRF origin check, and any absolute URL it builds, match this origin.
const django = { target: "http://127.0.0.1:8000", changeOrigin: false };

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": django,
      "/admin": django,
      "/static": django,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
