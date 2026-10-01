const pad = (n: number): string => String(n).padStart(2, "0");

export const todayISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function nextDate(dateStr: string, frequency: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  switch (frequency) {
    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case "biweekly":
      d.setUTCDate(d.getUTCDate() + 14);
      break;
    case "monthly":
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case "quarterly":
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
    case "annual":
    case "yearly":
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
  }
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function prevDate(dateStr: string, frequency: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  switch (frequency) {
    case "weekly":
      d.setUTCDate(d.getUTCDate() - 7);
      break;
    case "biweekly":
      d.setUTCDate(d.getUTCDate() - 14);
      break;
    case "monthly":
      d.setUTCMonth(d.getUTCMonth() - 1);
      break;
    case "quarterly":
      d.setUTCMonth(d.getUTCMonth() - 3);
      break;
    case "annual":
    case "yearly":
      d.setUTCFullYear(d.getUTCFullYear() - 1);
      break;
  }
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * "YYYY-MM-DD" for the viewer's LOCAL calendar day (upstream helper). In this
 * fork `todayISO()` is already the local day; this takes an explicit Date.
 */
export const localDateISO = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
