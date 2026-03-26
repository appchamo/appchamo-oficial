import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { translateError } from "@/lib/errorMessages";
import { ProfessionalSealIcon, SEAL_ICON_VARIANTS } from "@/components/seals/ProfessionalSealIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";

export type SealDefinitionRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon_variant: string;
  requirement_kind: string;
  config: Record<string, unknown>;
  is_special: boolean;
  sort_order: number;
  is_active: boolean;
  award_notification_title?: string | null;
  award_notification_message?: string | null;
  push_image_url?: string | null;
};

export function AdminProsSealsPanel() {
  const [rows, setRows] = useState<SealDefinitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<SealDefinitionRow>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("professional_seal_definitions" as any)
      .select(
        "id, slug, title, description, icon_variant, requirement_kind, config, is_special, sort_order, is_active, award_notification_title, award_notification_message, push_image_url"
      )
      .order("sort_order", { ascending: true });
    if (error) {
      toast({ title: "Erro ao carregar selos", description: translateError(error), variant: "destructive" });
      setRows([]);
    } else {
      const list = (data || []) as SealDefinitionRow[];
      setRows(list);
      const d: Record<string, Partial<SealDefinitionRow>> = {};
      for (const r of list) {
        d[r.id] = {
          title: r.title,
          description: r.description,
          icon_variant: r.icon_variant,
          sort_order: r.sort_order,
          is_active: r.is_active,
          award_notification_title: r.award_notification_title ?? "",
          award_notification_message: r.award_notification_message ?? "",
          push_image_url: r.push_image_url ?? "",
        };
      }
      setDrafts(d);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateDraft = (id: string, patch: Partial<(typeof drafts)[string]>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const saveRow = async (row: SealDefinitionRow) => {
    const d = drafts[row.id];
    if (!d) return;
    const latest = rows.find((r) => r.id === row.id) ?? row;
    setSavingId(row.id);
    const { error } = await supabase
      .from("professional_seal_definitions" as any)
      .update({
        title: d.title ?? row.title,
        description: d.description ?? row.description,
        icon_variant: d.icon_variant ?? row.icon_variant,
        sort_order: Number(d.sort_order ?? row.sort_order),
        is_active: d.is_active ?? row.is_active,
        config: latest.config,
        award_notification_title: (d.award_notification_title ?? "").trim() || null,
        award_notification_message: (d.award_notification_message ?? "").trim() || null,
        push_image_url: (d.push_image_url ?? "").trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    setSavingId(null);
    if (error) {
      toast({ title: "Erro ao salvar", description: translateError(error), variant: "destructive" });
      return;
    }
    toast({ title: "Selo salvo" });
    await load();
  };

  const runEvaluate = async () => {
    setEvaluating(true);
    const { data, error } = await supabase.rpc("admin_evaluate_professional_seals" as any);
    setEvaluating(false);
    if (error) {
      toast({ title: "Erro ao avaliar selos", description: translateError(error), variant: "destructive" });
      return;
    }
    const payload = data as { ok?: boolean; awards_inserted?: number; error?: string } | null;
    if (payload?.ok === false) {
      toast({
        title: "Não autorizado",
        description: payload.error === "forbidden" ? "Apenas administradores." : String(payload.error),
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Selos atualizados",
      description: `Novas conquistas registradas: ${payload?.awards_inserted ?? 0}.`,
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <div>
          <p className="font-semibold text-foreground">Configuração dos selos</p>
          <p className="text-sm text-muted-foreground mt-1">
            Título, texto de requisitos e aparência. Os limiares numéricos (chamadas, valores, dias) ficam no banco de dados —
            avise o time de desenvolvimento se precisar alterá-los.
          </p>
        </div>
        <Button type="button" variant="default" disabled={evaluating} onClick={runEvaluate} className="shrink-0 gap-2">
          {evaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Recalcular selos agora
        </Button>
      </div>

      <div className="space-y-4">
        {rows.map((row) => {
          const d = drafts[row.id] || {};
          const variant = (d.icon_variant ?? row.icon_variant) as string;
          return (
            <div
              key={row.id}
              className={`rounded-xl border bg-card p-4 flex flex-col lg:flex-row gap-4 ${
                row.is_special ? "ring-2 ring-amber-400/40 shadow-[0_0_20px_rgba(251,191,36,0.12)]" : ""
              }`}
            >
              <div className="flex items-start gap-3 shrink-0">
                <ProfessionalSealIcon variant={variant} size={56} earned />
                <div className="min-w-0">
                  <p className="text-xs font-mono text-muted-foreground truncate max-w-[14rem]">{row.slug}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {row.requirement_kind}
                    </Badge>
                    {row.is_special && (
                      <Badge className="text-[10px] bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-400/30">
                        Especial
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 grid gap-3 sm:grid-cols-2 min-w-0">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Título</Label>
                  <Input
                    value={d.title ?? row.title}
                    onChange={(e) => updateDraft(row.id, { title: e.target.value })}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Requisitos (texto para o profissional)</Label>
                  <Textarea
                    value={d.description ?? row.description}
                    onChange={(e) => updateDraft(row.id, { description: e.target.value })}
                    rows={3}
                    className="text-sm resize-y min-h-[72px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Ícone do selo</Label>
                  <select
                    value={variant}
                    onChange={(e) => updateDraft(row.id, { icon_variant: e.target.value })}
                    className="w-full border rounded-md h-9 px-2 text-sm bg-background"
                  >
                    {SEAL_ICON_VARIANTS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Ordem</Label>
                  <Input
                    type="number"
                    value={d.sort_order ?? row.sort_order}
                    onChange={(e) => updateDraft(row.id, { sort_order: Number(e.target.value) })}
                    className="h-9"
                  />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <input
                    type="checkbox"
                    id={`active-${row.id}`}
                    checked={d.is_active ?? row.is_active}
                    onChange={(e) => updateDraft(row.id, { is_active: e.target.checked })}
                    className="rounded border-input"
                  />
                  <Label htmlFor={`active-${row.id}`} className="text-sm font-normal cursor-pointer">
                    Selo ativo (participa da avaliação)
                  </Label>
                </div>

                <div className="sm:col-span-2 rounded-lg border bg-muted/20 p-3 space-y-3">
                  <p className="text-xs font-semibold text-foreground">Notificação e push ao conquistar</p>
                  <p className="text-[11px] text-muted-foreground">
                    Título e texto únicos por selo. URL da imagem deve ser HTTPS pública (PNG/JPG) para aparecer no push FCM.
                  </p>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Título da notificação</Label>
                    <Input
                      value={d.award_notification_title ?? row.award_notification_title ?? ""}
                      onChange={(e) => updateDraft(row.id, { award_notification_title: e.target.value })}
                      placeholder="Ex.: Parabéns! Novo selo no Chamô"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Mensagem</Label>
                    <Textarea
                      value={d.award_notification_message ?? row.award_notification_message ?? ""}
                      onChange={(e) => updateDraft(row.id, { award_notification_message: e.target.value })}
                      placeholder="Frase de celebração específica deste selo…"
                      rows={2}
                      className="text-sm resize-y min-h-[52px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">URL da imagem (push)</Label>
                    <Input
                      value={d.push_image_url ?? row.push_image_url ?? ""}
                      onChange={(e) => updateDraft(row.id, { push_image_url: e.target.value })}
                      placeholder="https://… ou /seals/push/seal_vip.png (PUBLIC_APP_URL na edge)"
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="flex lg:flex-col justify-end gap-2 shrink-0">
                <Button type="button" size="sm" onClick={() => saveRow(row)} disabled={savingId === row.id}>
                  {savingId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Salvar
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
