import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { IntakeActivity } from "@/types/intake";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (key === "intake:activity.you") return "You";
      if (key === "intake:activity.team") return "Team";
      const entries = Object.entries(params ?? {});
      return entries.length === 0
        ? key
        : `${key}|${entries.map(([name, value]) => `${name}=${value}`).join(",")}`;
    },
  }),
}));

vi.mock("@/lib/format", () => ({
  formatRelativeTime: () => "yesterday",
}));

const { IntakeActivityList } = await import("./intake-activity-list");

afterEach(cleanup);

function activity(
  id: string,
  type: string,
  userId: string,
  rest: { content?: string | null; to?: string } = {},
): IntakeActivity {
  return {
    id,
    type,
    userId,
    content: rest.content ?? null,
    eventData: rest.to ? { from: "x", to: rest.to } : null,
    createdAt: "2026-11-01T10:00:00Z",
  } as IntakeActivity;
}

const items = [
  activity("a9", "confirmed", "guest-1", { to: "confirmed" }),
  activity("a8", "status_changed", "guest-1", { to: "confirmed" }),
  activity("a7", "status_changed", "guest-1", {
    to: "needs_revision",
    content: "Still missing CSV",
  }),
  activity("a6", "status_changed", "staff-1", {
    to: "delivered",
    content: "Added CSV",
  }),
  activity("a5", "status_changed", "staff-1", {
    to: "delivered",
    content: "First pass",
  }),
  activity("a4", "status_changed", "staff-1", { to: "in_progress" }),
  activity("a3", "status_changed", "staff-1", { to: "triaged" }),
  activity("a2", "created", "guest-1"),
  activity("a1", "task_linked", "staff-1", { content: "Linked build task" }),
];

describe("IntakeActivityList", () => {
  it("says what happened, with You or Team as the actor", () => {
    render(<IntakeActivityList items={items} currentUserId="guest-1" />);

    expect(screen.getByText("intake:activity.created|actor=You")).toBeTruthy();
    expect(
      screen.getByText("intake:activity.received|actor=Team"),
    ).toBeTruthy();
    expect(screen.getByText("intake:activity.started|actor=Team")).toBeTruthy();
    expect(
      screen.getByText(
        "intake:activity.feedback|actor=You,note=Still missing CSV",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("intake:activity.confirmed|actor=You"),
    ).toBeTruthy();
  });

  it("distinguishes the first delivery from a delivery in the feedback loop", () => {
    render(<IntakeActivityList items={items} currentUserId="guest-1" />);

    expect(
      screen.getByText(
        "intake:activity.deliveredWithNote|actor=Team,note=First pass",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "intake:activity.deliveredAgain|actor=Team,note=Added CSV",
      ),
    ).toBeTruthy();
  });

  it("drops the note suffix when a delivery carries no reply", () => {
    const deliveries = [
      activity("b2", "status_changed", "staff-1", { to: "delivered" }),
      activity("b1", "status_changed", "staff-1", { to: "delivered" }),
    ];
    render(<IntakeActivityList items={deliveries} currentUserId="guest-1" />);

    expect(
      screen.getByText("intake:activity.deliveredAgainNoNote|actor=Team"),
    ).toBeTruthy();
    expect(
      screen.getByText("intake:activity.delivered|actor=Team"),
    ).toBeTruthy();
  });

  it("renders one confirmation, not the internal status row next to it", () => {
    render(<IntakeActivityList items={items} currentUserId="guest-1" />);

    expect(screen.getAllByText(/^intake:activity\.confirmed\|/)).toHaveLength(
      1,
    );
  });

  it("hides task_linked entries", () => {
    render(<IntakeActivityList items={items} currentUserId="guest-1" />);

    expect(screen.queryByText("Linked build task")).toBeNull();
  });
});
