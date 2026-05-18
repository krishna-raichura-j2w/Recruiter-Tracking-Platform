import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import api from '../api/client';
import { useAuth } from './AuthContext';
import { useRealtime } from './RealtimeContext';

interface NavCounts {
  jobs:        number;
  validation:  number;
  submissions: number;
  candidates:  number;
  pipeline:    number;
}

const EMPTY: NavCounts = { jobs: 0, validation: 0, submissions: 0, candidates: 0, pipeline: 0 };

// Domains that should trigger a nav-counts refresh when their SSE signal fires
const WATCHED_DOMAINS = new Set(['jobs', 'candidates', 'validation', 'submissions', 'pipeline', 'dashboard']);

const Ctx = createContext<NavCounts>(EMPTY);

export function NavCountsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { signals } = useRealtime();
  const [counts, setCounts] = useState<NavCounts>(EMPTY);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track last seen signal totals to detect any domain change
  const prevSignalSum = useRef(0);

  const fetchCounts = useCallback(() => {
    if (!user) return;
    api.get<NavCounts>('/dashboard/nav-counts')
      .then(r => setCounts(r.data))
      .catch(() => {});
  }, [user]);

  // Initial fetch + 60s fallback poll
  useEffect(() => {
    if (!user) { setCounts(EMPTY); return; }
    fetchCounts();
    timerRef.current = setInterval(fetchCounts, 60_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchCounts, user]);

  // Re-fetch immediately whenever any watched SSE domain fires
  useEffect(() => {
    const sum = Object.entries(signals)
      .filter(([domain]) => WATCHED_DOMAINS.has(domain))
      .reduce((acc, [, v]) => acc + v, 0);
    if (sum !== prevSignalSum.current) {
      prevSignalSum.current = sum;
      fetchCounts();
    }
  }, [signals, fetchCounts]);

  return <Ctx.Provider value={counts}>{children}</Ctx.Provider>;
}

export const useNavCounts = () => useContext(Ctx);
