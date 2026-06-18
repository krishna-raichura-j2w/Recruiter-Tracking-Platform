// Shared date/period helpers for the BH leaderboard and Candidates Status views.
// UTC-based to match the plain YYYY-MM-DD IST date strings used by the backend.

export function todayISO() { return new Date().toISOString().slice(0, 10); }

function isoUTC(d: Date) { return d.toISOString().slice(0, 10); }

export function addDaysUTC(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return isoUTC(d);
}

function mondayOfUTC(dateStr: string) {
  const dow = new Date(dateStr + 'T00:00:00Z').getUTCDay(); // 0=Sun..6=Sat
  return addDaysUTC(dateStr, -((dow + 6) % 7));             // back to Monday
}

// Mon–Sat (inclusive) window containing dateStr.
export function weekMonSat(dateStr: string) {
  const mon = mondayOfUTC(dateStr);
  return { start: mon, end: addDaysUTC(mon, 5) };
}

export function fmtDayMon(dateStr: string) {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', timeZone: 'UTC',
  });
}
