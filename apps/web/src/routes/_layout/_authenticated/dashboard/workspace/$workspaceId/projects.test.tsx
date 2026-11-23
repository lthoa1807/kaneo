import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { Route } from "./projects";

const m = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
  projects: [] as {
    id: string;
    name: string;
    icon: string;
    statistics: {
      totalTasks: number;
      completedTasks: number;
      completionPercentage: number;
      dueDate: string | null;
    };
  }[],
  canCreate: true,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/format", () => ({
  formatDateMedium: (value: string) => value,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ workspaceId: "workspace" }),
    useSearch: () => m.search,
  }),
  useNavigate: () => m.navigate,
  Link: ({ children, ...props }: { children?: ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children?: ReactNode }) => <>{children}</>,
  closestCenter: vi.fn(),
  MouseSensor: vi.fn(),
  TouchSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: () => [],
}));
vi.mock("@dnd-kit/modifiers", () => ({
  restrictToParentElement: vi.fn(),
  restrictToVerticalAxis: vi.fn(),
}));
vi.mock("@dnd-kit/sortable", () => ({
  arrayMove: (items: unknown[]) => items,
  SortableContext: ({ children }: { children?: ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: vi.fn(),
}));
vi.mock("@/components/project-list/sortable-project-row", () => ({
  SortableProjectRow: ({ children }: { children?: ReactNode }) => (
    <tr>{children}</tr>
  ),
}));
vi.mock("@/components/project-table/project-fields-table", () => ({
  ProjectFieldsTable: () => <div>fields table</div>,
}));
vi.mock("@/components/project-table/projects-view-switch", () => ({
  ProjectsViewSwitch: ({
    onChange,
  }: {
    onChange: (view: "overview" | "fields") => void;
  }) => (
    <button type="button" onClick={() => onChange("fields")}>
      switch fields
    </button>
  ),
}));
vi.mock("@/components/common/workspace-layout", () => ({
  default: ({
    headerActions,
    children,
  }: {
    headerActions?: ReactNode;
    children?: ReactNode;
  }) => (
    <div>
      {headerActions}
      {children}
    </div>
  ),
}));
vi.mock("@/components/page-title", () => ({ default: () => null }));
vi.mock("@/components/billing/trial-expired-callout", () => ({
  TrialExpiredCallout: () => null,
}));
vi.mock("@/components/shared/modals/create-project-modal", () => ({
  default: () => null,
}));
vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: () => ({ data: m.projects, isLoading: false }),
}));
vi.mock("@/hooks/mutations/project/use-reorder-projects", () => ({
  default: () => vi.fn(),
}));
vi.mock("@/hooks/queries/project-field/use-project-fields", () => ({
  default: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canCreateProjects: () => m.canCreate,
    canUpdateProjects: () => true,
  }),
}));
vi.mock("@/hooks/use-can-import", () => ({
  useCanImport: () => ({ canImport: false }),
}));
vi.mock("@/lib/shortcuts/use-shortcut", () => ({ useShortcut: vi.fn() }));

const RouteComponent = (
  Route as unknown as {
    options: { component: () => ReactNode };
  }
).options.component;

beforeEach(() => {
  m.search = {};
  m.canCreate = true;
  m.projects = [];
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("projects route views", () => {
  it("shows the fields table from the URL and hides the overview", () => {
    m.search = { view: "fields" };
    render(<RouteComponent />);
    expect(screen.getByText("fields table")).toBeTruthy();
    expect(screen.queryByText("workspace:projects.emptyTitle")).toBeNull();
  });

  it("switches to the fields view", () => {
    render(<RouteComponent />);
    fireEvent.click(screen.getByText("switch fields"));
    const updater = m.navigate.mock.calls[0]?.[0]?.search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(updater({ filters: "keep" })).toEqual({
      filters: "keep",
      view: "fields",
    });
  });

  it("lists projects in the overview", () => {
    m.projects = [
      {
        id: "project",
        name: "Alpha",
        icon: "Layout",
        statistics: {
          totalTasks: 1,
          completedTasks: 1,
          completionPercentage: 100,
          dueDate: null,
        },
      },
    ];
    render(<RouteComponent />);
    expect(screen.getByText("Alpha")).toBeTruthy();
  });
});
