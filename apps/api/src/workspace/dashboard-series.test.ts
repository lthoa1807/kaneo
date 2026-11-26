import { describe, expect, it } from "vite-plus/test";
import {
  buildDueDaySeries,
  buildPrioritySeries,
  toBucket,
} from "./dashboard-series";

describe("buildPrioritySeries", () => {
  it("returns all five priorities in a fixed order when the query finds none", () => {
    expect(buildPrioritySeries([])).toEqual([
      { priority: "urgent", count: 0 },
      { priority: "high", count: 0 },
      { priority: "medium", count: 0 },
      { priority: "low", count: 0 },
      { priority: "no-priority", count: 0 },
    ]);
  });

  it("fills the priorities the query missed with zero", () => {
    const series = buildPrioritySeries([{ priority: "low", count: 7 }]);

    expect(series).toHaveLength(5);
    expect(series.find((row) => row.priority === "low")?.count).toBe(7);
    expect(series.find((row) => row.priority === "urgent")?.count).toBe(0);
  });

  it("drops a priority outside the five the dashboard draws", () => {
    const series = buildPrioritySeries([
      { priority: "critical", count: 3 },
      { priority: "urgent", count: 1 },
    ]);

    expect(series.map((row) => row.priority)).toEqual([
      "urgent",
      "high",
      "medium",
      "low",
      "no-priority",
    ]);
    expect(series.at(0)?.count).toBe(1);
  });
});

describe("buildDueDaySeries", () => {
  const now = new Date("2026-11-26T13:45:00.000Z");

  it("returns today plus the next six days even when nothing is due", () => {
    const series = buildDueDaySeries([], now);

    expect(series.map((row) => row.date)).toEqual([
      "2026-11-26",
      "2026-11-27",
      "2026-11-28",
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
    ]);
    expect(series.every((row) => row.count === 0 && row.urgent === 0)).toBe(
      true,
    );
  });

  it("merges the grouped counts into the matching day", () => {
    const series = buildDueDaySeries(
      [
        { date: "2026-11-26", count: 2, urgent: 1 },
        { date: "2026-12-02", count: 4, urgent: 4 },
      ],
      now,
    );

    expect(series[0]).toEqual({ date: "2026-11-26", count: 2, urgent: 1 });
    expect(series[6]).toEqual({ date: "2026-12-02", count: 4, urgent: 4 });
    expect(series[1]).toEqual({ date: "2026-11-27", count: 0, urgent: 0 });
  });

  it("ignores a day outside the seven-day window", () => {
    const series = buildDueDaySeries(
      [{ date: "2026-12-20", count: 9, urgent: 9 }],
      now,
    );

    expect(series).toHaveLength(7);
    expect(series.reduce((sum, row) => sum + row.count, 0)).toBe(0);
  });
});

describe("toBucket", () => {
  it("marks a bucket truncated when the exact total exceeds the returned rows", () => {
    const items = Array.from({ length: 50 }, (_, index) => index);

    expect(toBucket(items, 51)).toEqual({
      total: 51,
      items,
      truncated: true,
    });
  });

  it("is not truncated when every row fits", () => {
    expect(toBucket(["a", "b"], 2)).toEqual({
      total: 2,
      items: ["a", "b"],
      truncated: false,
    });
  });

  it("returns an empty bucket for a zero count", () => {
    expect(toBucket([], 0)).toEqual({ total: 0, items: [], truncated: false });
  });
});
