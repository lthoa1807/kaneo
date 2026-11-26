import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import TaskDrilldown from "./task-drilldown";
import type { DashboardBucket, DashboardTaskRow } from "./types";

const hook = vi.hoisted(() => ({ value: {} as { data?: unknown } }));

vi.mock("@/hooks/queries/dashboard/use-get-dashboard-drilldown", () => ({
  default: () => hook.value,
}));

vi.mock("react-i18next", async (original) => ({
  ...(await original<object>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => {
  hook.value = { data: undefined };
  // jsdom has no dialog implementation; only the open state matters here.
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
});

afterEach(cleanup);

const row = (id: string): DashboardTaskRow =>
  ({
    id,
    ticket: `KAN-${id}`,
    title: `Task ${id}`,
    projectId: "p1",
    projectName: "Billing revamp",
    assigneeId: null,
    assigneeName: null,
    priority: "high",
    dueDate: null,
  }) as DashboardTaskRow;

const bucket = (items: DashboardTaskRow[], total: number, truncated = false) =>
  ({
    items,
    total,
    truncated,
    urgent: 0,
    withinDays: 3,
  }) as unknown as DashboardBucket;

const drill = (value: DashboardBucket) => ({
  title: "Overdue",
  hint: "2 open tasks",
  filters: {},
  bucket: value,
});

it("renders one row per task in the bucket", () => {
  render(
    <TaskDrilldown
      drill={drill(bucket([row("1"), row("2")], 2))}
      workspaceId="w1"
      onClose={vi.fn()}
    />,
  );

  expect(screen.getByText("Task 1")).toBeVisible();
  expect(screen.getByText("Task 2")).toBeVisible();
  // header row + two task rows
  expect(screen.getAllByRole("row")).toHaveLength(3);
});

it("reports truncation in the footer only when the cap hit", () => {
  const { rerender } = render(
    <TaskDrilldown
      drill={drill(bucket([row("1")], 1))}
      workspaceId="w1"
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByText(/dashboard:drill\.cap/)).toBeNull();

  rerender(
    <TaskDrilldown
      drill={drill(bucket([row("1")], 68, true))}
      workspaceId="w1"
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByText(/dashboard:drill\.cap/)).toBeVisible();
});

it("shows the empty and loading states", () => {
  const { rerender } = render(
    <TaskDrilldown
      drill={drill(bucket([], 0))}
      workspaceId="w1"
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByText("dashboard:drill.empty")).toBeVisible();

  rerender(
    <TaskDrilldown
      drill={{
        title: "High priority",
        hint: "",
        filters: { priority: "high" },
      }}
      workspaceId="w1"
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByText("dashboard:drill.loading")).toBeVisible();
});
