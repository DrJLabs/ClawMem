import { defineConfig } from "vite";

export default defineConfig({
  base: "/console/",
  server: {
    port: 4173,
    proxy: {
      "/admin": "http://127.0.0.1:7438",
      "/health": "http://127.0.0.1:7438",
    },
  },
  build: {
    outDir: "dist",
  },
});
