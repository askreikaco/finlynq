function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localDateStr(y: number, mo: number, d: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/**
 * Returns the `{ start, end }` date range for a named preset.
 *
 * Accepts an optional `now` date (defaults to `new Date()`) so the function
 * can be unit-tested with deterministic fixed dates.
 */
export function getPresetRange(preset: string, now: Date = new Date()): { start: string; end: string } {
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed
  const end = todayISO();

  switch (preset) {
    case "mtd":
      return { start: localDateStr(y, m + 1, 1), end };
    case "qtd": {
      const qStart = Math.floor(m / 3) * 3;
      return { start: localDateStr(y, qStart + 1, 1), end };
    }
    case "ytd":
      return { start: `${y}-01-01`, end };
    case "last-month": {
      const lm = m === 0 ? 11 : m - 1;
      const ly = m === 0 ? y - 1 : y;
      const days = new Date(ly, lm + 1, 0).getDate();
      return {
        start: localDateStr(ly, lm + 1, 1),
        end: localDateStr(ly, lm + 1, days),
      };
    }
    case "last-quarter": {
      const cq = Math.floor(m / 3);
      const lq = cq === 0 ? 3 : cq - 1;
      const lqy = cq === 0 ? y - 1 : y;
      const qsm = lq * 3;
      const qem = qsm + 2;
      const qed = new Date(lqy, qem + 1, 0).getDate();
      return {
        start: localDateStr(lqy, qsm + 1, 1),
        end: localDateStr(lqy, qem + 1, qed),
      };
    }
    case "last-year":
      return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` };
    case "last-12": {
      // end = last day of the prior (most recently completed) month.
      // new Date(y, m, 0) = day 0 of current month = last day of the prior month.
      const endD = new Date(y, m, 0);
      // start = first day of the month 12 months before the current month.
      // new Date(y, m - 12, 1) handles year roll-back and leap years natively.
      const startD = new Date(y, m - 12, 1);
      return {
        start: localDateStr(startD.getFullYear(), startD.getMonth() + 1, 1),
        end: localDateStr(endD.getFullYear(), endD.getMonth() + 1, endD.getDate()),
      };
    }
    default: {
      // Fallback: current year-to-date (same as "ytd") — safe, no partial months.
      return { start: `${y}-01-01`, end };
    }
  }
}
