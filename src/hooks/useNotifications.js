import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";

const STORAGE_KEY = "cashflow_notifications_last_seen";

import { apiFetch } from "../lib/api";

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
      // Group consecutive saved events from the same integration within 2 minutes
      // into a single sync_summary entry (e.g. "Drive sync · 3 new invoices")
      const WINDOW_MS = 2 * 60 * 1000;
      const grouped = [];
      for (const n of (data || [])) {
        if (n.event_type === "saved") {
          const last = grouped[grouped.length - 1];
          if (last?.type === "sync_summary" &&
              last.integration_type === n.integration_type &&
              new Date(last.created_at) - new Date(n.created_at) < WINDOW_MS) {
            last.count++;
          } else {
            grouped.push({ ...n, type: "sync_summary", count: 1 });
          }
        } else {
          grouped.push(n);
        }
      }
      setNotifications(grouped);
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
