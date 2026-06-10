/**
 * Redes sociais do profissional no perfil.
 * - Cliente: vê ícones oficiais (WhatsApp/Instagram) + "Outro" link, clicáveis.
 * - Dono (isOwner): edita os 3 campos. Só plano pago (Pro/VIP/Business) tem acesso.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Link2, Lock, Pencil, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { buildWhatsappUrl, buildInstagramUrl, buildOtherUrl } from "@/lib/socialLinks";

interface Props {
  proId: string;
  isOwner: boolean;
  isPaidPlan: boolean;
  whatsapp: string | null;
  instagram: string | null;
  link: string | null;
}

const WhatsappIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 0 1 8.413 3.488 11.82 11.82 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.515 5.26l-.999 3.648 3.973-1.607zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413z"/>
  </svg>
);

const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
  </svg>
);

function IconLink({ href, label, color, children }: { href: string; label: string; color: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="w-11 h-11 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform shadow-sm"
      style={{ background: color }}
    >
      {children}
    </a>
  );
}

export default function ProfessionalSocialLinks({ proId, isOwner, isPaidPlan, whatsapp, instagram, link }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wa, setWa] = useState(whatsapp || "");
  const [ig, setIg] = useState(instagram || "");
  const [other, setOther] = useState(link || "");

  const waUrl = buildWhatsappUrl(wa);
  const igUrl = buildInstagramUrl(ig);
  const otherUrl = buildOtherUrl(other);
  const hasAny = !!(waUrl || igUrl || otherUrl);

  // Cliente: só mostra se o profissional é plano pago e tem algo
  if (!isOwner) {
    if (!isPaidPlan || !hasAny) return null;
    return (
      <div className="flex items-center gap-3 mb-4">
        {waUrl && <IconLink href={waUrl} label="WhatsApp" color="#25D366"><WhatsappIcon /></IconLink>}
        {igUrl && <IconLink href={igUrl} label="Instagram" color="linear-gradient(45deg,#f09433,#dc2743,#bc1888)"><InstagramIcon /></IconLink>}
        {otherUrl && <IconLink href={otherUrl} label="Link" color="#525252"><Link2 className="w-5 h-5" /></IconLink>}
      </div>
    );
  }

  // Dono sem plano pago: upsell
  if (!isPaidPlan) {
    return (
      <div className="bg-card border rounded-2xl p-4 mb-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Redes sociais</p>
          <p className="text-xs text-muted-foreground">Disponível a partir do plano Pro — mostre seu WhatsApp e Instagram no perfil.</p>
        </div>
        <Link to="/subscriptions" className="text-xs font-bold text-primary shrink-0">Ver planos</Link>
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("professionals" as any)
      .update({
        social_whatsapp: wa.trim() || null,
        social_instagram: ig.trim() || null,
        social_link: other.trim() || null,
      } as any)
      .eq("id", proId);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Redes sociais salvas!" });
      setEditing(false);
    }
  };

  // Dono com plano pago
  return (
    <div className="bg-card border rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-foreground">Redes sociais</p>
        {!editing && (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs font-semibold text-primary">
            <Pencil className="w-3.5 h-3.5" /> Editar
          </button>
        )}
      </div>

      {!editing ? (
        hasAny ? (
          <div className="flex items-center gap-3">
            {waUrl && <IconLink href={waUrl} label="WhatsApp" color="#25D366"><WhatsappIcon /></IconLink>}
            {igUrl && <IconLink href={igUrl} label="Instagram" color="linear-gradient(45deg,#f09433,#dc2743,#bc1888)"><InstagramIcon /></IconLink>}
            {otherUrl && <IconLink href={otherUrl} label="Link" color="#525252"><Link2 className="w-5 h-5" /></IconLink>}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Toque em "Editar" para adicionar seu WhatsApp, Instagram ou um link.</p>
        )
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">WhatsApp (com DDD)</label>
            <input value={wa} onChange={(e) => setWa(e.target.value)} placeholder="(34) 99999-9999" inputMode="tel"
              className="w-full border rounded-xl px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Instagram (@)</label>
            <input value={ig} onChange={(e) => setIg(e.target.value)} placeholder="@seuperfil"
              className="w-full border rounded-xl px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Outro link</label>
            <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="https://..."
              className="w-full border rounded-xl px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar
            </button>
            <button onClick={() => { setEditing(false); setWa(whatsapp || ""); setIg(instagram || ""); setOther(link || ""); }}
              className="px-4 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
