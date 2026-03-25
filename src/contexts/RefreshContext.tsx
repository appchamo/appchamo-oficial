import React, { createContext, useCallback, useRef, useContext, ReactNode, useState, useEffect } from "react";

type RefreshHandler = () => void | Promise<void>;

interface RefreshContextValue {
  registerHandler: (routeKey: string, handler: RefreshHandler | null) => void;
  triggerRefresh: () => Promise<void>;
  isRefreshing: boolean;
}

const RefreshContext = createContext<RefreshContextValue | null>(null);

const REFRESH_TIMEOUT_MS = 12_000;

export function RefreshProvider({ children }: { children: ReactNode }) {
  const handlersRef = useRef<Map<string, RefreshHandler>>(new Map());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const registerHandler = useCallback((routeKey: string, handler: RefreshHandler | null) => {
    if (handler) handlersRef.current.set(routeKey, handler);
    else handlersRef.current.delete(routeKey);
  }, []);

  const triggerRefresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    const pathname = window.location.pathname;
    const handler = handlersRef.current.get(pathname);
    if (!handler) return;

    setIsRefreshing(true);
    try {
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("refresh_timeout")), REFRESH_TIMEOUT_MS)
      );
      await Promise.race([Promise.resolve(handler()), timeoutPromise]);
    } catch {
      // timeout / erro
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return (
    <RefreshContext.Provider value={{ registerHandler, triggerRefresh, isRefreshing }}>
      {children}
    </RefreshContext.Provider>
  );
}

/**
 * Registra o refresh por rota (ex.: "/home", "/search").
 * Necessário com abas persistentes: cada tela mantém o próprio handler.
 */
export function useRefreshAtKey(routeKey: string, handler: RefreshHandler | null) {
  const ctx = useContext(RefreshContext);
  const ref = React.useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!ctx) return;
    ctx.registerHandler(routeKey, () => Promise.resolve(ref.current?.()));
    return () => ctx.registerHandler(routeKey, null);
  }, [ctx, routeKey]);
}

export function useTriggerRefresh() {
  return useContext(RefreshContext)?.triggerRefresh ?? (() => Promise.resolve());
}

export function useIsRefreshing() {
  return useContext(RefreshContext)?.isRefreshing ?? false;
}
