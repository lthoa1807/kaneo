import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ProjectFieldWithValue } from "@/components/project-fields/types";
import { ProjectFieldValueRow } from "./project-field-value-row";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/format", () => ({
  formatDateMedium: () => "",
  formatDateShort: () => "",
}));

afterEach(cleanup);

function field(
  overrides: Partial<ProjectFieldWithValue>,
): ProjectFieldWithValue {
  return {
    id: "field-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    name: "Customer",
    type: "text",
    required: false,
    defaultValue: null,
    options: null,
    hiddenOptions: [],
    formula: null,
    position: 0,
    createdAt: "",
    updatedAt: "",
    valueId: null,
    value: null,
    computedValue: null,
    ...overrides,
  };
}

describe("ProjectFieldValueRow", () => {
  it("renders a formula result read-only", () => {
    render(
      <ProjectFieldValueRow
        field={field({
          type: "formula",
          computedValue: "12",
          formula: {
            kind: "number",
            op: "add",
            leftFieldId: "a",
            rightFieldId: "b",
          },
        })}
        canEdit
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers Unset for optional booleans but not required ones", () => {
    const { rerender } = render(
      <ProjectFieldValueRow
        field={field({ type: "boolean", name: "Billable" })}
        canEdit
        onSave={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "settings:projectGeneral.projectFields.unset",
      }),
    ).toBeInTheDocument();

    rerender(
      <ProjectFieldValueRow
        field={field({ type: "boolean", name: "Billable", required: true })}
        canEdit
        onSave={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", {
        name: "settings:projectGeneral.projectFields.unset",
      }),
    ).not.toBeInTheDocument();
  });

  it("toggles a boolean once without offering a second clear", () => {
    const onSave = vi.fn();
    render(
      <ProjectFieldValueRow
        field={field({ type: "boolean", name: "Billable", required: true })}
        canEdit
        onSave={onSave}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:projectGeneral.projectFields.yes",
      }),
    );
    expect(onSave).toHaveBeenCalledWith("true");
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("saves long text on blur and never clears a required value", () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <ProjectFieldValueRow
        field={field({ type: "long_text", value: "Old" })}
        canEdit
        onSave={onSave}
      />,
    );
    const textarea = screen.getByRole("textbox", { name: "Customer" });
    fireEvent.change(textarea, { target: { value: "New" } });
    fireEvent.blur(textarea);
    expect(onSave).toHaveBeenCalledWith("New");

    onSave.mockClear();
    rerender(
      <ProjectFieldValueRow
        field={field({
          type: "long_text",
          value: "Required",
          required: true,
        })}
        canEdit
        onSave={onSave}
      />,
    );
    const requiredTextarea = screen.getByRole("textbox", { name: "Customer" });
    fireEvent.change(requiredTextarea, { target: { value: "  " } });
    fireEvent.blur(requiredTextarea);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows no editor without edit permission", () => {
    render(
      <ProjectFieldValueRow
        field={field({ type: "text", value: "Acme" })}
        canEdit={false}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("Acme")).toBeInTheDocument();
  });
});
