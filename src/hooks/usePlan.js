import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { PLAN_LIMITS } from '../constants/plans';

export const usePlan = () => {
  const { user, session } = useAuth();
  const [plan,    setPlan]    = useState('free');
  const [used,    setUsed]    = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      // Use the server endpoint so ensureSubscription runs (idempotent upsert)
      const res = await fetch('/api/billing/usage', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPlan(data.plan || 'free');
        setUsed(data.used  || 0);
      }
    } catch {
      // Fall back to direct Supabase read
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const [{ data: sub }, { count }] = await Promise.all([
        supabase.from('subscriptions').select('plan').eq('user_id', user.id).single(),
        supabase.from('invoices').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).gte('created_at', monthStart),
      ]);
      setPlan(sub?.plan || 'free');
      setUsed(count || 0);
    } finally {
      setLoading(false);
    }
  }, [user, session]);

  useEffect(() => { refresh(); }, [refresh]);

  const limit       = PLAN_LIMITS[plan] ?? 20;
  const remaining   = limit === Infinity ? Infinity : Math.max(0, limit - used);
  const pct         = limit === Infinity ? 0 : used / limit;
  const isAtLimit   = pct >= 1;
  const isNearLimit = pct >= 0.8 && !isAtLimit;

  return { plan, limit, used, remaining, pct, isAtLimit, isNearLimit, loading, refresh };
};
