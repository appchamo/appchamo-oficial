/**
 * Partners — Página de parceiros com desconto ("Validar no caixa").
 * Lista os patrocinadores com check-in ativo e desconto, explicando como o
 * benefício funciona: cada parceiro tem um QR no caixa; o usuário escaneia
 * pelo app e ganha um desconto exclusivo na hora.
 */
import AppLayout from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, QrCode, Store, MapPin, Percent, ScrollText, Loader2 } from "lucide-react";

interface Partner {
  id: string;
  name: string;
  niche: string | null;
  logo_url: string | null;
  location_city: string | null;
  location_state: string | null;
  checkin_discount_percent: number | null;
  checkin_rules: string | null;
}

export default function Partners() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("sponsors")
        .select("id, name, niche, logo_url, location_city, location_state, checkin_discount_percent, checkin_rules")
        .eq("active", true)
        .eq("checkin_active", true)
        .gt("checkin_discount_percent", 0)
        .order("checkin_discount_percent", { ascending: false });
      setPartners(((data as unknown) as Partner[]) || []);
      setLoading(false);
    })();
  }, []);

  return (
    <AppLayout>
      <main className="max-w-screen-md mx-auto px-4 py-5">
        <Link
          to="/home"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-xl mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Início
        </Link>

        <div className="mb-4">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Store className="w-5 h-5 text-primary" /> Parceiros com desconto
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Estabelecimentos parceiros do Chamô que dão desconto exclusivo pra você.
          </p>
        </div>

        {/* Como funciona + Validar no caixa */}
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 mb-5">
          <p className="text-sm font-bold text-foreground mb-2">Como funciona o "Validar no caixa"</p>
          <ol className="text-xs text-muted-foreground space-y-1.5 mb-3 list-decimal list-inside leading-snug">
            <li>Vá até um parceiro da lista abaixo.</li>
            <li>No caixa, toque em <b>Validar no caixa</b> e escaneie o <b>QR Code</b> do estabelecimento.</li>
            <li>Pronto: o desconto exclusivo é aplicado na hora.</li>
          </ol>
          <Link
            to="/qr-scan?mode=checkin"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors shadow-sm"
          >
            <QrCode className="w-5 h-5" /> Validar no caixa
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : partners.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-3 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Store className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium">Nenhum parceiro com desconto ainda</p>
            <p className="text-xs max-w-[240px]">Em breve novos estabelecimentos parceiros na sua região.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {partners.map((p) => (
              <div key={p.id} className="bg-card border rounded-2xl overflow-hidden shadow-card">
                <div className="flex items-center gap-3 p-4">
                  {p.logo_url ? (
                    <img src={p.logo_url} alt={p.name} className="w-14 h-14 rounded-xl object-cover shrink-0 border" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center shrink-0">
                      <Store className="w-7 h-7 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-foreground truncate">{p.name}</h3>
                    {p.niche && <p className="text-xs text-muted-foreground truncate">{p.niche}</p>}
                    {(p.location_city || p.location_state) && (
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                        <MapPin className="w-3 h-3" /> {[p.location_city, p.location_state].filter(Boolean).join(" - ")}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-center bg-primary/10 rounded-xl px-3 py-2">
                    <p className="text-lg font-extrabold text-primary leading-none flex items-center gap-0.5">
                      {Number(p.checkin_discount_percent)}<Percent className="w-4 h-4" />
                    </p>
                    <p className="text-[9px] font-bold text-primary/80 uppercase tracking-wide mt-0.5">desconto</p>
                  </div>
                </div>
                {p.checkin_rules?.trim() && (
                  <div className="px-4 pb-3 -mt-1">
                    <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/60 rounded-lg p-2.5">
                      <ScrollText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <p className="leading-snug whitespace-pre-wrap">{p.checkin_rules.trim()}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </AppLayout>
  );
}
