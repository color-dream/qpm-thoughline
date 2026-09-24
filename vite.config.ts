import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// BASE_PATH 允许在构建时注入部署子路径（如 GitHub Pages 项目页 "/<repo>/"）。
// 必须以 / 开头并以 / 结尾；不设置时默认 "/"。
const rawBase = process.env.BASE_PATH?.trim();
const basePath = rawBase && rawBase !== "/" ? rawBase : "/";
if (basePath !== "/" && !/^\/.*\/$/.test(basePath)) {
  throw new Error(`BASE_PATH must look like "/<path>/", got: ${rawBase}`);
}

export default defineConfig({
  base: basePath,
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: "VITE_",
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
  },
});
