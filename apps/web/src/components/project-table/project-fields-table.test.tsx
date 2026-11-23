import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { ProjectFieldDefinition } from "@/components/project-fields/types";
import { ProjectFieldsTable } from "./project-fields-table";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children?: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("@/lib/format", () => ({
  formatDateMedium: (value: string) => value,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const m = vi.hoisted(() => ({
  definitions: [] as ProjectFieldDefinition[],
  definitionsPending: false,
  definitionsError: false,
  refetchDefinitions: vi.fn(),
  projects: [] as {
    id: string;
    name: string;
    icon: string;
    archivedAt: string | null;
    values: Record<string, string | null>;
    computedValues: Record<string, string | null>;
    statistics: {
      totalTasks: number;
      completedTasks: number;
      completionPercentage: number;
      dueDate: string | null;
    };
  }[],
  total: 0,
  tableError: false,
  refetchTable: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 48,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        start: index * 48,
        key: index,
      })),
  }),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "user" } } }) },
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canUpdateProjects: () => true }),
}));
vi.mock("@/hooks/queries/project-field/use-project-fields", () => ({
  default: () => ({
    data: m.definitionsPending ? undefined : m.definitions,
    isPending: m.definitionsPending,
    isError: m.definitionsError,
    refetch: m.refetchDefinitions,
  }),
}));
vi.mock("@/hooks/queries/project-field/use-project-field-table", () => ({
  default: () => ({
    data: m.tableError ? undefined : { projects: m.projects, total: m.total },
    isPending: false,
    isError: m.tableError,
    refetch: m.refetchTable,
  }),
}));
vi.mock("@/hooks/mutations/project-field/use-set-project-field-value", () => ({
  default: () => ({ mutate: m.mutate }),
}));
vi.mock("@/components/project-table/project-table-toolbar", () => ({
  ProjectTableToolbar: () => null,
}));
vi.mock("@/components/project-table/project-field-cell", () => ({
  ProjectFieldCell: ({
    field,
    onSave,
  }: {
    field: ProjectFieldDefinition;
    onSave: (value: string | null) => void;
  }) => (
    <button type="button" onClick={() => onSave("next")}>
      edit {field.name}
    </button>
  ),
}));

const definition = (
  overrides: Partial<ProjectFieldDefinition> &
    Pick<ProjectFieldDefinition, "id" | "name" | "type">,
): ProjectFieldDefinition =>
  ({
    workspaceId: "workspace",
    description: null,
    required: false,
    defaultValue: null,
    formula: null,
    options: [],
    position: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }) as ProjectFieldDefinition;

function renderTable() {
  return render(
    <ProjectFieldsTable
      workspaceId="workspace"
      search={{}}
      onSearchChange={() => {}}
    />,
  );
}

beforeEach(() => {
  m.definitions = [];
  m.definitionsPending = false;
  m.definitionsError = false;
  m.projects = [];
  m.total = 0;
  m.tableError = false;
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProjectFieldsTable", () => {
  it("points to workspace settings when no fields exist", () => {
    renderTable();
    expect(
      screen.getByText("workspace:projects.table.noDefinitions"),
    ).toBeTruthy();
  });

  it("renders projects and saves an edited cell", () => {
    m.definitions = [definition({ id: "field", name: "Budget", type: "text" })];
    m.projects = [
      {
        id: "project",
        name: "Alpha",
        icon: "Layout",
        archivedAt: null,
        values: { field: "old" },
        computedValues: { field: "old" },
        statistics: {
          totalTasks: 2,
          completedTasks: 1,
          completionPercentage: 50,
          dueDate: null,
        },
      },
    ];
    m.total = 1;
    renderTable();
    expect(screen.getByText("Alpha")).toBeTruthy();
    // The grid is div-based, so the table role is what gives it semantics.
    expect(screen.getByRole("table")).toBeTruthy();
    fireEvent.click(screen.getByText("edit Budget"));
    expect(m.mutate).toHaveBeenCalledWith(
      {
        workspaceId: "workspace",
        projectId: "project",
        fieldId: "field",
        value: "next",
      },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("retries when definitions fail to load", () => {
    m.definitionsError = true;
    renderTable();
    fireEvent.click(
      screen.getByText("settings:projectGeneral.projectFields.retry"),
    );
    expect(m.refetchDefinitions).toHaveBeenCalledOnce();
  });
});
