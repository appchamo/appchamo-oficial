import { useMemo, useState } from "react";
import { diagClear, diagEnabled, diagGet, type DiagEntry } from "@/lib/diag";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function fmt(ts: number) {
  try { return new Date(ts).toLocaleTimeString(); } catch { return String(ts); }
}

export default function DiagPanel() {
  const [open, setOpen] = useState(false);
  const enabled = diagEnabled();
  const entries = useMemo(() => (enabled ? diagGet() : []), [enabled, open]);

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-[120] rounded-full bg-black/80 text-white text-xs font-semibold px-3 py-2 shadow-lg"
      >
        DIAG
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Diagnóstico (Chamô)</DialogTitle>
          </DialogHeader>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const payload = JSON.stringify(entries, null, 2);
                navigator.clipboard?.writeText(payload).catch(() => {});
              }}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
            >
              Copiar logs
            </button>
            <button
              type="button"
              onClick={() => {
                diagClear();
                setOpen(false);
                setOpen(true);
              }}
              className="px-3 py-2 rounded-lg border text-sm font-semibold"
            >
              Limpar
            </button>
          </div>

          <div className="mt-4 max-h-[55vh] overflow-auto rounded-lg border bg-muted/30">
            {entries.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Sem logs ainda.</div>
            ) : (
              <ul className="divide-y">
                {entries.slice(-200).reverse().map((e: DiagEntry, idx: number) => (
                  <li key={idx} className="p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-muted-foreground">{fmt(e.ts)}</span>
                      <span className="font-semibold">{e.level.toUpperCase()}</span>
                      <span className="font-semibold">{e.tag}</span>
                    </div>
                    <div className="mt-1">{e.message}</div>
                    {e.data !== undefined && (
                      <pre className="mt-2 text-[11px] whitespace-pre-wrap break-words bg-background rounded p-2 border">
                        {JSON.stringify(e.data, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

