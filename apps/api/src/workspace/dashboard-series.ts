/** Fixed order the donut draws, whatever the query returns. */
export const DASHBOARD_PRIORITIES = [
  "urgent",
  "high",
  "medium",
  "low",
  "no-priority",
] as const;

export const BUCKET_ITEM_LIMIT = 50;

export const DUE_SOON_DAYS = 3;
export type DueSoonDays = typeof DUE_SOON_DAYS;

export type PriorityCountRow = { priority: string; count: number };
export type DueDayRow = { date: string; count: number; urgent: number };

/**
 * The payload always carries all five priorities, zeroes included, so the
 * donut and its legend have stable segments and the client never sorts.
 */
export function buildPrioritySeries(rows: PriorityCountRow[]) {
  const counts = new Map(
    rows.map((row) => [row.priority, Number(row.count)] as const),
  );

  return DASHBOARD_PRIORITIES.map((priority) => ({
    priority,
    count: counts.get(priority) ?? 0,
  }));
}

function utcDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Seven consecutive days starting today, zeroes included. Days are cut in UTC
 * because `task.due_date` is a timestamp without time zone holding UTC.
 */
export function buildDueDaySeries(rows: DueDayRow[], now: Date) {
  const byDate = new Map(rows.map((row) => [row.date, row] as const));
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  return Array.from({ length: 7 }, (_, index) => {
    const date = utcDay(new Date(start + index * 86_400_000));
    const row = byDate.get(date);

    return {
      date,
      count: Number(row?.count ?? 0),
      urgent: Number(row?.urgent ?? 0),
    };
  });
}

/** `total` is the exact count; the rows are only the first page of it. */
export function toBucket<T>(items: T[], total: number) {
  return { total, items, truncated: total > items.length };
}
