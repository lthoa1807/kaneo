import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import DeadlineRisk from "./deadline-risk";

afterEach(cleanup);

it("shows both counts, a real zero and the extra line", () => {
  const onOverdue = vi.fn();
  render(
    <DeadlineRisk
      title="Deadline risk"
      hint="Open tasks only"
      blocks={[
        { label: "Overdue", value: 0, meta: "3 critical", onOpen: onOverdue },
        { label: "Due soon", value: 5, onOpen: vi.fn() },
      ]}
    />,
  );

  expect(screen.getByRole("heading", { name: "Deadline risk" })).toBeVisible();
  expect(screen.getByText("0")).toBeVisible();
  expect(screen.getByText("3 critical")).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: /Overdue/ }));
  expect(onOverdue).toHaveBeenCalledOnce();
});
