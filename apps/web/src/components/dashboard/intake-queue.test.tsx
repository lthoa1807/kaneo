import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type { ReactNode } from "react";
import IntakeQueue from "./intake-queue";

const intake = vi.hoisted(() => ({
  byStatus: {} as Record<string, { items: unknown[]; total: number }>,
}));

vi.mock("@/hooks/queries/intake/use-get-intake-requests", () => ({
  default: ({ status }: { status: string }) => ({
    data: intake.byStatus[status],
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("react-i18next", async (original) => ({
  ...(await original<object>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

const request = (id: number) => ({
  id: `r${id}`,
  title: `Request ${id}`,
  displayId: `REQ-${id}`,
  projectId: "p1",
  projectName: "Billing",
  createdAt: new Date().toISOString(),
});

it("caps each group at four rows and keeps the real totals", () => {
  intake.byStatus = {
    new: { items: [1, 2, 3].map(request), total: 3 },
    triaged: { items: [4, 5, 6].map(request), total: 7 },
    in_progress: { items: [], total: 0 },
  };
  render(<IntakeQueue workspaceId="w1" />);

  expect(screen.getAllByRole("listitem")).toHaveLength(4);
  expect(screen.getByText("10")).toBeVisible();
});

it("shows the empty copy for a group with nothing waiting", () => {
  intake.byStatus = {
    new: { items: [], total: 0 },
    triaged: { items: [], total: 0 },
    in_progress: { items: [request(1)], total: 1 },
  };
  render(<IntakeQueue workspaceId="w1" />);

  expect(screen.getByText("dashboard:intake.empty")).toBeVisible();
  expect(screen.getByText("Request 1")).toBeVisible();
});
