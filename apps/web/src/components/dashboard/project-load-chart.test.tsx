import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";

vi.mock("react-i18next", async (original) => ({
  ...(await original<object>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

import ProjectLoadChart from "./project-load-chart";
import type { DashboardSummary } from "./types";

afterEach(cleanup);

it("says so when the workspace has no open tasks", () => {
  render(<ProjectLoadChart series={[]} onOpen={vi.fn()} />);
  expect(screen.getByText("dashboard:drill.empty")).toBeVisible();
});

it("names each project with its count and opens that project", () => {
  const onOpen = vi.fn();
  const series = [
    { projectId: "p1", name: "Billing revamp", count: 7 },
    { projectId: "p2", name: "Reporting", count: 0 },
  ] satisfies DashboardSummary["charts"]["byProject"];
  render(<ProjectLoadChart series={series} onOpen={onOpen} />);

  fireEvent.click(screen.getByRole("button", { name: "Billing revamp: 7" }));
  expect(onOpen).toHaveBeenCalledWith("p1");
  expect(screen.getByRole("button", { name: "Reporting: 0" })).toBeVisible();
});
