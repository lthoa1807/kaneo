import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import PriorityDonut from "./priority-donut";
import type { DashboardSummary } from "./types";

vi.mock("react-i18next", async (original) => ({
  ...(await original<object>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

const series = [
  { priority: "urgent", count: 3 },
  { priority: "high", count: 2 },
  { priority: "medium", count: 0 },
  { priority: "low", count: 1 },
  { priority: "no-priority", count: 0 },
] satisfies DashboardSummary["charts"]["byPriority"];

it("keeps every value in the legend and the geometry decorative", () => {
  render(<PriorityDonut series={series} onOpen={vi.fn()} />);

  expect(document.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(screen.getAllByRole("button")).toHaveLength(5);
  expect(screen.getByText("3")).toBeVisible();
  expect(
    screen.getByRole("button", { name: /tasks:priority\.medium/ }),
  ).toHaveTextContent("0");
});

it("opens the segment the legend row names", () => {
  const onOpen = vi.fn();
  render(<PriorityDonut series={series} onOpen={onOpen} />);

  fireEvent.click(screen.getByRole("button", { name: /tasks:priority\.high/ }));
  expect(onOpen).toHaveBeenCalledWith("high");
});
