import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { IntakeRequest } from "@/types/intake";

const transitionMutate = vi.fn();
const refetch = vi.fn();

const request: IntakeRequest = {
  id: "request-1",
  projectId: "project-1",
  projectName: "Portal",
  number: 1,
  displayId: "REQ-1",
  title: "Export invoices",
  description: "CSV please",
  status: "delivered",
  createdById: "guest-1",
  requesterName: "Guest",
  requesterEmail: "guest@example.com",
  sourceType: "web",
  sourceId: null,
  externalReference: null,
  confirmedAt: null,
  createdAt: new Date("2026-11-01T10:00:00Z"),
  updatedAt: new Date("2026-11-02T10:00:00Z"),
  taskCount: 1,
  completedTaskCount: 1,
};

vi.mock("@/hooks/queries/intake/use-get-intake-request", () => ({
  default: () => ({ data: request, isLoading: false, isError: false, refetch }),
}));

vi.mock("@/hooks/queries/intake/use-get-intake-activity", () => ({
  default: () => ({ data: { items: [] } }),
}));

vi.mock("@/hooks/mutations/intake/use-transition-intake-request", () => ({
  useTransitionIntakeRequest: () => ({
    mutate: transitionMutate,
    isPending: false,
  }),
}));

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/format", () => ({
  formatRelativeTime: () => "yesterday",
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const { GuestRequestDetail } = await import("./guest-request-detail");

beforeEach(() => {
  transitionMutate.mockReset();
});

afterEach(cleanup);

function renderDetail() {
  return render(
    <GuestRequestDetail
      workspaceId="workspace-1"
      projectId="project-1"
      requestId="request-1"
    />,
  );
}

describe("GuestRequestDetail", () => {
  it("shows confirm and request-revision on a delivered request", () => {
    renderDetail();

    expect(
      screen.getByRole("button", { name: "intake:detail.action.confirmed" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "intake:detail.action.needs_revision",
      }),
    ).toBeTruthy();
  });

  it("confirms a delivered request in one click", () => {
    renderDetail();

    fireEvent.click(
      screen.getByRole("button", { name: "intake:detail.action.confirmed" }),
    );

    expect(transitionMutate).toHaveBeenCalledWith(
      { requestId: "request-1", to: "confirmed", note: undefined },
      expect.anything(),
    );
  });

  it("refuses to submit a revision without a note", () => {
    renderDetail();

    fireEvent.click(
      screen.getByRole("button", {
        name: "intake:detail.action.needs_revision",
      }),
    );

    expect(
      screen.getByRole("button", { name: "intake:note.confirm" }),
    ).toHaveProperty("disabled", true);
    expect(transitionMutate).not.toHaveBeenCalled();
  });

  it("shows no action on a confirmed request", () => {
    request.status = "confirmed";
    request.confirmedAt = new Date("2026-11-03T10:00:00Z");
    renderDetail();

    expect(
      screen.queryByRole("button", { name: "intake:detail.action.confirmed" }),
    ).toBeNull();
    expect(screen.getByText("intake:detail.confirmedOn")).toBeTruthy();
    request.status = "delivered";
    request.confirmedAt = null;
  });

  it("never renders linked task internals", () => {
    renderDetail();

    expect(screen.getByText("CSV please")).toBeTruthy();
    expect(screen.queryByText("REQ-1")).toBeTruthy();
  });
});
