import { useEffect, useState } from "react";
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
    const load = async () => {
      // Always fetch plans
      const { data: allPlans } = await supabase.from("plans").select("*").order("sort_order");
      setPlans((allPlans as Plan[]) || []);

      if (!user) { setLoading(false); return; }

      // Count calls RECEIVED (as professional), not sent as client
      const { data: pro } = await supabase.from("professionals").select("id, bonus_calls").eq("user_id", user.id).maybeSingle();
      
      let receivedCount = 0;
      let bonusCalls = 0;
      if (pro) {
        const { count } = await supabase.from("service_requests").select("*", { count: "exact", head: true }).eq("professional_id", pro.id);
        receivedCount = count || 0;
        bonusCalls = (pro as any).bonus_calls || 0;
      }

      setCallsUsed(receivedCount);

      const { data: sub } = await supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle();
      if (sub) {
        setSubscription(sub as Subscription);
        const currentPlan = (allPlans as Plan[])?.find((p) => p.id === sub.plan_id);
        setPlan(currentPlan || null);
      } else {
        // Create free subscription if missing
        const { data: newSub } = await supabase
          .from("subscriptions")
          .insert({ user_id: user.id, plan_id: "free" })
          .select()
          .single();
        if (newSub) {
          setSubscription(newSub as Subscription);
          const freePlan = (allPlans as Plan[])?.find((p) => p.id === "free");
          setPlan(freePlan || null);
        }
      }
      setLoading(false);
    };
    load();
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

  return { subscription, plan, plans, callsUsed, callsRemaining, canMakeCall, isFreePlan, loading, changePlan };
}
