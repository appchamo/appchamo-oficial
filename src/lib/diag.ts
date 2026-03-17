export type DiagLevel = "debug" | "info" | "warn" | "error";

export interface DiagEntry {
  ts: number;
  level: DiagLevel;
  tag: string;
  message: string;
  data?: unknown;
}

const KEY = "chamo_diag_logs";
const MAX = 200;

function safeJsonParse<T>(v: string | null): T | null {
  if (!v) return null;
  try { return JSON.parse(v) as T; } catch { return null; }
}

function load(): DiagEntry[] {
  if (typeof window === "undefined") return [];
  return safeJsonParse<DiagEntry[]>(localStorage.getItem(KEY)) || [];
}

function save(entries: DiagEntry[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX))); } catch {}
}

export function diagEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("diag") === "1") return true;
    if (localStorage.getItem("chamo_diag") === "1") return true;
  } catch {}
  return false;
}

export function diagLog(level: DiagLevel, tag: string, message: string, data?: unknown) {
  const entry: DiagEntry = { ts: Date.now(), level, tag, message, ...(data !== undefined ? { data } : {}) };

  // Sempre loga no console (ajuda no Xcode)
  const prefix = `[DIAG][${tag}]`;
  if (level === "error") console.error(prefix, message, data ?? "");
  else if (level === "warn") console.warn(prefix, message, data ?? "");
  else console.log(prefix, message, data ?? "");

  // Só persiste se o modo diagnóstico estiver ligado
  if (!diagEnabled()) return;

  const entries = load();
  entries.push(entry);
  save(entries);

  // Expor para inspeção rápida
  (window as any).__CHAMO_DIAG__ = { entries };
}

export function diagGet(): DiagEntry[] {
  return load();
}

export function diagClear() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(KEY); } catch {}
  try { (window as any).__CHAMO_DIAG__ = { entries: [] }; } catch {}
}

// iOS: fallback extremo quando requisições ficam penduradas pós-OAuth
export function hardReloadOnce(reason: string) {
  if (typeof window === "undefined") return;
  try {
    // Evita loops
    const k = "chamo_hard_reload_on_hang_done";
    if (localStorage.getItem(k) === "1") return;
    // Só faz sentido no WebView nativo
    const ua = navigator.userAgent || "";
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    if (!isIOS) return;

    localStorage.setItem(k, "1");
    diagLog("warn", "hard-reload", "disparando hard reload (hang detectado)", { reason });
    const origin = window.location.origin || "";
    window.location.replace(origin + "/hard-reload?to=%2Fhome");
  } catch (_) {}
}

