import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LinkedSponsor {
  id: string;
  name: string;
  logo_url: string | null;
  link_url: string;
  weekly_plan: string;
  niche?: string | null;
}

/** Conta de utilizador ligada a um patrocinador (user_id em public.sponsors). */
export function useLinkedSponsor(userId: string | null | undefined) {
  const [sponsor, setSponsor] = useState<LinkedSponsor | null>(null);
  const [loading, setLoading] = useState(!!userId);

  useEffect(() => {
    if (!userId) {
      setSponsor(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data } = await supabase
        .from("sponsors")
        .select("id, name, logo_url, link_url, weekly_plan, niche")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      setSponsor((data as LinkedSponsor) || null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { sponsor, loading, isSponsorAccount: !!sponsor };
}
