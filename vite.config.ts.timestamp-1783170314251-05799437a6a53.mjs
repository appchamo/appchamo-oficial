// vite.config.ts
import { defineConfig, loadEnv } from "file:///sessions/great-kind-keller/mnt/appchamo-oficial/node_modules/vite/dist/node/index.js";
import react from "file:///sessions/great-kind-keller/mnt/appchamo-oficial/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { componentTagger } from "file:///sessions/great-kind-keller/mnt/appchamo-oficial/node_modules/lovable-tagger/dist/index.js";
var __vite_injected_original_dirname = "/sessions/great-kind-keller/mnt/appchamo-oficial";
function copyFfmpegCoreToPublic(root) {
  try {
    execSync("node scripts/copy-ffmpeg-core.mjs", { cwd: root, stdio: "inherit" });
  } catch {
  }
}
function assertFfmpegCorePresent(root) {
  const wasm = path.join(root, "public", "ffmpeg", "ffmpeg-core.wasm");
  if (!fs.existsSync(wasm)) {
    throw new Error(
      "[vite] Falta public/ffmpeg/ffmpeg-core.wasm. Executa: node scripts/copy-ffmpeg-core.mjs (ou npm install)."
    );
  }
}
var vite_config_default = defineConfig(({ mode, command }) => {
  const root = path.resolve(__vite_injected_original_dirname);
  if (command === "build") {
    const env = loadEnv(mode, root, "");
    const url = env.VITE_SUPABASE_URL?.trim();
    const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY)?.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new Error(
        "[vite] Sem VITE_SUPABASE_URL v\xE1lida. Na raiz do projeto, crie/edite .env com:\nVITE_SUPABASE_URL=https://SEU_REF.supabase.co\nDepois: npm run build && npx cap sync ios"
      );
    }
    if (!key) {
      throw new Error(
        "[vite] Sem chave p\xFAblica Supabase. No .env defina VITE_SUPABASE_PUBLISHABLE_KEY ou VITE_SUPABASE_ANON_KEY."
      );
    }
  }
  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false
      }
    },
    plugins: [
      {
        name: "copy-ffmpeg-core",
        configureServer() {
          copyFfmpegCoreToPublic(root);
        },
        buildStart() {
          copyFfmpegCoreToPublic(root);
          assertFfmpegCorePresent(root);
        }
      },
      react(),
      mode === "development" && componentTagger()
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__vite_injected_original_dirname, "./src")
      }
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvZ3JlYXQta2luZC1rZWxsZXIvbW50L2FwcGNoYW1vLW9maWNpYWxcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9zZXNzaW9ucy9ncmVhdC1raW5kLWtlbGxlci9tbnQvYXBwY2hhbW8tb2ZpY2lhbC92aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vc2Vzc2lvbnMvZ3JlYXQta2luZC1rZWxsZXIvbW50L2FwcGNoYW1vLW9maWNpYWwvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcsIGxvYWRFbnYgfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdC1zd2NcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgZnMgZnJvbSBcImZzXCI7XG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gXCJjaGlsZF9wcm9jZXNzXCI7XG5pbXBvcnQgeyBjb21wb25lbnRUYWdnZXIgfSBmcm9tIFwibG92YWJsZS10YWdnZXJcIjtcblxuZnVuY3Rpb24gY29weUZmbXBlZ0NvcmVUb1B1YmxpYyhyb290OiBzdHJpbmcpIHtcbiAgdHJ5IHtcbiAgICBleGVjU3luYyhcIm5vZGUgc2NyaXB0cy9jb3B5LWZmbXBlZy1jb3JlLm1qc1wiLCB7IGN3ZDogcm9vdCwgc3RkaW86IFwiaW5oZXJpdFwiIH0pO1xuICB9IGNhdGNoIHtcbiAgICAvKiBwb3N0aW5zdGFsbCBqXHUwMEUxIGRldmUgdGVyIGNvcGlhZG87IGJ1aWxkIGZhbGhhIHNcdTAwRjMgc2UgZmljaGVpcm9zIGVtIGZhbHRhICovXG4gIH1cbn1cblxuZnVuY3Rpb24gYXNzZXJ0RmZtcGVnQ29yZVByZXNlbnQocm9vdDogc3RyaW5nKSB7XG4gIGNvbnN0IHdhc20gPSBwYXRoLmpvaW4ocm9vdCwgXCJwdWJsaWNcIiwgXCJmZm1wZWdcIiwgXCJmZm1wZWctY29yZS53YXNtXCIpO1xuICBpZiAoIWZzLmV4aXN0c1N5bmMod2FzbSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBcIlt2aXRlXSBGYWx0YSBwdWJsaWMvZmZtcGVnL2ZmbXBlZy1jb3JlLndhc20uIEV4ZWN1dGE6IG5vZGUgc2NyaXB0cy9jb3B5LWZmbXBlZy1jb3JlLm1qcyAob3UgbnBtIGluc3RhbGwpLlwiLFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUsIGNvbW1hbmQgfSkgPT4ge1xuICBjb25zdCByb290ID0gcGF0aC5yZXNvbHZlKF9fZGlybmFtZSk7XG4gIC8vIEV2aXRhIGluc3RhbGFyIG5vIHRlbGVtXHUwMEYzdmVsIHVtIGJ1bmRsZSBzZW0gU3VwYWJhc2UgKHRlbGEgYnJhbmNhOiBcIkludmFsaWQgc3VwYWJhc2VVcmxcIikuXG4gIGlmIChjb21tYW5kID09PSBcImJ1aWxkXCIpIHtcbiAgICBjb25zdCBlbnYgPSBsb2FkRW52KG1vZGUsIHJvb3QsIFwiXCIpO1xuICAgIGNvbnN0IHVybCA9IGVudi5WSVRFX1NVUEFCQVNFX1VSTD8udHJpbSgpO1xuICAgIGNvbnN0IGtleSA9IChlbnYuVklURV9TVVBBQkFTRV9QVUJMSVNIQUJMRV9LRVkgfHwgZW52LlZJVEVfU1VQQUJBU0VfQU5PTl9LRVkpPy50cmltKCk7XG4gICAgaWYgKCF1cmwgfHwgIS9eaHR0cHM/OlxcL1xcLy9pLnRlc3QodXJsKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBcIlt2aXRlXSBTZW0gVklURV9TVVBBQkFTRV9VUkwgdlx1MDBFMWxpZGEuIE5hIHJhaXogZG8gcHJvamV0bywgY3JpZS9lZGl0ZSAuZW52IGNvbTpcXG5cIiArXG4gICAgICAgICAgXCJWSVRFX1NVUEFCQVNFX1VSTD1odHRwczovL1NFVV9SRUYuc3VwYWJhc2UuY29cXG5cIiArXG4gICAgICAgICAgXCJEZXBvaXM6IG5wbSBydW4gYnVpbGQgJiYgbnB4IGNhcCBzeW5jIGlvc1wiLFxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKCFrZXkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgXCJbdml0ZV0gU2VtIGNoYXZlIHBcdTAwRkFibGljYSBTdXBhYmFzZS4gTm8gLmVudiBkZWZpbmEgVklURV9TVVBBQkFTRV9QVUJMSVNIQUJMRV9LRVkgb3UgVklURV9TVVBBQkFTRV9BTk9OX0tFWS5cIixcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzZXJ2ZXI6IHtcbiAgICAgIGhvc3Q6IFwiOjpcIixcbiAgICAgIHBvcnQ6IDgwODAsXG4gICAgICBobXI6IHtcbiAgICAgICAgb3ZlcmxheTogZmFsc2UsXG4gICAgICB9LFxuICAgIH0sXG5cbiAgICBwbHVnaW5zOiBbXG4gICAgICB7XG4gICAgICAgIG5hbWU6IFwiY29weS1mZm1wZWctY29yZVwiLFxuICAgICAgICBjb25maWd1cmVTZXJ2ZXIoKSB7XG4gICAgICAgICAgY29weUZmbXBlZ0NvcmVUb1B1YmxpYyhyb290KTtcbiAgICAgICAgfSxcbiAgICAgICAgYnVpbGRTdGFydCgpIHtcbiAgICAgICAgICBjb3B5RmZtcGVnQ29yZVRvUHVibGljKHJvb3QpO1xuICAgICAgICAgIGFzc2VydEZmbXBlZ0NvcmVQcmVzZW50KHJvb3QpO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHJlYWN0KCksXG4gICAgICBtb2RlID09PSBcImRldmVsb3BtZW50XCIgJiYgY29tcG9uZW50VGFnZ2VyKCksXG4gICAgXS5maWx0ZXIoQm9vbGVhbiksXG5cbiAgICByZXNvbHZlOiB7XG4gICAgICBhbGlhczoge1xuICAgICAgICBcIkBcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuL3NyY1wiKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFrVSxTQUFTLGNBQWMsZUFBZTtBQUN4VyxPQUFPLFdBQVc7QUFDbEIsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sUUFBUTtBQUNmLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBTGhDLElBQU0sbUNBQW1DO0FBT3pDLFNBQVMsdUJBQXVCLE1BQWM7QUFDNUMsTUFBSTtBQUNGLGFBQVMscUNBQXFDLEVBQUUsS0FBSyxNQUFNLE9BQU8sVUFBVSxDQUFDO0FBQUEsRUFDL0UsUUFBUTtBQUFBLEVBRVI7QUFDRjtBQUVBLFNBQVMsd0JBQXdCLE1BQWM7QUFDN0MsUUFBTSxPQUFPLEtBQUssS0FBSyxNQUFNLFVBQVUsVUFBVSxrQkFBa0I7QUFDbkUsTUFBSSxDQUFDLEdBQUcsV0FBVyxJQUFJLEdBQUc7QUFDeEIsVUFBTSxJQUFJO0FBQUEsTUFDUjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLE1BQU0sUUFBUSxNQUFNO0FBQ2pELFFBQU0sT0FBTyxLQUFLLFFBQVEsZ0NBQVM7QUFFbkMsTUFBSSxZQUFZLFNBQVM7QUFDdkIsVUFBTSxNQUFNLFFBQVEsTUFBTSxNQUFNLEVBQUU7QUFDbEMsVUFBTSxNQUFNLElBQUksbUJBQW1CLEtBQUs7QUFDeEMsVUFBTSxPQUFPLElBQUksaUNBQWlDLElBQUkseUJBQXlCLEtBQUs7QUFDcEYsUUFBSSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsS0FBSyxHQUFHLEdBQUc7QUFDdEMsWUFBTSxJQUFJO0FBQUEsUUFDUjtBQUFBLE1BR0Y7QUFBQSxJQUNGO0FBQ0EsUUFBSSxDQUFDLEtBQUs7QUFDUixZQUFNLElBQUk7QUFBQSxRQUNSO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBRUEsU0FBTztBQUFBLElBQ0wsUUFBUTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sS0FBSztBQUFBLFFBQ0gsU0FBUztBQUFBLE1BQ1g7QUFBQSxJQUNGO0FBQUEsSUFFQSxTQUFTO0FBQUEsTUFDUDtBQUFBLFFBQ0UsTUFBTTtBQUFBLFFBQ04sa0JBQWtCO0FBQ2hCLGlDQUF1QixJQUFJO0FBQUEsUUFDN0I7QUFBQSxRQUNBLGFBQWE7QUFDWCxpQ0FBdUIsSUFBSTtBQUMzQixrQ0FBd0IsSUFBSTtBQUFBLFFBQzlCO0FBQUEsTUFDRjtBQUFBLE1BQ0EsTUFBTTtBQUFBLE1BQ04sU0FBUyxpQkFBaUIsZ0JBQWdCO0FBQUEsSUFDNUMsRUFBRSxPQUFPLE9BQU87QUFBQSxJQUVoQixTQUFTO0FBQUEsTUFDUCxPQUFPO0FBQUEsUUFDTCxLQUFLLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsTUFDdEM7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
