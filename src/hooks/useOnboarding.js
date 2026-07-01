import { useState, useCallback, useEffect } from 'react';

// phase: 'welcome' | 'tour' | 'celebrate' | 'idle'
export function useOnboarding({ userId, invoices, suppliers }) {
  const seenKey    = userId ? `ob_seen_${userId}`      : null;
  const tasksKey   = userId ? `ob_tasks_${userId}`     : null;
  const dismissKey = userId ? `ob_checklist_${userId}` : null;

  const [phase,            setPhase]            = useState('idle');
  const [tourStep,         setTourStep]         = useState(0);
  const [checklistVisible, setChecklistVisible] = useState(false);
  const [tasks, setTasks] = useState({ dashboard: false, upload: false, integrations: false, suppliers: false });

  // Initialize once userId is known
  useEffect(() => {
    if (!seenKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(tasksKey) || '{}');
      setTasks(t => ({ ...t, ...saved }));
    } catch {}

    const seen      = localStorage.getItem(seenKey);
    const dismissed = localStorage.getItem(dismissKey);

    if (!seen) {
      setPhase('welcome');
    } else if (!dismissed) {
      setChecklistVisible(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seenKey]);

  // Auto-check upload / suppliers tasks when data arrives
  useEffect(() => {
    if (!tasksKey) return;
    setTasks(prev => {
      const next = {
        ...prev,
        upload:    prev.upload    || !!(invoices  && invoices.length  > 0),
        suppliers: prev.suppliers || !!(suppliers && suppliers.length > 0),
      };
      if (next.upload !== prev.upload || next.suppliers !== prev.suppliers) {
        localStorage.setItem(tasksKey, JSON.stringify(next));
        return next;
      }
      return prev;
    });
  }, [invoices?.length, suppliers?.length, tasksKey]);

  const saveTasks = useCallback((updater) => {
    setTasks(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (tasksKey) localStorage.setItem(tasksKey, JSON.stringify(next));
      return next;
    });
  }, [tasksKey]);

  const markTaskDone = useCallback((key) => {
    saveTasks(prev => ({ ...prev, [key]: true }));
  }, [saveTasks]);

  // Called from "Let's go" on welcome modal
  const beginTour = useCallback(() => {
    setTourStep(0);
    setPhase('tour');
  }, []);

  // Called from "Skip tour" on welcome modal
  const skipWelcome = useCallback(() => {
    if (seenKey) localStorage.setItem(seenKey, '1');
    setPhase('idle');
    saveTasks(prev => ({ ...prev, dashboard: true }));
    const dismissed = localStorage.getItem(dismissKey);
    if (!dismissed) setChecklistVisible(true);
  }, [seenKey, dismissKey, saveTasks]);

  // Called when tour finishes (last step Finish button)
  const finishTour = useCallback(() => {
    if (seenKey) localStorage.setItem(seenKey, '1');
    saveTasks(prev => ({ ...prev, dashboard: true }));
    setPhase('celebrate');
    setTimeout(() => {
      setPhase('idle');
      const dismissed = localStorage.getItem(dismissKey);
      if (!dismissed) setChecklistVisible(true);
    }, 2400);
  }, [seenKey, dismissKey, saveTasks]);

  // Called when user skips mid-tour
  const skipTour = useCallback(() => {
    if (seenKey) localStorage.setItem(seenKey, '1');
    saveTasks(prev => ({ ...prev, dashboard: true }));
    setPhase('idle');
    const dismissed = localStorage.getItem(dismissKey);
    if (!dismissed) setChecklistVisible(true);
  }, [seenKey, dismissKey, saveTasks]);

  // Re-trigger from NavBar
  const startFromWelcome = useCallback(() => {
    setTourStep(0);
    setPhase('welcome');
  }, []);

  const nextStep = useCallback(() => setTourStep(s => s + 1), []);
  const prevStep = useCallback(() => setTourStep(s => Math.max(0, s - 1)), []);

  const dismissChecklist = useCallback(() => {
    setChecklistVisible(false);
    if (dismissKey) localStorage.setItem(dismissKey, '1');
  }, [dismissKey]);

  const allDone = Object.values(tasks).every(Boolean);

  return {
    phase,
    tourStep,
    checklistVisible: checklistVisible && !allDone,
    checklistAllDone: allDone && checklistVisible,
    tasks,
    beginTour,
    skipWelcome,
    finishTour,
    skipTour,
    nextStep,
    prevStep,
    markTaskDone,
    dismissChecklist,
    startFromWelcome,
  };
}
