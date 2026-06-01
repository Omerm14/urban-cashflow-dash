import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

const apiFetch = async (path, method = "POST") => {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method,
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

// job shape: { jobId, totalFiles, filesFound, cursor, added, errors, done, error, integrationId, integrationType }

export const useSyncJob = ({ onBatchDone, onJobDone } = {}) => {
  const [jobs, setJobs] = useState({});   // keyed by integrationId
  const pollingRef = useRef(false);

  // Poll active jobs — one tick per 1.5s, driven by jobs state change
  useEffect(() => {
    const active = Object.entries(jobs).filter(([, j]) => j && !j.done && !j.error && j.jobId);
    if (!active.length || pollingRef.current) return;

    pollingRef.current = true;
    const t = setTimeout(async () => {
      const updates = {};
      await Promise.allSettled(active.map(async ([integrationId, job]) => {
        try {
          const res = await apiFetch(`/api/sync-jobs/${job.jobId}/process`);
          updates[integrationId] = { ...job, cursor: res.cursor, added: res.added, errors: res.errors, done: res.done };
          if (res.filesAdded?.length) onBatchDone?.(res.filesAdded);
          if (res.done) onJobDone?.(integrationId, res);
        } catch (err) {
          updates[integrationId] = { ...job, done: true, error: err.message };
        }
      }));
      setJobs(prev => ({ ...prev, ...updates }));
      pollingRef.current = false;
    }, 1500);

    return () => { clearTimeout(t); pollingRef.current = false; };
  }, [jobs, onBatchDone, onJobDone]);

  const startSync = useCallback(async (integrationId, syncEndpoint) => {
    const res = await apiFetch(syncEndpoint);
    if (res.jobId) {
      setJobs(prev => ({
        ...prev,
        [integrationId]: {
          jobId: res.jobId,
          totalFiles: res.totalFiles,
          filesFound: res.filesFound,
          cursor: 0,
          added: 0,
          errors: 0,
          done: false,
          error: null,
          integrationId,
        },
      }));
    }
    // Return full response so caller can handle no-job case (filesFound=0, jobId=null)
    return res;
  }, []);

  const clearJob = useCallback((integrationId) => {
    setJobs(prev => { const next = { ...prev }; delete next[integrationId]; return next; });
  }, []);

  const cancelSync = useCallback(async (integrationId) => {
    const job = jobs[integrationId];
    // Mark done locally immediately so polling stops
    setJobs(prev => prev[integrationId]
      ? { ...prev, [integrationId]: { ...prev[integrationId], done: true, cancelled: true } }
      : prev
    );
    // Tell the server to mark the DB row cancelled (fire-and-forget)
    if (job?.jobId) {
      apiFetch(`/api/sync-jobs/${job.jobId}/cancel`).catch(() => {});
    }
  }, [jobs]);

  // Aggregated status of the "most active" job for the global bar
  const activeJob = Object.values(jobs).find(j => j && !j.done && !j.error && j.jobId) || null;

  return { jobs, startSync, clearJob, cancelSync, activeJob };
};
