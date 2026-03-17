import React, { createContext, useCallback, useRef, useContext, ReactNode, useState } from "react";

type RefreshHandler = () => void | Promise<void>;

interface RefreshContextValue {
  registerRefresh: (handler: RefreshHandler | null) => void;
  triggerRefresh: () => Promise<void>;
  isRefreshing: boolean;
}

const RefreshContext = createContext<RefreshContextValue | null>(null);

const REFRESH_TIMEOUT_MS = 12_000;

export function RefreshProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<RefreshHandler | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const registerRefresh = useCallback((handler: RefreshHandler | null) => {
    handlerRef.current = handler;
  }, []);

  const triggerRefresh = useCallback(async () => {
    if (handlerRef.current) {
      setIsRefreshing(true);
      try {
        const timeoutPromise = new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("refresh_timeout")), REFRESH_TIMEOUT_MS)
        );
        await Promise.race([
          Promise.resolve(handlerRef.current()),
          timeoutPromise,
        ]);
      } catch {
        // Timeout ou erro: libera a tela para não travar em "Atualizando..."
      } finally {
        setIsRefreshing(false);
      }
    } else {
      window.location.reload();
    }
  }, []);

  return (
    <RefreshContext.Provider value={{ registerRefresh, triggerRefresh, isRefreshing }}>
      {children}
    </RefreshContext.Provider>
  );
}

export function useRefresh(handler: RefreshHandler | null) {
  const ctx = useContext(RefreshContext);
  const ref = React.useRef(handler);
  ref.current = handler;
  React.useEffect(() => {
    if (!ctx) return;
    ctx.registerRefresh(() => Promise.resolve(ref.current?.()));
    return () => ctx.registerRefresh(null);
  }, [ctx]);
}

export function useTriggerRefresh() {
  return useContext(RefreshContext)?.triggerRefresh ?? (() => Promise.resolve());
}

export function useIsRefreshing() {
  return useContext(RefreshContext)?.isRefreshing ?? false;
}
