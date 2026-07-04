import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { apiFetch } from "../lib/api";

export const useIntegrationErrors = () => {
  const { user } = useAuth();
  const [hasError, setHasError] = useState(false);

  const fetch = useCallback(async () => {
    if (!user) return;
    try {
      const { integrations } = await apiFetch("/api/integrations");
      setHasError((integrations || []).some(i => i.status === "error"));
    } catch {
      // silent — this is a passive sidebar indicator, non-critical
    }
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  return { hasError, refresh: fetch };
};
