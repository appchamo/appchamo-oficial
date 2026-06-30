/**
 * Partners — Parceiros com desconto.
 * Dois tipos de desconto por parceiro:
 *   - QR Code: o cliente lê o QR no caixa do parceiro.
 *   - Cupom: o cliente copia o cupom e usa no site/menu do parceiro.
 * Cada parceiro é clicável e abre um modal explicando como usar o desconto.
 */
import AppLayout from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, QrCode, Store, MapPin, Percent, Loader2, Ticket, Copy, ExternalLink, ChevronRight } from "lucide-react";

interface Partner {
  id: string;
  name: string;
  niche: string | null;
  logo_url: string | null;
  location_city: string | null;
  location_state: string | null;
  checkin_active: boolean | null;
  checkin_discount_percent: number | null;
  checkin_rules: string | null;
  coupon_active: boolean | null;
  coupon_code: string | null;
  coupon_link: string | null;
  coupon_discount_percent: number | null;
  coupon_rules: string | null;
}

const hasQr = (p: Partner) => !!p.checkin_active && Number(p.checkin_discount_percent) > 0;
const hasCoupon = (p: Partner) => !!p.coupon_active && !!p.coupon_code?.trim();
const mainDiscount = (p: Partner) => (hasQr(p) ? Number(p.checkin_discount_percent) : Number(p.coupon_discount_percent) || 0);

export default function Partners() {
  const navigate = useNavigate();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Partner | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("sponsors")
        .select("id, name, niche, logo_url, location_city, location_state, checkin_active, checkin_discount_percent, checkin_rules, coupon_active, coupon_code, coupon_link, coupon_discount_percent, coupon_rules")
        .eq("active", true)
        .or("and(checkin_active.eq.true,checkin_discount_percent.gt.0),and(coupon_active.eq.true,coupon_code.not.is.null)")
        .order("checkin_discount_percent", { ascending: false });
      setPartners(((data as unknown) as Partner[]) || []);
      setLoading(false);
    })();
  }, []);

  const copyCoupon = async (code: string) => {
    try { await navigator.clipboard.writeText(code); toast({ title: "Cupom copiado!", description: code }); }
    catch { toast({ title: "Não foi possível copiar", description: code, variant: "destructive" }); }
  };

  return (
    <AppLayout>
      <main className="max-w-screen-md mx-auto px-4 py-5">
        <Link to="/home" className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-xl mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Início
        </Link>

        <div className="mb-4">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><Store className="w-5 h-5 text-primary" /> Parceiros com desconto</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Estabelecimentos parceiros do Chamô que dão desconto exclusivo pra você.</p>
        </div>

        {/* Como funciona — 2 tipos */}
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 mb-5">
          <p className="text-sm font-bold text-foreground mb-2">Como funciona o desconto de parceiros</p>
          <p className="text-xs text-muted-foreground mb-3">Existem 2 tipos de desconto. Toque no parceiro pra ver como usar o dele:</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-start gap-2 rounded-xl bg-card border p-2.5">
              <QrCode className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-foreground">Via QR Code</p>
                <p className="text-[11px] text-muted-foreground leading-snug">Leia o QR no caixa.</p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-xl bg-card border p-2.5">
              <Ticket className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-foreground">Via Cupom</p>
                <p className="text-[11px] text-muted-foreground leading-snug">Copie e use no site.</p>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : partners.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-3 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center"><Store className="w-8 h-8 text-muted-foreground/40" /></div>
            <p className="text-sm font-medium">Nenhum parceiro com desconto ainda</p>
            <p className="text-xs max-w-[240px]">Em breve novos estabelecimentos parceiros na sua região.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {partners.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="w-full text-left bg-card border rounded-2xl p-4 flex items-center gap-3 hover:border-primary/40 hover:shadow-card transition-all active:scale-[0.99]"
              >
                {p.logo_url ? (
                  <img src={p.logo_url} alt={p.name} className="w-14 h-14 rounded-xl object-cover shrink-0 border" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center shrink-0"><Store className="w-7 h-7 text-primary" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground truncate">{p.name}</p>
                  {p.niche && <p className="text-xs text-muted-foreground truncate">{p.niche}</p>}
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {hasQr(p) ? <><QrCode className="w-3 h-3" /> QR Code</> : <><Ticket className="w-3 h-3" /> Cupom</>}
                    </span>
                    {(p.location_city) && <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground"><MapPin className="w-2.5 h-2.5" /> {p.location_city}</span>}
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-center">
                  <div className="text-center bg-primary/10 rounded-xl px-3 py-2">
                    <p className="text-lg font-extrabold text-primary leading-none flex items-center gap-0.5">{mainDiscount(p)}<Percent className="w-4 h-4" /></p>
                    <p className="text-[9px] font-bold text-primary/80 uppercase tracking-wide mt-0.5">desconto</p>
                  </div>
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary mt-1">ver <ChevronRight className="w-3 h-3" /></span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Modal do parceiro */}
        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-sm">
            {selected && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {selected.logo_url
                      ? <img src={selected.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover border" />
                      : <Store className="w-5 h-5 text-primary" />}
                    {selected.name}
                  </DialogTitle>
                </DialogHeader>

                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl font-extrabold text-primary">{mainDiscount(selected)}%</span>
                  <span className="text-sm font-semibold text-foreground">de desconto</span>
                </div>

                {/* QR Code */}
                {hasQr(selected) && (
                  <div className="rounded-xl border p-3 mb-2">
                    <p className="text-sm font-bold text-foreground flex items-center gap-1.5 mb-1"><QrCode className="w-4 h-4 text-primary" /> Desconto via QR Code</p>
                    <p className="text-xs text-muted-foreground leading-snug mb-2">
                      Leia o QR Code no caixa do estabelecimento ou com o atendente para garantir seu desconto.
                      Consulte primeiro o atendente para entender melhor.
                    </p>
                    {selected.checkin_rules?.trim() && (
                      <p className="text-[11px] text-muted-foreground bg-muted/60 rounded-lg p-2 mb-2 whitespace-pre-wrap"><b>Regras:</b> {selected.checkin_rules.trim()}</p>
                    )}
                    <button
                      onClick={() => { setSelected(null); navigate("/qr-scan?mode=checkin"); }}
                      className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold inline-flex items-center justify-center gap-2"
                    >
                      <QrCode className="w-4 h-4" /> Ler QR Code no caixa
                    </button>
                  </div>
                )}

                {/* Cupom */}
                {hasCoupon(selected) && (
                  <div className="rounded-xl border p-3">
                    <p className="text-sm font-bold text-foreground flex items-center gap-1.5 mb-1"><Ticket className="w-4 h-4 text-primary" /> Desconto via Cupom</p>
                    <p className="text-xs text-muted-foreground leading-snug mb-2">Copie o cupom abaixo e use no site ou menu digital do parceiro.</p>
                    {selected.coupon_rules?.trim() && (
                      <p className="text-[11px] text-muted-foreground bg-muted/60 rounded-lg p-2 mb-2 whitespace-pre-wrap"><b>Regras:</b> {selected.coupon_rules.trim()}</p>
                    )}
                    <div className="flex items-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-3 py-2.5 mb-2">
                      <span className="flex-1 font-mono font-bold text-foreground tracking-wider truncate">{selected.coupon_code}</span>
                      <button onClick={() => copyCoupon(selected.coupon_code!)} className="inline-flex items-center gap-1 text-primary text-xs font-bold shrink-0">
                        <Copy className="w-3.5 h-3.5" /> Copiar
                      </button>
                    </div>
                    {selected.coupon_link?.trim() && (
                      <a
                        href={selected.coupon_link} target="_blank" rel="noopener noreferrer"
                        className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold inline-flex items-center justify-center gap-2"
                      >
                        <ExternalLink className="w-4 h-4" /> Ir para o site
                      </a>
                    )}
                  </div>
                )}
              </>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </AppLayout>
  );
}
