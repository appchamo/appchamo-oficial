/**
 * Conteúdo padrão dos tutoriais da Home + helpers.
 * O admin pode sobrescrever via platform_settings.home_tutorials; quando um
 * item não tiver passo-a-passo definido, caímos no conteúdo padrão daqui.
 * Também controla o "concluído" por tutorial (localStorage), pra mostrar
 * o selo de concluído na Home e a tela de conclusão.
 */

export interface TutorialItem {
  id: string;
  icon: string;          // nome do ícone Lucide (ver iconMap)
  label: string;
  path: string;
  description?: string;  // legado (passos separados por \n)
  steps?: string[];
  video_url?: string;
}

export interface TutorialsConfig {
  title: string;
  subtitle: string;
  items: TutorialItem[];
}

export const DEFAULT_TUTORIALS: TutorialItem[] = [
  {
    id: "1",
    icon: "BookOpen",
    label: "Como usar o Chamô",
    path: "/tutorial/1",
    steps: [
      "Crie sua conta com Google, Apple ou e-mail e confirme seus dados.",
      "Defina sua localização (cidade e CEP) para ver profissionais da sua região.",
      "Use a busca ou as categorias para encontrar o serviço que precisa.",
      "Abra o perfil do profissional para ver avaliações, fotos e redes sociais.",
      "Converse pelo chat e combine tudo antes de fechar o serviço.",
    ],
  },
  {
    id: "2",
    icon: "UserCheck",
    label: "Como contratar",
    path: "/tutorial/2",
    steps: [
      "Busque pela categoria ou pelo nome do serviço que você precisa.",
      "Compare profissionais pelas avaliações, selos e portfólio.",
      "Toque em \"Solicitar serviço\" ou abra um \"Pedido aberto\" para receber propostas.",
      "Explique o que precisa no chat e peça um orçamento.",
      "Aceite a proposta e acompanhe tudo dentro do aplicativo.",
    ],
  },
  {
    id: "3",
    icon: "CreditCard",
    label: "Como pagar",
    path: "/tutorial/3",
    steps: [
      "Depois de combinar o serviço, o profissional envia a cobrança pelo chat.",
      "Escolha pagar por PIX ou cartão de crédito.",
      "Aplique um cupom de desconto, se você tiver, antes de confirmar.",
      "Confirme o pagamento — ele fica protegido até a conclusão do serviço.",
      "Você recebe a confirmação na hora e ainda gira a roleta de prêmios.",
    ],
  },
  {
    id: "4",
    icon: "Wallet",
    label: "Assinaturas e saques",
    path: "/tutorial/4",
    steps: [
      "Profissionais assinam um plano (Pro, VIP ou Business) para liberar mais recursos.",
      "Os valores recebidos ficam na sua Carteira, dentro do app.",
      "Cada pagamento tem um prazo até o saldo ficar disponível para saque.",
      "Cadastre seus dados de PIX/bancários nas configurações fiscais.",
      "Solicite o saque pela Carteira e acompanhe o status por lá.",
    ],
  },
];

export const DEFAULT_TUTORIALS_CONFIG: TutorialsConfig = {
  title: "Dúvidas sobre como usar o app?",
  subtitle: "Veja nossos tutoriais rápidos",
  items: DEFAULT_TUTORIALS,
};

/** Passos efetivos de um item (steps → senão description quebrada por linha). */
export function tutorialSteps(item: Pick<TutorialItem, "steps" | "description">): string[] {
  if (item.steps && item.steps.length > 0) return item.steps;
  if (item.description) return item.description.split("\n").map((s) => s.trim()).filter(Boolean);
  return [];
}

/** Mescla os itens do admin com os padrões: preenche passos faltantes pelo default. */
export function mergeTutorialItems(dbItems?: Partial<TutorialItem>[] | null): TutorialItem[] {
  if (!dbItems || dbItems.length === 0) return DEFAULT_TUTORIALS;
  return dbItems
    .filter((it) => it && it.id)
    .map((it) => {
      const def = DEFAULT_TUTORIALS.find((d) => d.id === it!.id);
      const steps = it!.steps && it!.steps.length ? it!.steps : def?.steps;
      return {
        id: it!.id!,
        icon: it!.icon || def?.icon || "BookOpen",
        label: it!.label || def?.label || "Tutorial",
        path: `/tutorial/${it!.id}`,
        description: it!.description || def?.description,
        steps,
        video_url: (it as TutorialItem).video_url || undefined,
      } as TutorialItem;
    });
}

export function resolveTutorial(id: string | undefined, dbItems?: Partial<TutorialItem>[] | null): TutorialItem | null {
  if (!id) return null;
  const merged = mergeTutorialItems(dbItems);
  return merged.find((t) => t.id === id) || DEFAULT_TUTORIALS.find((t) => t.id === id) || null;
}

// ── Conclusão (localStorage) ─────────────────────────────────────────────────
const DONE_PREFIX = "chamo_tutorial_done_";

export function isTutorialDone(id: string): boolean {
  try { return localStorage.getItem(DONE_PREFIX + id) === "1"; } catch { return false; }
}

export function markTutorialDone(id: string): void {
  try { localStorage.setItem(DONE_PREFIX + id, "1"); } catch { /* ignore */ }
}

export function countTutorialsDone(ids: string[]): number {
  return ids.reduce((n, id) => (isTutorialDone(id) ? n + 1 : n), 0);
}
