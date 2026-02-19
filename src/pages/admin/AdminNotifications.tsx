import AdminLayout from "@/components/AdminLayout";
import { Bell, Send, Users, Briefcase, Building2, User } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type TargetType = "all" | "clients" | "professionals" | "companies" | "category" | "individual";

const AdminNotifications = () => {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<TargetType>("all");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);

  // Individual user search
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<{ user_id: string; full_name: string; email: string }[]>([]);
  const [selectedUser, setSelectedUser] = useState<{ user_id: string; full_name: string } | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    supabase.from("categories").select("id, name").eq("active", true).order("name").then(({ data }) => {
      setCategories(data || []);
    });
  }, []);

  const searchUsers = async (query: string) => {
    setUserSearch(query);
    if (query.length < 2) { setUserResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(10);
    setUserResults(data || []);
    setSearching(false);
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast({ title: "Preencha título e mensagem", variant: "destructive" });
      return;
    }
    if (target === "category" && !categoryId) {
      toast({ title: "Selecione uma categoria", variant: "destructive" });
      return;
    }
    if (target === "individual" && !selectedUser) {
      toast({ title: "Selecione um usuário", variant: "destructive" });
      return;
    }

    setSending(true);
    setSentCount(null);

    try {
      let userIds: string[] = [];

      if (target === "individual" && selectedUser) {
        userIds = [selectedUser.user_id];
      } else if (target === "all") {
        const { data } = await supabase.from("profiles").select("user_id");
        userIds = (data || []).map(p => p.user_id);
      } else if (target === "clients") {
        const { data } = await supabase.from("profiles").select("user_id").eq("user_type", "client");
        userIds = (data || []).map(p => p.user_id);
      } else if (target === "professionals") {
        const { data } = await supabase.from("profiles").select("user_id").eq("user_type", "professional");
        userIds = (data || []).map(p => p.user_id);
      } else if (target === "companies") {
        const { data } = await supabase.from("profiles").select("user_id").eq("user_type", "company");
        userIds = (data || []).map(p => p.user_id);
      } else if (target === "category") {
        const { data: pros } = await supabase.from("professionals").select("user_id").eq("category_id", categoryId);
        userIds = (pros || []).map(p => p.user_id);
      }

      if (userIds.length === 0) {
        toast({ title: "Nenhum usuário encontrado para o filtro selecionado", variant: "destructive" });
        setSending(false);
        return;
      }

      const batchSize = 100;
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize).map(uid => ({
          user_id: uid,
          title: title.trim(),
          message: message.trim(),
          type: "info",
        }));
        await supabase.from("notifications").insert(batch);
      }

      setSentCount(userIds.length);
      toast({ title: `Notificação enviada para ${userIds.length} usuário(s)!` });
      setTitle("");
      setMessage("");
      setSelectedUser(null);
      setUserSearch("");
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    }
    setSending(false);
  };

  const targets: { value: TargetType; label: string; icon: any; desc: string }[] = [
    { value: "all", label: "Todos", icon: Users, desc: "Todos os usuários" },
    { value: "individual", label: "Individual", icon: User, desc: "Um usuário específico" },
    { value: "clients", label: "Clientes", icon: Users, desc: "Apenas clientes" },
    { value: "professionals", label: "Profissionais", icon: Briefcase, desc: "Apenas profissionais" },
    { value: "companies", label: "Empresas", icon: Building2, desc: "Apenas empresas" },
    { value: "category", label: "Categoria", icon: Briefcase, desc: "Por categoria" },
  ];

  return (
    <AdminLayout title="Notificações">
      <div className="max-w-lg space-y-5">
        <div className="bg-card border rounded-xl p-5">
          <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" /> Enviar notificação manual
          </h2>

          <div className="space-y-4">
            {/* Target selection */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Enviar para:</label>
              <div className="grid grid-cols-2 gap-2">
                {targets.map(t => (
                  <button
                    key={t.value}
                    onClick={() => { setTarget(t.value); setSelectedUser(null); setUserSearch(""); }}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-colors text-left ${
                      target === t.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                    }`}
                  >
                    <t.icon className="w-4 h-4 text-primary flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-foreground">{t.label}</p>
                      <p className="text-[10px] text-muted-foreground">{t.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Category selector */}
            {target === "category" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Categoria:</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Selecione...</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Individual user search */}
            {target === "individual" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Buscar usuário:</label>
                {selectedUser ? (
                  <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-primary/5 border-primary/30">
                    <User className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-foreground flex-1">{selectedUser.full_name}</span>
                    <button onClick={() => { setSelectedUser(null); setUserSearch(""); }} className="text-xs text-destructive hover:underline">Remover</button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      value={userSearch}
                      onChange={(e) => searchUsers(e.target.value)}
                      placeholder="Nome ou email do usuário..."
                      className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {userResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-card border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {userResults.map(u => (
                          <button
                            key={u.user_id}
                            onClick={() => { setSelectedUser({ user_id: u.user_id, full_name: u.full_name }); setUserResults([]); }}
                            className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b last:border-0"
                          >
                            <p className="text-sm font-medium text-foreground">{u.full_name}</p>
                            <p className="text-[10px] text-muted-foreground">{u.email}</p>
                          </button>
                        ))}
                      </div>
                    )}
                    {searching && <p className="text-[10px] text-muted-foreground mt-1">Buscando...</p>}
                  </div>
                )}
              </div>
            )}

            {/* Title */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Título *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Feliz Natal!"
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Message */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Mensagem *</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escreva a mensagem da notificação..."
                rows={3}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>

            <button
              onClick={handleSend}
              disabled={sending}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {sending ? (
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {sending ? "Enviando..." : "Enviar notificação"}
            </button>

            {sentCount !== null && (
              <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-center">
                <p className="text-sm font-medium text-primary">✅ Enviado para {sentCount} usuário(s)</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminNotifications;
