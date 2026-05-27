import dayjs from "dayjs";

/** "24 May 2026, 01:30 AM" — standard datetime display used across all tables. */
export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = dayjs(value);
  return d.isValid() ? d.format("DD MMM YYYY, hh:mm A") : "—";
}

/** "24 May 2026" — date-only display (no time). */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = dayjs(value);
  return d.isValid() ? d.format("DD MMM YYYY") : "—";
}
