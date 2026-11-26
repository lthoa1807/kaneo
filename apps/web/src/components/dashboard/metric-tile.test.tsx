import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import MetricTile from "./metric-tile";

afterEach(cleanup);

it("shows a real zero instead of an empty value", () => {
  render(<MetricTile label="Open" value={0} />);
  expect(screen.getByText("0")).toBeVisible();
});

it("shows a dash until the count arrives", () => {
  render(<MetricTile label="Open" value={undefined} />);
  expect(screen.getByText("—")).toBeVisible();
});

it("is a button only when a drilldown exists", () => {
  const onOpen = vi.fn();
  const { rerender } = render(<MetricTile label="Open" value={2} />);
  expect(screen.queryByRole("button")).toBeNull();

  rerender(<MetricTile label="Open" value={2} onOpen={onOpen} />);
  fireEvent.click(screen.getByRole("button"));
  expect(onOpen).toHaveBeenCalledOnce();
});
