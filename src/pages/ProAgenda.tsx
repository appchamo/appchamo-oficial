import AppLayout from "@/components/AppLayout";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { toast } from "@/hooks/use-toast";
import {
  Calendar,
  Loader2,
  Plus,
  Trash2,
  Clock,
  Building2,
  Lock,
  Save,
  User,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import ImageCropUpload from "@/components/ImageCropUpload";

const WEEKDAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
];

type Atendente = { id: string; name: string; photo_url: string | null; description: string | null; active: boolean; sort_order: number };

export default function ProAgenda() {
  const { user } = useAuth();
  const { plan, loading: planLoading } = useSubscription();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [agendaEnabled, setAgendaEnabled] = useState(false);

  const [atendentes, setAtendentes] = useState<Atendente[]>([]);
  const [selectedAtendenteId, setSelectedAtendenteId] = useState<string | null>(null);
  const [atendenteDialogOpen, setAtendenteDialogOpen] = useState(false);
  const [editingAtendente, setEditingAtendente] = useState<Atendente | null>(null);
  const [editAtendenteName, setEditAtendenteName] = useState("");
  const [editAtendenteDesc, setEditAtendenteDesc] = useState("");
  const [editAtendentePhotoUrl, setEditAtendentePhotoUrl] = useState<string | null>(null);

  const [services, setServices] = useState<{ id: string; name: string; duration_minutes: number; active: boolean }[]>([]);
  const [rules, setRules] = useState<{ id: string; weekday: number; start_time: string; end_time: string; slot_interval_minutes: number; capacity: number }[]>([]);
  const [blocks, setBlocks] = useState<{ id: string; block_date: string; start_time: string; end_time: string; reason: string | null }[]>([]);

  const isBusiness = plan?.id === "business";

  useEffect(() => {
    if (!user || planLoading) return;
    if (!isBusiness) {
      setLoading(false);
      return;
    }
    const loadProAndAtendentes = async () => {
      const { data: pro } = await supabase.from("professionals").select("id, agenda_enabled").eq("user_id", user.id).maybeSingle();
      if (!pro) {
        setLoading(false);
        return;
      }
      setProfessionalId(pro.id);
      setAgendaEnabled(!!(pro as any).agenda_enabled);
      try {
        const { data: atList } = await supabase
          .from("agenda_atendentes")
          .select("id, name, photo_url, description, active, sort_order")
          .eq("professional_id", pro.id)
          .order("sort_order", { ascending: true });
        setAtendentes((atList as Atendente[]) || []);
      } catch {
        setAtendentes([]);
      }
      setLoading(false);
    };
    loadProAndAtendentes();
  }, [user, isBusiness, planLoading]);

  const loadConfigForAtendente = useCallback(async (proId: string, atendenteId: string | null) => {
    const baseSvc = supabase.from("agenda_services").select("id, name, duration_minutes, active").eq("professional_id", proId).order("created_at");
    const baseRls = supabase.from("agenda_availability_rules").select("id, weekday, start_time, end_time, slot_interval_minutes, capacity").eq("professional_id", proId);
    const baseBlk = supabase.from("agenda_availability_blocks").select("id, block_date, start_time, end_time, reason").eq("professional_id", proId).gte("block_date", new Date().toISOString().slice(0, 10)).order("block_date");
    let svcQuery = baseSvc;
    let rlsQuery = baseRls;
    let blkQuery = baseBlk;
    if (atendenteId === null) {
      svcQuery = baseSvc.is("atendente_id", null);
      rlsQuery = baseRls.is("atendente_id", null);
      blkQuery = baseBlk.is("atendente_id", null);
    } else {
      svcQuery = baseSvc.eq("atendente_id", atendenteId);
      rlsQuery = baseRls.eq("atendente_id", atendenteId);
      blkQuery = baseBlk.eq("atendente_id", atendenteId);
    }
    const [svcRes, rlsRes, blkRes] = await Promise.all([svcQuery, rlsQuery, blkQuery]);
    if (svcRes.error && svcRes.error.message?.includes("atendente_id")) {
      const [a, b, c] = await Promise.all([baseSvc, baseRls, baseBlk]);
      setServices((a.data as any[]) || []);
      setRules((b.data as any[]) || []);
      setBlocks((c.data as any[]) || []);
      return;
    }
    setServices((svcRes.data as any[]) || []);
    setRules((rlsRes.data as any[]) || []);
    setBlocks((blkRes.data as any[]) || []);
  }, []);

  useEffect(() => {
    if (!professionalId) return;
    loadConfigForAtendente(professionalId, selectedAtendenteId);
  }, [professionalId, selectedAtendenteId, loadConfigForAtendente]);

  const handleToggleAgenda = async (enabled: boolean) => {
    if (!professionalId) {
      toast({
        title: "Perfil profissional não encontrado",
        description: "Complete seu cadastro como profissional para usar a agenda.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("professionals").update({ agenda_enabled: enabled }).eq("id", professionalId);
    if (error) {
      toast({
        title: "Erro ao atualizar agenda",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setAgendaEnabled(enabled);
      toast({ title: enabled ? "Agenda ativada" : "Agenda desativada" });
    }
    setSaving(false);
  };

  const openAtendenteDialog = (at: Atendente | null) => {
    setEditingAtendente(at);
    setEditAtendenteName(at?.name ?? "");
    setEditAtendenteDesc(at?.description ?? "");
    setEditAtendentePhotoUrl(at?.photo_url ?? null);
    setAtendenteDialogOpen(true);
  };
  const saveAtendente = async () => {
    if (!professionalId || !editAtendenteName.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    if (editingAtendente?.id) {
      const { error } = await supabase.from("agenda_atendentes").update({ name: editAtendenteName.trim(), description: editAtendenteDesc.trim() || null, photo_url: editAtendentePhotoUrl }).eq("id", editingAtendente.id);
      if (error) toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      else {
        toast({ title: "Atendente atualizado" });
        const { data: atList } = await supabase.from("agenda_atendentes").select("id, name, photo_url, description, active, sort_order").eq("professional_id", professionalId).order("sort_order", { ascending: true });
        setAtendentes((atList as Atendente[]) || []);
      }
    } else {
      const { data, error } = await supabase.from("agenda_atendentes").insert({ professional_id: professionalId, name: editAtendenteName.trim(), description: editAtendenteDesc.trim() || null, photo_url: editAtendentePhotoUrl }).select("id").single();
      if (error) toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
      else {
        toast({ title: "Atendente criado" });
        const { data: atList } = await supabase.from("agenda_atendentes").select("id, name, photo_url, description, active, sort_order").eq("professional_id", professionalId).order("sort_order", { ascending: true });
        setAtendentes((atList as Atendente[]) || []);
      }
    }
    setSaving(false);
    setAtendenteDialogOpen(false);
  };
  const deleteAtendente = async (id: string) => {
    const { error } = await supabase.from("agenda_atendentes").delete().eq("id", id);
    if (!error) {
      setAtendentes((p) => p.filter((a) => a.id !== id));
      if (selectedAtendenteId === id) setSelectedAtendenteId(null);
      toast({ title: "Atendente removido" });
    } else toast({ title: "Erro ao remover", variant: "destructive" });
  };

  const addService = () => setServices((p) => [...p, { id: "", name: "", duration_minutes: 30, active: true }]);
  const updateService = (idx: number, field: string, value: string | number | boolean) => {
    setServices((p) => p.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };
  const saveService = async (idx: number) => {
    const s = services[idx];
    const name = String(s?.name ?? "").trim();
    const duration = Number(s?.duration_minutes);
    if (!professionalId) {
      toast({ title: "Perfil profissional não encontrado", variant: "destructive" });
      return;
    }
    if (!name || !(duration >= 1 && duration <= 480)) {
      toast({
        title: "Nome e duração obrigatórios",
        description: "Preencha o nome e uma duração entre 1 e 480 minutos.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    if (s.id) {
      const { error } = await supabase.from("agenda_services").update({ name, duration_minutes: duration, active: s.active }).eq("id", s.id);
      if (error) {
        toast({ title: "Erro ao atualizar serviço", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Serviço atualizado" });
      }
    } else {
      const { data, error } = await supabase.from("agenda_services").insert({ professional_id: professionalId, atendente_id: selectedAtendenteId, name, duration_minutes: duration }).select("id").single();
      if (error) {
        toast({ title: "Erro ao criar serviço", description: error.message, variant: "destructive" });
      } else {
        setServices((p) => p.map((svc, i) => (i === idx ? { ...svc, id: (data as any).id } : svc)));
        toast({ title: "Serviço criado" });
      }
    }
    setSaving(false);
  };
  const deleteService = async (id: string, idx: number) => {
    if (!id) {
      setServices((p) => p.filter((_, i) => i !== idx));
      return;
    }
    const { error } = await supabase.from("agenda_services").delete().eq("id", id);
    if (!error) setServices((p) => p.filter((s) => s.id !== id));
  };

  const addRule = () => setRules((p) => [...p, { id: "", weekday: 1, start_time: "09:00", end_time: "18:00", slot_interval_minutes: 30, capacity: 1 }]);
  const updateRule = (idx: number, field: string, value: string | number) => {
    setRules((p) => p.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };
  const saveRule = async (idx: number) => {
    const r = rules[idx];
    if (!professionalId) return;
    setSaving(true);
    const payload = { professional_id: professionalId, atendente_id: selectedAtendenteId, weekday: r.weekday, start_time: r.start_time, end_time: r.end_time, slot_interval_minutes: r.slot_interval_minutes, capacity: r.capacity };
    if (r.id) {
      const { error } = await supabase.from("agenda_availability_rules").update(payload).eq("id", r.id);
      if (error) toast({ title: "Erro ao atualizar regra", variant: "destructive" });
      else toast({ title: "Regra atualizada" });
    } else {
      const { data, error } = await supabase.from("agenda_availability_rules").insert(payload).select("id").single();
      if (error) toast({ title: "Erro ao criar regra", variant: "destructive" });
      else {
        setRules((p) => p.map((r, i) => (i === idx ? { ...r, id: (data as any).id } : r)));
        toast({ title: "Regra criada" });
      }
    }
    setSaving(false);
  };
  const deleteRule = async (id: string, idx: number) => {
    if (id) await supabase.from("agenda_availability_rules").delete().eq("id", id);
    setRules((p) => p.filter((_, i) => i !== idx));
  };

  const addBlock = () => setBlocks((p) => [...p, { id: "", block_date: new Date().toISOString().slice(0, 10), start_time: "09:00", end_time: "12:00", reason: null }]);
  const updateBlock = (idx: number, field: string, value: string | null) => {
    setBlocks((p) => p.map((b, i) => (i === idx ? { ...b, [field]: value } : b)));
  };
  const saveBlock = async (idx: number) => {
    const b = blocks[idx];
    if (!professionalId) return;
    setSaving(true);
    const payload = { professional_id: professionalId, atendente_id: selectedAtendenteId, block_date: b.block_date, start_time: b.start_time, end_time: b.end_time, reason: b.reason || null };
    if (b.id) {
      const { error } = await supabase.from("agenda_availability_blocks").update(payload).eq("id", b.id);
      if (error) toast({ title: "Erro ao atualizar bloqueio", variant: "destructive" });
      else toast({ title: "Bloqueio atualizado" });
    } else {
      const { data, error } = await supabase.from("agenda_availability_blocks").insert(payload).select("id").single();
      if (error) toast({ title: "Erro ao criar bloqueio", variant: "destructive" });
      else {
        setBlocks((p) => p.map((b, i) => (i === idx ? { ...b, id: (data as any).id } : b)));
        toast({ title: "Bloqueio criado" });
      }
    }
    setSaving(false);
  };
  const deleteBlock = async (id: string, idx: number) => {
    if (id) await supabase.from("agenda_availability_blocks").delete().eq("id", id);
    setBlocks((p) => p.filter((_, i) => i !== idx));
  };

  if (planLoading || loading) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!isBusiness) {
    return (
      <AppLayout>
        <main className="max-w-screen-lg mx-auto px-4 py-8">
          <div className="bg-card border rounded-2xl p-6 text-center">
            <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-foreground mb-2">Agenda exclusiva do plano Business</h2>
            <p className="text-sm text-muted-foreground mb-4">Ative a agenda para seus clientes agendarem serviços. Disponível apenas no plano Empresarial.</p>
            <Link to="/subscriptions">
              <Button className="rounded-xl">Ver planos</Button>
            </Link>
          </div>
        </main>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Agenda
          </h1>
          <div className="flex items-center gap-2">
            <Label htmlFor="agenda-toggle" className="text-sm font-medium">Ativar agenda</Label>
            <Switch
              id="agenda-toggle"
              checked={agendaEnabled}
              onCheckedChange={handleToggleAgenda}
              disabled={saving}
            />
          </div>
        </div>

        {!agendaEnabled && (
          <p className="text-sm text-muted-foreground mb-6">Ative a agenda para que clientes possam agendar horários no seu perfil.</p>
        )}

        {/* Atendentes / Especialistas */}
        <section className="bg-card border rounded-2xl p-4 mb-6">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
            <User className="w-4 h-4" />
            Atendentes / Especialistas
          </h2>
          <p className="text-xs text-muted-foreground mb-3">Adicione os profissionais que atendem (ex.: barbeiros, médicos). Serviços e horários são configurados por atendente.</p>
          <div className="flex flex-wrap gap-3 mb-3">
            {atendentes.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border bg-muted/20 w-full max-w-xs">
                {a.photo_url ? (
                  <img src={a.photo_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center"><User className="w-6 h-6 text-primary" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{a.name}</p>
                  {a.description && <p className="text-xs text-muted-foreground line-clamp-2">{a.description}</p>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setSelectedAtendenteId(a.id)}>Configurar</Button>
                  <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => openAtendenteDialog(a)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive rounded-lg" onClick={() => deleteAtendente(a.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => openAtendenteDialog(null)} className="rounded-xl gap-1"><Plus className="w-4 h-4" /> Adicionar atendente</Button>
        </section>

        <div className="mb-4">
          <Label className="text-xs text-muted-foreground block mb-2">Configurar serviços e horários para:</Label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={selectedAtendenteId === null ? "default" : "outline"} size="sm" className="rounded-lg" onClick={() => setSelectedAtendenteId(null)}>
              Atendimento geral
            </Button>
            {atendentes.map((a) => (
              <Button type="button" key={a.id} variant={selectedAtendenteId === a.id ? "default" : "outline"} size="sm" className="rounded-lg" onClick={() => setSelectedAtendenteId(a.id)}>
                {a.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Serviços */}
        <section className="bg-card border rounded-2xl p-4 mb-6">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4" />
            Serviços (duração)
          </h2>
          {services.map((s, idx) => (
            <div key={s.id || idx} className="flex flex-wrap items-end gap-2 mb-3 p-3 rounded-xl bg-muted/30">
              <div className="flex-1 min-w-[120px]">
                <Label className="text-xs">Nome</Label>
                <Input value={s.name} onChange={(e) => updateService(idx, "name", e.target.value)} placeholder="Ex: Consulta" className="rounded-lg mt-0.5" />
              </div>
              <div className="w-24">
                <Label className="text-xs">Min</Label>
                <Input type="number" min={5} max={480} value={s.duration_minutes} onChange={(e) => updateService(idx, "duration_minutes", parseInt(e.target.value, 10) || 30)} className="rounded-lg mt-0.5" />
              </div>
              <Button size="sm" variant="outline" onClick={() => saveService(idx)} disabled={saving} className="rounded-lg">Salvar</Button>
              <Button size="sm" variant="ghost" className="text-destructive rounded-lg" onClick={() => deleteService(s.id, idx)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addService} className="rounded-xl gap-1"><Plus className="w-4 h-4" /> Adicionar serviço</Button>
        </section>

        {/* Horários semanais */}
        <section className="bg-card border rounded-2xl p-4 mb-6">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">Dias e horários de funcionamento</h2>
          {rules.map((r, idx) => (
            <div key={r.id || idx} className="flex flex-wrap items-end gap-2 mb-3 p-3 rounded-xl bg-muted/30">
              <div className="w-32">
                <Label className="text-xs">Dia</Label>
                <select value={r.weekday} onChange={(e) => updateRule(idx, "weekday", parseInt(e.target.value, 10))} className="w-full border rounded-lg h-9 px-2 text-sm mt-0.5 bg-background">
                  {WEEKDAYS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div className="w-24">
                <Label className="text-xs">Início</Label>
                <Input type="time" value={r.start_time} onChange={(e) => updateRule(idx, "start_time", e.target.value)} className="rounded-lg mt-0.5" />
              </div>
              <div className="w-24">
                <Label className="text-xs">Fim</Label>
                <Input type="time" value={r.end_time} onChange={(e) => updateRule(idx, "end_time", e.target.value)} className="rounded-lg mt-0.5" />
              </div>
              <div className="w-20">
                <Label className="text-xs">Intervalo</Label>
                <Input type="number" min={15} max={120} value={r.slot_interval_minutes} onChange={(e) => updateRule(idx, "slot_interval_minutes", parseInt(e.target.value, 10) || 30)} className="rounded-lg mt-0.5" />
              </div>
              <div className="w-16">
                <Label className="text-xs">Cap.</Label>
                <Input type="number" min={1} max={50} value={r.capacity} onChange={(e) => updateRule(idx, "capacity", parseInt(e.target.value, 10) || 1)} className="rounded-lg mt-0.5" />
              </div>
              <Button size="sm" variant="outline" onClick={() => saveRule(idx)} disabled={saving} className="rounded-lg"><Save className="w-3 h-3" /></Button>
              <Button size="sm" variant="ghost" className="text-destructive rounded-lg" onClick={() => deleteRule(r.id, idx)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addRule} className="rounded-xl gap-1"><Plus className="w-4 h-4" /> Adicionar horário</Button>
        </section>

        {/* Bloqueios */}
        <section className="bg-card border rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
            <Lock className="w-4 h-4" />
            Bloqueios (datas/horários indisponíveis)
          </h2>
          {blocks.map((b, idx) => (
            <div key={b.id || idx} className="flex flex-wrap items-end gap-2 mb-3 p-3 rounded-xl bg-muted/30">
              <div className="w-36">
                <Label className="text-xs">Data</Label>
                <Input type="date" value={b.block_date} onChange={(e) => updateBlock(idx, "block_date", e.target.value)} className="rounded-lg mt-0.5" />
              </div>
              <div className="w-24">
                <Label className="text-xs">Início</Label>
                <Input type="time" value={b.start_time} onChange={(e) => updateBlock(idx, "start_time", e.target.value)} className="rounded-lg mt-0.5" />
              </div>
              <div className="w-24">
                <Label className="text-xs">Fim</Label>
                <Input type="time" value={b.end_time} onChange={(e) => updateBlock(idx, "end_time", e.target.value)} className="rounded-lg mt-0.5" />
              </div>
              <div className="flex-1 min-w-[120px]">
                <Label className="text-xs">Motivo (opcional)</Label>
                <Input value={b.reason || ""} onChange={(e) => updateBlock(idx, "reason", e.target.value || null)} placeholder="Ex: Reunião" className="rounded-lg mt-0.5" />
              </div>
              <Button size="sm" variant="outline" onClick={() => saveBlock(idx)} disabled={saving} className="rounded-lg"><Save className="w-3 h-3" /></Button>
              <Button size="sm" variant="ghost" className="text-destructive rounded-lg" onClick={() => deleteBlock(b.id, idx)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addBlock} className="rounded-xl gap-1"><Plus className="w-4 h-4" /> Adicionar bloqueio</Button>
        </section>

        <Dialog open={atendenteDialogOpen} onOpenChange={setAtendenteDialogOpen}>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>{editingAtendente ? "Editar atendente" : "Novo atendente"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div>
                <Label className="text-xs">Foto (opcional)</Label>
                <div className="mt-1">
                  <ImageCropUpload
                    aspect={1}
                    shape="round"
                    bucketPath="avatars"
                    currentImage={editAtendentePhotoUrl}
                    label=""
                    onUpload={(url) => setEditAtendentePhotoUrl(url)}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Nome *</Label>
                <Input value={editAtendenteName} onChange={(e) => setEditAtendenteName(e.target.value)} placeholder="Ex: João Silva" className="rounded-lg mt-0.5" />
              </div>
              <div>
                <Label className="text-xs">Descrição (opcional)</Label>
                <Textarea value={editAtendenteDesc} onChange={(e) => setEditAtendenteDesc(e.target.value)} placeholder="Ex: Barbeiro, 5 anos de experiência" className="rounded-lg mt-0.5" rows={2} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setAtendenteDialogOpen(false)} className="rounded-xl">Cancelar</Button>
                <Button onClick={saveAtendente} disabled={saving} className="rounded-xl">{editingAtendente ? "Salvar" : "Criar"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </AppLayout>
  );
}
