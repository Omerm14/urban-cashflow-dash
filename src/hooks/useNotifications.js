import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

const STORAGE_KEY = "cashflow_notifications_last_seen";

const apiFetch = async (path) => {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });
  let json;
  try { json = await res.json(); } catch { json = {}; }
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
};

export const useNotifications = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [lastSeenAt,    setLastSeenAt]    = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
  });

  const fetch = useCallback(async () => {
    if (!user) return;
    try {
      const { notifications: data } = await apiFetch("/api/notifications");
      setNotifications(data || []);
    } catch {
      // silent — notifications are non-critical
    }
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  const unreadCount = notifications.filter(n =>
    !lastSeenAt || new Date(n.created_at) > new Date(lastSeenAt)
  ).length;

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    try { localStorage.setItem(STORAGE_KEY, now); } catch {}
    setLastSeenAt(now);
  }, []);

  return { notifications, unreadCount, markAllRead, refresh: fetch };
};
