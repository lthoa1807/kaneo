import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { IntakeRequestListItem } from "@/types/intake";

const mockGetIntakeRequests = vi.fn();
const mockGetIntakeRequestPages = vi.fn();

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

vi.mock("@/hooks/queries/intake/use-get-intake-requests", () => ({
  default: (args: unknown) => mockGetIntakeRequests(args),
}));

vi.mock("@/hooks/queries/intake/use-get-intake-request-pages", () => ({
  default: (args: unknown) => mockGetIntakeRequestPages(args),
}));

vi.mock("./intake-request-form-modal", () => ({
  IntakeRequestFormModal: () => null,
}));

vi.mock("@/lib/format", () => ({
  formatRelativeTime: () => "3 days ago",
}));

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (
      key: string,
      options?: { count?: number; total?: number; label?: string },
    ) => {
      if (options?.label !== undefined) {
        return `${key}:${options.label}:${options.count}`;
      }
      if (options?.total !== undefined) return `${key}:${options.total}`;
      if (options?.count !== undefined) return `${key}:${options.count}`;
      return key;
    },
  }),
}));

const { GuestPortalPage } = await import("./guest-portal-page");

function item(
  overrides: Partial<IntakeRequestListItem>,
): IntakeRequestListItem {
  return {
    id: "request-1",
    projectId: "project-1",
    projectName: "Portal",
    number: 1,
    displayId: "REQ-1",
    title: "Export invoices",
    description: null,
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
    taskCount: 0,
    completedTaskCount: 0,
    ...overrides,
  } as IntakeRequestListItem;
}

const openItem = item({});
const closedItem = item({
  id: "request-2",
  displayId: "REQ-2",
  title: "Dark mode",
  status: "confirmed",
});

const counts = { all: 2, waiting: 1, in_progress: 1, awaiting: 0 };

function page(overrides: Record<string, unknown> = {}) {
  return {
    items: [openItem, closedItem],
    total: 2,
    counts,
    page: 1,
    pageSize: 100,
    totalPages: 1,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetIntakeRequests.mockReset();
  mockGetIntakeRequestPages.mockReset();
  mockGetIntakeRequests.mockReturnValue({
    data: page(),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  mockGetIntakeRequestPages.mockReturnValue({
    items: [],
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  });
});

afterEach(cleanup);

function renderPage(projectId?: string) {
  return render(
    <GuestPortalPage workspaceId="workspace-1" projectId={projectId} />,
  );
}

describe("GuestPortalPage", () => {
  it("renders the overview with server counts and the five-column list", () => {
    renderPage();

    expect(screen.getByText("intake:portal.overview")).toBeTruthy();
    expect(screen.getByText("intake:portal.overviewHint:2")).toBeTruthy();
    expect(screen.getByText("intake:list.columns.received")).toBeTruthy();
    expect(screen.getAllByText("3 days ago")).toHaveLength(2);
    expect(
      screen.getByRole("button", {
        name: "intake:portal.legendName:intake:portal.group.in_progress:1",
      }),
    ).toBeTruthy();
  });

  it("filters by group without changing the counts", () => {
    mockGetIntakeRequests.mockImplementation((args: { group?: string }) => ({
      data: page({
        items: args.group === "all" ? [openItem, closedItem] : [openItem],
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }));

    renderPage();
    expect(screen.getByText("Dark mode")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "intake:portal.legendName:intake:portal.group.in_progress:1",
      }),
    );

    expect(mockGetIntakeRequests).toHaveBeenLastCalledWith(
      expect.objectContaining({ group: "in_progress", limit: 100 }),
    );
    expect(
      screen
        .getByRole("button", {
          name: "intake:portal.legendName:intake:portal.group.in_progress:1",
        })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("Export invoices")).toBeTruthy();
    expect(screen.queryByText("Dark mode")).toBeNull();
    expect(screen.getByText("intake:portal.overviewHint:2")).toBeTruthy();
  });

  it("loads the remaining pages from the show-all button", () => {
    const secondPageItem = item({
      id: "request-3",
      displayId: "REQ-3",
      title: "Second page request",
    });
    mockGetIntakeRequests.mockReturnValue({
      data: page({ items: [openItem], total: 2, totalPages: 2 }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockGetIntakeRequestPages.mockImplementation(
      (args: { enabled: boolean }) => ({
        items: args.enabled ? [secondPageItem] : [],
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
      }),
    );

    renderPage();

    const showAll = screen.getByRole("button", {
      name: "intake:portal.showAll:2",
    });
    fireEvent.click(showAll);

    expect(mockGetIntakeRequestPages).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true }),
    );
    expect(screen.getByText("Second page request")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "intake:portal.showAll:2" }),
    ).toBeNull();
  });

  it("drops appended pages when the group changes", () => {
    const secondPageItem = item({
      id: "request-3",
      displayId: "REQ-3",
      title: "Second page request",
    });
    mockGetIntakeRequests.mockReturnValue({
      data: page({ items: [openItem], total: 2, totalPages: 2 }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockGetIntakeRequestPages.mockImplementation(
      (args: { enabled: boolean }) => ({
        items: args.enabled ? [secondPageItem] : [],
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
      }),
    );

    renderPage();
    fireEvent.click(
      screen.getByRole("button", { name: "intake:portal.showAll:2" }),
    );
    expect(screen.getByText("Second page request")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "intake:portal.legendName:intake:portal.group.waiting:1",
      }),
    );

    expect(screen.queryByText("Second page request")).toBeNull();
    expect(mockGetIntakeRequestPages).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("renders a request once when page 1 and a later page return the same id", () => {
    mockGetIntakeRequests.mockReturnValue({
      data: page({ items: [openItem], total: 2, totalPages: 2 }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockGetIntakeRequestPages.mockImplementation(
      (args: { enabled: boolean }) => ({
        items: args.enabled ? [openItem] : [],
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
      }),
    );

    renderPage();
    fireEvent.click(
      screen.getByRole("button", { name: "intake:portal.showAll:2" }),
    );

    expect(screen.getAllByText("Export invoices")).toHaveLength(1);
  });

  it("hides the overview when there are no requests at all", () => {
    mockGetIntakeRequests.mockReturnValue({
      data: page({
        items: [],
        total: 0,
        counts: { all: 0, waiting: 0, in_progress: 0, awaiting: 0 },
        totalPages: 0,
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.queryByText("intake:portal.overview")).toBeNull();
    expect(screen.getByText("intake:list.empty")).toBeTruthy();
  });

  it("announces requests awaiting confirmation and reviews them on demand", () => {
    mockGetIntakeRequests.mockReturnValue({
      data: page({ counts: { ...counts, awaiting: 1 } }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText("intake:portal.banner:1")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "intake:portal.bannerAction" }),
    );

    expect(mockGetIntakeRequests).toHaveBeenLastCalledWith(
      expect.objectContaining({ group: "awaiting" }),
    );
  });
});
