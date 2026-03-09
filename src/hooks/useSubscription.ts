import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Plan {
  id: string;
  name: string;
  price_monthly: number;
  max_calls: number;
  max_devices: number;
  has_verified_badge: boolean;
  has_featured: boolean;
  has_product_catalog: boolean;
  has_job_postings: boolean;
  has_in_app_support: boolean;
  has_vip_event: boolean;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  started_at: string;
  expires_at: string | null;
}

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [callsUsed, setCallsUsed] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const SAFETY_MS = 5000;
    const timeoutId = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, SAFETY_MS);

    const load = async () => {
      try {
        const { data: allPlans } = await supabase.from("plans").select("*").order("sort_order");
        const plansList = (allPlans as Plan[]) || [];
        if (!cancelled) {
          setPlans(plansList);
          setLoading(false);
          clearTimeout(timeoutId);
        }
        if (!user) return;

        const { data: pro } = await supabase.from("professionals").select("id, bonus_calls").eq("user_id", user.id).maybeSingle();
        let receivedCount = 0;
        if (pro) {
          const { count } = await supabase.from("service_requests").select("*", { count: "exact", head: true }).eq("professional_id", pro.id);
          receivedCount = count || 0;
        }
        if (!cancelled) setCallsUsed(receivedCount);

        const { data: sub } = await supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle();
        if (sub && !cancelled) {
          setSubscription(sub as Subscription);
          setPlan(plansList.find((p) => p.id === sub.plan_id) || null);
        } else if (!sub && !cancelled) {
          const { data: newSub } = await supabase
            .from("subscriptions")
            .insert({ user_id: user.id, plan_id: "free" })
            .select()
            .single();
          if (newSub && !cancelled) {
            setSubscription(newSub as Subscription);
            setPlan(plansList.find((p) => p.id === "free") || null);
          }
        }
      } catch {
        if (!cancelled) {
          setLoading(false);
          clearTimeout(timeoutId);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          clearTimeout(timeoutId);
        }
      }
    };
    load();
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [user]);

  const effectiveMaxCalls = plan ? (plan.max_calls === -1 ? -1 : plan.max_calls + (callsUsed >= 0 ? 0 : 0)) : 0;
  const canMakeCall = plan ? (plan.max_calls === -1 || callsUsed < (plan.max_calls)) : false;
  const isFreePlan = plan?.id === "free";
  const callsRemaining = plan?.max_calls === -1 ? Infinity : (plan?.max_calls || 0) - callsUsed;

  const changePlan = async (planId: string) => {
    if (!user) return false;
    
    // Try update first
    const { data: updated, error: updateErr } = await supabase
      .from("subscriptions")
      .update({ plan_id: planId, started_at: new Date().toISOString(), status: "active" })
      .eq("user_id", user.id)
      .select()
      .single();
    
    if (updateErr || !updated) {
      // If no row to update, insert
      const { data: inserted, error: insertErr } = await supabase
        .from("subscriptions")
        .insert({ user_id: user.id, plan_id: planId, status: "active" })
        .select()
        .single();
      if (insertErr || !inserted) return false;
      setSubscription(inserted as Subscription);
    } else {
      setSubscription(updated as Subscription);
    }
    
    const newPlan = plans.find((p) => p.id === planId);
    setPlan(newPlan || null);

    // If upgrading from free, reactivate the professional profile
    if (planId !== "free") {
      const { data: pro } = await supabase.from("professionals").select("id, availability_status").eq("user_id", user.id).maybeSingle();
      if (pro && pro.availability_status === "unavailable") {
        await supabase.from("professionals").update({ availability_status: "available" }).eq("id", pro.id);
      }
    }

    return true;
  };

  const refetch = useCallback(async () => {
    if (!user) return;
    const { data: sub } = await supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle();
    const plansList = [...plans];
    if (plansList.length === 0) {
      const { data: allPlans } = await supabase.from("plans").select("*").order("sort_order");
      plansList.push(...((allPlans as Plan[]) || []));
      setPlans(plansList);
    }
    if (sub) {
      setSubscription(sub as Subscription);
      setPlan(plansList.find((p) => p.id === sub.plan_id) || null);
    }
  }, [user, plans]);

  return { subscription, plan, plans, callsUsed, callsRemaining, canMakeCall, isFreePlan, loading, changePlan, refetch };
}
