import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The browser app lives in src/client. The server (src/server) serves the built
// files from dist/client in production; in development Vite serves them and
// proxies /api to the local server on port 3000.
export default defineConfig({
  root: "src/client",
  publicDir: "public",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
    sourcemap: true,
    // Never inline assets as data: URIs; the server's Content-Security-Policy
    // only allows fonts and scripts from this origin.
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
});
