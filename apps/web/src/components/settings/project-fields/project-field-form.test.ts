import { describe, expect, it } from "vite-plus/test";
import type { ProjectFieldDefinition } from "@/components/project-fields/types";
import {
  parseProjectFieldOptions,
  validateProjectFieldForm,
  type ProjectFieldFormValues,
} from "./project-field-form";

function field(
  overrides: Partial<ProjectFieldDefinition>,
): ProjectFieldDefinition {
  return {
    id: "field-1",
    workspaceId: "workspace-1",
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
    ...overrides,
  };
}

const values: ProjectFieldFormValues = {
  name: "Customer",
  type: "text",
  required: false,
  defaultValue: "",
  optionsText: "",
};

describe("project field form", () => {
  it("requires a name and rejects a duplicate name case-insensitively", () => {
    expect(
      validateProjectFieldForm(
        { ...values, name: " " },
        { existing: [], formula: null },
      ).name,
    ).toBe("requiredName");

    expect(
      validateProjectFieldForm(values, {
        existing: [field({ name: "customer" })],
        formula: null,
      }).name,
    ).toBe("duplicateName");

    expect(
      validateProjectFieldForm(values, {
        editingId: "field-1",
        existing: [field({ name: "customer" })],
        formula: null,
      }).name,
    ).toBeUndefined();
  });

  it("requires at least one option for choice fields", () => {
    expect(
      validateProjectFieldForm(
        { ...values, type: "dropdown", optionsText: " \n " },
        { existing: [], formula: null },
      ).options,
    ).toBe("requiredOptions");

    expect(
      validateProjectFieldForm(
        { ...values, type: "multiselect", optionsText: "Planned\nLive" },
        { existing: [], formula: null },
      ).options,
    ).toBeUndefined();
  });

  it("requires a formula when the type is formula", () => {
    expect(
      validateProjectFieldForm(
        { ...values, type: "formula" },
        { existing: [], formula: null },
      ).formula,
    ).toBe("requiredFormula");
  });

  it("splits options into trimmed unique entries", () => {
    expect(parseProjectFieldOptions("Planned\n Live \nPlanned\n\n")).toEqual([
      "Planned",
      "Live",
    ]);
  });
});
