import React, { createContext, useCallback, useRef, useContext, ReactNode, useState } from "react";

type RefreshHandler = () => void | Promise<void>;

interface RefreshContextValue {
  registerRefresh: (handler: RefreshHandler | null) => void;
  triggerRefresh: () => Promise<void>;
  isRefreshing: boolean;
}

const RefreshContext = createContext<RefreshContextValue | null>(null);

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
        await Promise.resolve(handlerRef.current());
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
