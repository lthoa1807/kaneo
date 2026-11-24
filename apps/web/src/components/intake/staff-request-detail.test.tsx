import { cleanup, render, screen } from "@testing-library/react";
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
const permissions = {
  canUpdateIntake: true,
  canManageIntake: true,
  canCreateTasks: true,
};

const request: IntakeRequest = {
  id: "request-1",
  projectId: "project-1",
  projectName: "Portal",
  projectSlug: "PE",
  number: 7,
  displayId: "REQ-7",
  title: "Export invoices",
  description: "CSV please",
  status: "new",
  createdById: "guest-1",
  requesterName: "Guest",
  requesterEmail: "guest@example.com",
  sourceType: "web",
  sourceId: null,
  externalReference: null,
  confirmedAt: null,
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-02T10:00:00Z",
  taskCount: 1,
  completedTaskCount: 0,
  linkedTasks: [
    { id: "task-1", number: 12, title: "Build the export", status: "to-do" },
  ],
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

vi.mock("@/hooks/mutations/intake/use-attach-intake-task", () => ({
  useAttachIntakeTask: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/queries/column/use-get-columns", () => ({
  useGetColumns: () => ({ data: [{ slug: "to-do", name: "To do" }] }),
}));

vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canUpdateIntake: () => permissions.canUpdateIntake,
    canManageIntake: () => permissions.canManageIntake,
    canCreateTasks: () => permissions.canCreateTasks,
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

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { StaffRequestDetail } = await import("./staff-request-detail");

beforeEach(() => {
  transitionMutate.mockReset();
  request.status = "new";
  permissions.canUpdateIntake = true;
  permissions.canManageIntake = true;
  permissions.canCreateTasks = true;
});

afterEach(cleanup);

function renderDetail() {
  return render(
    <StaffRequestDetail
      workspaceId="workspace-1"
      projectId="project-1"
      requestId="request-1"
    />,
  );
}

describe("StaffRequestDetail", () => {
  it("offers triage actions on a new request and hides attach-task", () => {
    renderDetail();

    expect(
      screen.getByRole("button", { name: "intake:detail.action.triaged" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "intake:detail.action.rejected" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "intake:staff.attachTask" }),
    ).toBeNull();
  });

  it("offers attach-task inside the attach window only", () => {
    request.status = "approved";
    renderDetail();
    expect(
      screen.getByRole("button", { name: "intake:staff.attachTask" }),
    ).toBeTruthy();
    cleanup();

    request.status = "delivered";
    renderDetail();
    expect(
      screen.queryByRole("button", { name: "intake:staff.attachTask" }),
    ).toBeNull();
  });

  it("offers no transition on confirmed or rejected", () => {
    request.status = "confirmed";
    renderDetail();
    expect(
      screen.queryByRole("button", { name: "intake:detail.action.approved" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "intake:detail.action.in_progress",
      }),
    ).toBeNull();
    cleanup();

    request.status = "rejected";
    renderDetail();
    expect(screen.queryAllByRole("button").length).toBe(0);
  });

  it("hides every transition from a viewer who can only read intake", () => {
    permissions.canUpdateIntake = false;
    request.status = "new";
    renderDetail();

    expect(screen.queryAllByRole("button").length).toBe(0);
  });

  it("shows linked tasks for staff", () => {
    renderDetail();

    expect(screen.getByText("intake:staff.linkedTasks")).toBeTruthy();
    expect(screen.getByText("PE-12 · Build the export")).toBeTruthy();
  });
});
