import { supabase } from "./supabase";

// Authenticated JSON fetch against our API — the one canonical copy
// (was duplicated in IntegrationsPage, useSyncJob, and useNotifications).
export const apiFetch = async (path, opts = {}) => {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body && typeof opts.body !== "string" ? JSON.stringify(opts.body) : opts.body,
  });
  let json;
  try { json = await res.json(); } catch { json = {}; }
  if (!res.ok) throw new Error(json.error || `Server error (${res.status}) — please try again`);
  return json;
};
