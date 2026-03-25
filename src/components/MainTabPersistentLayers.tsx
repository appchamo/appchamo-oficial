import {
  Suspense,
  lazy,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import {
  MAIN_APP_TAB_PATHS,
  MAIN_TAB_PERSIST_ATTR,
  type MainAppTabPath,
} from "@/lib/mainAppTabs";

const Home = lazy(() => import("@/pages/Home"));
const Search = lazy(() => import("@/pages/Search"));
const Messages = lazy(() => import("@/pages/Messages"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const Profile = lazy(() => import("@/pages/Profile"));

const TabComponents: Record<MainAppTabPath, LazyExoticComponent<ComponentType>> = {
  "/home": Home,
  "/search": Search,
  "/messages": Messages,
  "/notifications": Notifications,
  "/profile": Profile,
};

/** Placeholder: a tela real da aba vem do layer persistente. */
export function TabRoutePlaceholder() {
  return null;
}

function tabNeedsAuth(path: MainAppTabPath): boolean {
  return path === "/messages" || path === "/notifications" || path === "/profile";
}

function TabInner({ path }: { path: MainAppTabPath }) {
  const Cmp = TabComponents[path];
  if (tabNeedsAuth(path)) {
    return (
      <ProtectedRoute>
        <Cmp />
      </ProtectedRoute>
    );
  }
  return <Cmp />;
}

/**
 * Mantém as cinco abas principais montadas após a primeira visita (fora da aba: display:none).
 * Troca de usuário limpa o cache (nova montagem na próxima visita a cada aba).
 */
export default function MainTabPersistentLayers() {
  const location = useLocation();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const prevUserId = useRef<string | null | undefined>(undefined);
  const [epoch, setEpoch] = useState(0);
  const [warm, setWarm] = useState<Partial<Record<MainAppTabPath, boolean>>>(() => {
    const p = location.pathname;
    if (MAIN_APP_TAB_PATHS.includes(p as MainAppTabPath)) {
      return { [p as MainAppTabPath]: true };
    }
    return {};
  });

  useEffect(() => {
    const p = location.pathname;
    if (MAIN_APP_TAB_PATHS.includes(p as MainAppTabPath)) {
      setWarm((w) => ({ ...w, [p as MainAppTabPath]: true }));
    }
  }, [location.pathname]);

  useLayoutEffect(() => {
    if (prevUserId.current === undefined) {
      prevUserId.current = userId;
      return;
    }
    if (prevUserId.current !== userId) {
      prevUserId.current = userId;
      setEpoch((e) => e + 1);
      setWarm({});
      const p = location.pathname;
      if (MAIN_APP_TAB_PATHS.includes(p as MainAppTabPath)) {
        setWarm({ [p as MainAppTabPath]: true });
      }
    }
  }, [userId, location.pathname]);

  return (
    <>
      {MAIN_APP_TAB_PATHS.map((path) => {
        if (!warm[path]) return null;
        const visible = location.pathname === path;
        const attr = MAIN_TAB_PERSIST_ATTR[path];
        return (
          <div
            key={`${path}-${epoch}`}
            data-chamo-tab-persist={attr}
            className={
              visible
                ? "fixed inset-0 z-[10] box-border flex min-h-0 flex-col overflow-hidden bg-background pt-[var(--safe-top,env(safe-area-inset-top,0px))]"
                : "hidden"
            }
            style={!visible ? { display: "none" } : undefined}
            aria-hidden={!visible}
          >
            <Suspense fallback={null}>
              <TabInner path={path} />
            </Suspense>
          </div>
        );
      })}
    </>
  );
}
