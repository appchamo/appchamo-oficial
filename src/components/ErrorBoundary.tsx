import React, { Component, ErrorInfo, ReactNode } from "react";
import { Link } from "react-router-dom";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
          <div className="text-center max-w-sm space-y-4">
            <h1 className="text-xl font-bold text-foreground">Algo deu errado</h1>
            <p className="text-sm text-muted-foreground">
              Ocorreu um erro ao processar o login ou esta página. Tente novamente ou volte ao início.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <details className="text-left w-full">
                <summary className="text-xs text-muted-foreground cursor-pointer">Detalhes do erro (dev)</summary>
                <pre className="mt-2 p-2 rounded bg-muted text-xs overflow-auto max-h-24">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <div className="flex flex-col gap-2 pt-2">
              <Link
                to="/login"
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90"
              >
                Ir para Login
              </Link>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
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
