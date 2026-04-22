import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5180,
    host: "127.0.0.1",
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, "") || "/",
      },
    },
  },
  resolve: {
    alias: {
      "@relay-mvp/sdk": path.resolve(__dirname, "../../packages/sdk/src/index.ts"),
    },
  },
});
