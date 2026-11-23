import { describe, expect, it } from "vite-plus/test";
import { evaluateProjectFieldFormula } from "./formula";
import type { ProjectFieldFormula } from "./types";

function values(entries: Record<string, string | null>) {
  return new Map(Object.entries(entries));
}

describe("evaluateProjectFieldFormula", () => {
  const dayDiff: ProjectFieldFormula = {
    kind: "date_diff",
    fromFieldId: "from",
    toFieldId: "to",
    unit: "day",
  };

  it("returns signed whole days as to minus from", () => {
    expect(
      evaluateProjectFieldFormula(
        dayDiff,
        values({ from: "2026-01-03", to: "2026-01-01" }),
      ),
    ).toBe("-2");
    expect(
      evaluateProjectFieldFormula(
        dayDiff,
        values({ from: "2026-01-01", to: "2026-01-03" }),
      ),
    ).toBe("2");
    expect(
      evaluateProjectFieldFormula(
        dayDiff,
        values({ from: "2026-02-27", to: "2026-03-01" }),
      ),
    ).toBe("2");
  });

  it("returns signed complete calendar months", () => {
    const monthDiff: ProjectFieldFormula = { ...dayDiff, unit: "month" };
    expect(
      evaluateProjectFieldFormula(
        monthDiff,
        values({ from: "2026-01-31", to: "2026-02-28" }),
      ),
    ).toBe("0");
    expect(
      evaluateProjectFieldFormula(
        monthDiff,
        values({ from: "2026-01-31", to: "2026-03-01" }),
      ),
    ).toBe("1");
    expect(
      evaluateProjectFieldFormula(
        monthDiff,
        values({ from: "2026-03-01", to: "2026-01-31" }),
      ),
    ).toBe("-1");
    expect(
      evaluateProjectFieldFormula(
        monthDiff,
        values({ from: "2026-03-02", to: "2026-01-03" }),
      ),
    ).toBe("-1");
  });

  it("adds day and month amounts with UTC calendar arithmetic", () => {
    const addMonth: ProjectFieldFormula = {
      kind: "date_add",
      fromFieldId: "from",
      amount: 1,
      unit: "month",
    };
    expect(
      evaluateProjectFieldFormula(addMonth, values({ from: "2028-01-31" })),
    ).toBe("2028-02-29");
    expect(
      evaluateProjectFieldFormula(addMonth, values({ from: "2027-01-31" })),
    ).toBe("2027-02-28");

    const addDay: ProjectFieldFormula = { ...addMonth, unit: "day", amount: 3 };
    expect(
      evaluateProjectFieldFormula(addDay, values({ from: "2026-12-30" })),
    ).toBe("2027-01-02");
  });

  it("rejects fractional calendar amounts", () => {
    const formula: ProjectFieldFormula = {
      kind: "date_add",
      fromFieldId: "from",
      amount: 1.5,
      unit: "month",
    };
    expect(
      evaluateProjectFieldFormula(formula, values({ from: "2026-01-01" })),
    ).toBeNull();
  });

  it("evaluates number arithmetic with two-decimal rounding", () => {
    const add: ProjectFieldFormula = {
      kind: "number",
      op: "add",
      leftFieldId: "left",
      rightFieldId: "right",
    };
    expect(
      evaluateProjectFieldFormula(add, values({ left: "1.23", right: "2.23" })),
    ).toBe("3.46");
    expect(
      evaluateProjectFieldFormula(add, values({ left: "1.234", right: "1" })),
    ).toBe("2.23");

    expect(
      evaluateProjectFieldFormula(
        { ...add, op: "divide" },
        values({ left: "1", right: "0" }),
      ),
    ).toBeNull();
    expect(
      evaluateProjectFieldFormula(
        { ...add, op: "subtract" },
        values({ left: "10.5", right: "0.5" }),
      ),
    ).toBe("10");
    expect(
      evaluateProjectFieldFormula(
        { ...add, op: "multiply" },
        values({ left: "-2", right: "1.005" }),
      ),
    ).toBe("-2.01");
  });

  it("returns null for missing, malformed, or non-finite inputs", () => {
    expect(
      evaluateProjectFieldFormula(dayDiff, values({ from: "2026-01-01" })),
    ).toBeNull();
    expect(
      evaluateProjectFieldFormula(
        dayDiff,
        values({ from: "2026-02-30", to: "2026-03-01" }),
      ),
    ).toBeNull();
    expect(
      evaluateProjectFieldFormula(
        dayDiff,
        values({ from: "2026-01-01T10:00:00Z", to: "2026-03-01" }),
      ),
    ).toBeNull();

    const add: ProjectFieldFormula = {
      kind: "number",
      op: "add",
      leftFieldId: "left",
      rightFieldId: "right",
    };
    expect(
      evaluateProjectFieldFormula(add, values({ left: "abc", right: "1" })),
    ).toBeNull();
    expect(
      evaluateProjectFieldFormula(
        add,
        values({ left: "1e400", right: "Infinity" }),
      ),
    ).toBeNull();
  });
});
