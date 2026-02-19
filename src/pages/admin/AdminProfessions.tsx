import AdminLayout from "@/components/AdminLayout";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Save, X, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Profession {
  id: string;
  category_id: string;
  name: string;
  active: boolean;
  sort_order: number;
  category_name?: string;
}

interface Category {
  id: string;
  name: string;
}

const AdminProfessions = () => {
  const [professions, setProfessions] = useState<Profession[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<Profession | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState({ name: "", category_id: "", active: true, sort_order: 0 });
  const [filterCat, setFilterCat] = useState("");

  const fetchData = async () => {
    const [{ data: profs }, { data: cats }] = await Promise.all([
      supabase.from("professions" as any).select("*, categories(name)").order("sort_order"),
      supabase.from("categories").select("id, name").eq("active", true).order("sort_order"),
    ]);
    setProfessions(
      ((profs as any[]) || []).map((p: any) => ({
        ...p,
        category_name: p.categories?.name || "—",
      }))
    );
    setCategories((cats as Category[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => {
    setIsNew(true);
    setForm({ name: "", category_id: categories[0]?.id || "", active: true, sort_order: professions.length });
    setEditItem({} as Profession);
  };

  const openEdit = (item: Profession) => {
    setIsNew(false);
    setForm({ name: item.name, category_id: item.category_id, active: item.active, sort_order: item.sort_order });
    setEditItem(item);
  };

  const handleSave = async () => {
    if (!form.name || !form.category_id) {
      toast({ title: "Preencha nome e categoria", variant: "destructive" });
      return;
    }
    if (isNew) {
      await supabase.from("professions" as any).insert(form as any);
      toast({ title: "Profissão criada!" });
    } else if (editItem) {
      await supabase.from("professions" as any).update(form as any).eq("id", editItem.id);
      toast({ title: "Profissão atualizada!" });
    }
    setEditItem(null);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("professions" as any).delete().eq("id", id);
    toast({ title: "Profissão removida" });
    fetchData();
  };

  const filtered = filterCat
    ? professions.filter(p => p.category_id === filterCat)
    : professions;

  return (
    <AdminLayout title="Profissões">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">{professions.length} profissões</p>
          <div className="relative">
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
              className="border rounded-xl px-3 py-2 text-xs bg-background outline-none focus:ring-2 focus:ring-primary/30 appearance-none pr-7">
              <option value="">Todas categorias</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
        </div>
        <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" /> Nova profissão
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium text-muted-foreground">Nome</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Categoria</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Ordem</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-medium text-foreground">{item.name}</td>
                  <td className="p-3 text-muted-foreground">{item.category_name}</td>
                  <td className="p-3 text-muted-foreground">{item.sort_order}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${item.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {item.active ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td className="p-3 flex gap-1">
                    <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground text-sm">Nenhuma profissão cadastrada</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{isNew ? "Nova Profissão" : "Editar Profissão"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nome</label>
              <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Categoria</label>
              <div className="relative">
                <select value={form.category_id} onChange={(e) => setForm(f => ({ ...f, category_id: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 appearance-none">
                  <option value="">Selecione</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Ordem</label>
                <input type="number" value={form.sort_order} onChange={(e) => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm(f => ({ ...f, active: e.target.checked }))}
                    className="w-4 h-4 rounded border-border text-primary" />
                  <span className="text-sm text-foreground">Ativa</span>
                </label>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditItem(null)} className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors flex items-center justify-center gap-1">
                <X className="w-4 h-4" /> Cancelar
              </button>
              <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1">
                <Save className="w-4 h-4" /> Salvar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminProfessions;

