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
import type { ProjectFieldWithValue } from "@/components/project-fields/types";
import useSetProjectFieldValue from "@/hooks/mutations/project-field/use-set-project-field-value";
import useProjectFieldValues from "@/hooks/queries/project-field/use-project-field-values";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { ProjectFieldValuesSection } from "./project-field-values-section";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/format", () => ({
  formatDateMedium: () => "",
  formatDateShort: () => "",
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/hooks/queries/project-field/use-project-field-values", () => ({
  default: vi.fn(),
}));
vi.mock("@/hooks/mutations/project-field/use-set-project-field-value", () => ({
  default: vi.fn(),
}));
vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: vi.fn(),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: vi.fn(),
}));

const setValue = vi.fn();
const refetch = vi.fn();

function field(
  id: string,
  name: string,
  position: number,
): ProjectFieldWithValue {
  return {
    id,
    workspaceId: "workspace-1",
    projectId: "project-1",
    name,
    type: "text",
    required: false,
    defaultValue: null,
    options: null,
    hiddenOptions: [],
    formula: null,
    position,
    createdAt: "",
    updatedAt: "",
    valueId: null,
    value: null,
    computedValue: null,
  };
}

function mockQuery(overrides: Record<string, unknown>) {
  vi.mocked(useProjectFieldValues).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch,
    ...overrides,
  } as never);
}

beforeEach(() => {
  setValue.mockReset();
  refetch.mockReset();
  vi.mocked(useActiveWorkspace).mockReturnValue({
    data: { id: "workspace-1" },
  } as never);
  vi.mocked(useWorkspacePermission).mockReturnValue({
    canUpdateProjects: () => true,
  } as never);
  vi.mocked(useSetProjectFieldValue).mockReturnValue({
    mutate: setValue,
    isPending: false,
    variables: undefined,
  } as never);
  mockQuery({});
});

afterEach(cleanup);

describe("ProjectFieldValuesSection", () => {
  it("shows a loading state before values arrive", () => {
    mockQuery({ isLoading: true });
    render(<ProjectFieldValuesSection projectId="project-1" />);
    expect(
      screen.getByText("settings:projectGeneral.projectFields.title"),
    ).toBeInTheDocument();
  });

  it("offers a retry when the values query fails", () => {
    mockQuery({ isError: true });
    render(<ProjectFieldValuesSection projectId="project-1" />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:projectGeneral.projectFields.retry",
      }),
    );
    expect(refetch).toHaveBeenCalled();
  });

  it("links to workspace settings when there are no fields", () => {
    mockQuery({ data: [] });
    render(<ProjectFieldValuesSection projectId="project-1" />);
    expect(
      screen.getByText("settings:projectGeneral.projectFields.empty"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "settings:projectGeneral.projectFields.emptyAction",
      }),
    ).toHaveAttribute("href", "/dashboard/settings/workspace/project-fields");
  });

  it("renders fields in order and sends one value payload", () => {
    const customer = field("customer", "Customer", 0);
    const stage = field("stage", "Stage", 1);
    mockQuery({ data: [customer, stage] });

    render(<ProjectFieldValuesSection projectId="project-1" />);
    const rows = screen.getAllByRole("button", { name: /Customer|Stage/ });
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "Customer",
      "Stage",
    ]);

    fireEvent.click(rows[0]);
    const input = screen.getByRole("textbox", { name: "Customer" });
    fireEvent.change(input, { target: { value: "Acme" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(setValue).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        projectId: "project-1",
        fieldId: "customer",
        value: "Acme",
      },
      expect.anything(),
    );
  });
});
