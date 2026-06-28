import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: false
  },
  preview: {
    port: 4174,
    strictPort: false
  },
  build: {
    outDir: "dist",
    sourcemap: false
  },
  test: {
    environment: "jsdom",
    globals: true,
    css: true
  }
});
