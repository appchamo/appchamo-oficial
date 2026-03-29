/**
 * Edge Functions que devolvem 4xx com JSON `{ error: "..." }` fazem o supabase-js
 * retornar `data: null` e `error` como FunctionsHttpError — a mensagem útil fica no body da Response.
 */
export async function readEdgeFunctionInvokeError(data: unknown, error: unknown): Promise<string | null> {
  if (data && typeof data === "object" && data !== null) {
    const d = data as Record<string, unknown>;
    if (typeof d.error === "string" && d.error) return d.error;
    if (typeof d.msg === "string" && d.msg) return d.msg;
    if (typeof d.message === "string" && d.message) return d.message;
  }

  const ctx =
    error && typeof error === "object" && error !== null && "context" in error
      ? (error as { context?: unknown }).context
      : undefined;

  if (ctx instanceof Response) {
    try {
      const ct = (ctx.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("application/json")) {
        const j = await ctx.clone().json();
        if (j && typeof j === "object") {
          const o = j as Record<string, unknown>;
          if (typeof o.error === "string" && o.error) return o.error;
          if (typeof o.msg === "string" && o.msg) return o.msg;
          if (typeof o.message === "string" && o.message) return o.message;
        }
      } else {
        const text = (await ctx.clone().text()).trim();
        if (text && text.length < 800) return text;
      }
    } catch {
      /* ignore */
    }
  }

  if (error instanceof Error && error.message) return error.message;
  return null;
}
