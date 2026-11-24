import { describe, expect, it } from "vite-plus/test";
import {
  guestActionsFor,
  INTAKE_STATUSES,
  isIntakeStatus,
  isTerminalStatus,
  staffActionsFor,
} from "./intake-status";

describe("guestActionsFor", () => {
  it("offers confirm and revision only on delivered", () => {
    expect(guestActionsFor("delivered")).toEqual([
      { to: "confirmed", noteRequired: false },
      { to: "needs_revision", noteRequired: true },
    ]);
    for (const status of INTAKE_STATUSES.filter((s) => s !== "delivered")) {
      expect(guestActionsFor(status)).toEqual([]);
    }
  });
});

describe("staffActionsFor", () => {
  it("matches the spec transition table", () => {
    expect(staffActionsFor("new").map((a) => a.to)).toEqual([
      "triaged",
      "approved",
      "rejected",
    ]);
    expect(staffActionsFor("triaged").map((a) => a.to)).toEqual([
      "approved",
      "rejected",
    ]);
    expect(staffActionsFor("approved").map((a) => a.to)).toEqual([
      "in_progress",
    ]);
    expect(staffActionsFor("needs_revision").map((a) => a.to)).toEqual([
      "in_progress",
    ]);
    expect(staffActionsFor("in_progress").map((a) => a.to)).toEqual([
      "delivered",
    ]);
    for (const status of ["delivered", "confirmed", "rejected"] as const) {
      expect(staffActionsFor(status)).toEqual([]);
    }
    expect(staffActionsFor("new").find((a) => a.to === "rejected")).toEqual({
      to: "rejected",
      noteRequired: true,
    });
  });
});

describe("isIntakeStatus", () => {
  it("accepts only the lifecycle statuses", () => {
    for (const status of INTAKE_STATUSES) {
      expect(isIntakeStatus(status)).toBe(true);
    }
    expect(isIntakeStatus("done")).toBe(false);
  });
});

describe("isTerminalStatus", () => {
  it("treats rejected and confirmed as the end of the line", () => {
    expect(INTAKE_STATUSES.filter(isTerminalStatus)).toEqual([
      "rejected",
      "confirmed",
    ]);
  });
});
