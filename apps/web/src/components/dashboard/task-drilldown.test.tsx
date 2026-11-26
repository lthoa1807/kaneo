import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import TaskDrilldown from "./task-drilldown";
import type { DashboardBucket, DashboardTaskRow } from "./types";

const hook = vi.hoisted(() => ({ value: {} as { data?: unknown } }));
const navigate = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/queries/dashboard/use-get-dashboard-drilldown", () => ({
  default: () => hook.value,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("react-i18next", async (original) => ({
  ...(await original<object>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => {
  hook.value = { data: undefined };
  navigate.mockClear();
  // jsdom has no dialog implementation; only open/close calls matter here.
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn();
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

it("opens the clicked task on its project board", () => {
  render(
    <TaskDrilldown
      drill={drill(bucket([row("1")], 1))}
      workspaceId="w1"
      onClose={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByText("Task 1"));

  expect(navigate).toHaveBeenCalledWith({
    to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
    params: { workspaceId: "w1", projectId: "p1" },
    search: { taskId: "1" },
  });
});

it("closes when the click lands outside the panel", () => {
  render(
    <TaskDrilldown
      drill={drill(bucket([row("1")], 1))}
      workspaceId="w1"
      onClose={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole("dialog"));
  expect(HTMLDialogElement.prototype.close).toHaveBeenCalled();

  vi.mocked(HTMLDialogElement.prototype.close).mockClear();
  fireEvent.click(screen.getByText("tasks:entity.task"));
  expect(HTMLDialogElement.prototype.close).not.toHaveBeenCalled();
});
