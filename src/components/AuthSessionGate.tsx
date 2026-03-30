import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Se a conta foi removida no servidor mas o cliente ainda tinha JWT até expirar / refresh:
 * valida com auth.getUser ao voltar ao app, ao primeiro toque e após refresh de token (useAuth).
 */
export default function AuthSessionGate() {
  const { session, loading, exitSessionToLanding } = useAuth();
  const pointerDone = useRef(false);

  useEffect(() => {
    if (loading || !session?.user) return;
    pointerDone.current = false;

    const verify = async () => {
      const { error } = await supabase.auth.getUser();
      if (error) await exitSessionToLanding();
    };

    const onPointerDown = () => {
      if (pointerDone.current) return;
      pointerDone.current = true;
      void verify();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void verify();
    };

    void verify();
    document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loading, session?.user?.id, exitSessionToLanding]);

  return null;
}
