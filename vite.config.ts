import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode, command }) => {
  const root = path.resolve(__dirname);
  // Evita instalar no telemóvel um bundle sem Supabase (tela branca: "Invalid supabaseUrl").
  if (command === "build") {
    const env = loadEnv(mode, root, "");
    const url = env.VITE_SUPABASE_URL?.trim();
    const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY)?.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new Error(
        "[vite] Sem VITE_SUPABASE_URL válida. Na raiz do projeto, crie/edite .env com:\n" +
          "VITE_SUPABASE_URL=https://SEU_REF.supabase.co\n" +
          "Depois: npm run build && npx cap sync ios",
      );
    }
    if (!key) {
      throw new Error(
        "[vite] Sem chave pública Supabase. No .env defina VITE_SUPABASE_PUBLISHABLE_KEY ou VITE_SUPABASE_ANON_KEY.",
      );
    }
  }

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },

    plugins: [
      react(),
      mode === "development" && componentTagger(),
    ].filter(Boolean),

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
