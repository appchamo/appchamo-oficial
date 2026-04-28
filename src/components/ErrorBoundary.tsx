import React, { Component, ErrorInfo, ReactNode } from "react";
import { Link } from "react-router-dom";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  recovering: boolean;
}

/**
 * Flag em sessionStorage que evita loop quando a recuperação automática
 * falha (raro, mas possível se o erro reaparecer no próximo render).
 */
const RECOVERY_FLAG = "chamo_replacestate_recovery_attempted";

/**
 * Decide se o erro veio do throttle de history.replaceState() do WebKit (iOS).
 * O Safari/WebKit dispara SecurityError ("Attempt to use history.replaceState()
 * more than 100 times per 30 seconds") quando guards de rota encadeiam várias
 * navegações replace=true em sequência (foi exatamente o erro reportado pela
 * Apple na revisão da v1.8 — Submission 1a49c79d-2fee-4225-8631-d8bf2180a7a5).
 * Um reload completo zera o contador e geralmente já reabre o app na tela certa.
 */
function isReplaceStateThrottle(error: Error | null): boolean {
  if (!error) return false;
  const name = (error.name || "").toString();
  const msg = (error.message || "").toString().toLowerCase();
  if (name === "SecurityError" && msg.includes("replacestate")) return true;
  // Algumas versões do WebKit reportam o texto completo sem expor o name correto.
  return msg.includes("replacestate") && msg.includes("more than");
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, recovering: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, recovering: isReplaceStateThrottle(error) };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary:", error, errorInfo);

    // Auto-recover do throttle de replaceState (iOS): um reload completo limpa
    // o contador do WebKit. Só tentamos UMA vez; se voltar a falhar, o usuário
    // vê a UI normal de erro e pode ir manualmente para /login.
    if (!isReplaceStateThrottle(error)) return;
    let alreadyTried = false;
    try {
      alreadyTried = sessionStorage.getItem(RECOVERY_FLAG) === "1";
    } catch {
      /* sessionStorage indisponível: segue sem flag */
    }
    if (alreadyTried) {
      this.setState({ recovering: false });
      return;
    }
    try {
      sessionStorage.setItem(RECOVERY_FLAG, "1");
    } catch {
      /* ignore */
    }
    // Pequeno delay para garantir que o React desmonte o componente que
    // estourou e que o WebKit não tente outro replaceState no mesmo tick.
    window.setTimeout(() => {
      try {
        // Se temos sessão (caso pós-OAuth), reentra pelo gate; senão, login.
        // Como não temos contexto aqui, /post-login lida com ambos os casos
        // (o próprio gate faz fallback para /login se não houver sessão).
        window.location.assign("/post-login");
      } catch {
        try {
          window.location.href = "/login";
        } catch {
          /* sem mais opções */
        }
      }
    }, 250);
  }

  /**
   * Limpa a flag de recovery quando o usuário abre a tela manualmente
   * (ex.: navegou e voltou). Evita travar permanentemente o auto-recovery
   * caso o erro reocorra em outra sessão.
   */
  static clearRecoveryFlag() {
    try {
      sessionStorage.removeItem(RECOVERY_FLAG);
    } catch {
      /* ignore */
    }
  }

  render() {
    if (this.state.hasError) {
      // Enquanto a recuperação automática está em curso, mostramos um spinner
      // mínimo para não exibir "Algo deu errado" por meio segundo antes do reload.
      if (this.state.recovering) {
        return (
          <div className="min-h-screen bg-background flex items-center justify-center p-6">
            <div className="text-sm text-muted-foreground">Recarregando…</div>
          </div>
        );
      }
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
          <div className="text-center max-w-sm space-y-4">
            <h1 className="text-xl font-bold text-foreground">Algo deu errado</h1>
            <p className="text-sm text-muted-foreground">
              Ocorreu um erro ao processar o login ou esta página. Tente novamente ou volte ao início.
            </p>
            {this.state.error && (
              <details className="text-left w-full">
                <summary className="text-xs text-muted-foreground cursor-pointer">Ver detalhes do erro</summary>
                <pre className="mt-2 p-2 rounded bg-muted text-xs overflow-auto max-h-32 break-all">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <div className="flex flex-col gap-2 pt-2">
              <Link
                to="/login"
                onClick={() => ErrorBoundary.clearRecoveryFlag()}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90"
              >
                Ir para Login
              </Link>
              <button
                type="button"
                onClick={() => {
                  ErrorBoundary.clearRecoveryFlag();
                  this.setState({ hasError: false, error: null, recovering: false });
                }}
                className="w-full py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted"
              >
                Tentar de novo
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
