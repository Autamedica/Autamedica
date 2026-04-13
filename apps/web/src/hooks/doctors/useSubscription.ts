"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchApi } from "@/lib/api-client";
import type {
  SubscriptionPlan,
  DoctorSubscriptionWithPlan,
} from "@autamedica/types";

interface UseSubscriptionReturn {
  plans: SubscriptionPlan[];
  subscription: DoctorSubscriptionWithPlan | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  subscribe: (planSlug: string) => Promise<{ initPoint: string }>;
  cancel: () => Promise<void>;
}

export function useSubscription(userId?: string): UseSubscriptionReturn {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscription, setSubscription] =
    useState<DoctorSubscriptionWithPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const [plansData, subData] = await Promise.all([
        fetchApi<SubscriptionPlan[]>("/api/doctors/billing/plans"),
        fetchApi<DoctorSubscriptionWithPlan | null>(
          "/api/doctors/billing/subscription",
        ).catch(() => null),
      ]);
      setPlans(plansData);
      setSubscription(subData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error loading subscription";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void fetchData();
  }, [userId, fetchData]);

  const subscribe = useCallback(
    async (planSlug: string): Promise<{ initPoint: string }> => {
      const result = await fetchApi<{ initPoint: string }>(
        "/api/doctors/billing/subscription",
        { method: "POST", body: { planSlug } },
      );
      void fetchData();
      return result;
    },
    [fetchData],
  );

  const cancel = useCallback(async () => {
    await fetchApi("/api/doctors/billing/subscription", { method: "DELETE" });
    void fetchData();
  }, [fetchData]);

  return { plans, subscription, loading, error, refresh: fetchData, subscribe, cancel };
}
