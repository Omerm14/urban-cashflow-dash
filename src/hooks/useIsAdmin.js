import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { apiFetch } from "../lib/api";

// Replaces the old, dead user_metadata.role check — nothing ever set that field. Admin
// status is decided server-side (ADMIN_EMAILS env var); this just asks once per session.
export const useIsAdmin = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    apiFetch("/api/admin/whoami")
      .then(({ isAdmin }) => setIsAdmin(!!isAdmin))
      .catch(() => setIsAdmin(false));
  }, [user]);

  return isAdmin;
};
