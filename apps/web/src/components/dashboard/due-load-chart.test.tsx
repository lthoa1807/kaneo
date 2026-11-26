import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";

vi.mock("react-i18next", async (original) => ({
  ...(await original<object>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

import DueLoadChart from "./due-load-chart";
import type { DashboardSummary } from "./types";

afterEach(cleanup);

const series = [
  { date: "2026-11-27", count: 4, urgent: 1 },
  { date: "2026-11-28", count: 0, urgent: 0 },
] satisfies DashboardSummary["charts"]["dueByDay"];

it("labels each day with its count, zero included", () => {
  render(<DueLoadChart series={series} onOpen={vi.fn()} />);

  expect(screen.getByRole("button", { name: "2026-11-27: 4" })).toBeVisible();
  expect(screen.getByRole("button", { name: "2026-11-28: 0" })).toBeVisible();
});

it("asks for the day it was clicked", () => {
  const onOpen = vi.fn();
  render(<DueLoadChart series={series} onOpen={onOpen} />);

  fireEvent.click(screen.getByRole("button", { name: "2026-11-28: 0" }));
  expect(onOpen).toHaveBeenCalledWith("2026-11-28");
});
