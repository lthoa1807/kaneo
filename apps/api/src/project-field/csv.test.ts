import { describe, expect, it } from "vite-plus/test";
import {
  serializeProjectFieldCsv,
  serializeProjectFieldCsvHeader,
  serializeProjectFieldCsvRows,
} from "./csv";
import type { ProjectFieldTableRow } from "./table-types";
import type { ProjectFieldDefinition, ProjectFieldType } from "./types";

function definition(
  id: string,
  name: string,
  type: ProjectFieldType,
  formula: ProjectFieldDefinition["formula"] = null,
): ProjectFieldDefinition {
  return {
    id,
    workspaceId: "workspace",
    name,
    type,
    required: false,
    defaultValue: null,
    options: type === "dropdown" ? ["Core", "Reports"] : null,
    hiddenOptions: [],
    formula,
    position: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function project(
  id: string,
  name: string,
  values: Record<string, string | null>,
  formulas: Record<string, string | null> = {},
): ProjectFieldTableRow {
  return {
    id,
    name,
    slug: id,
    icon: null,
    archivedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    statistics: { completionPercentage: 0, totalTasks: 0, dueDate: null },
    values,
    formulas,
  };
}

const customer = definition("customer", "Customer", "text");
const notes = definition("notes", "Notes", "long_text");
const efforts = definition("effort", "Effort", "number");
const differences = definition("diff", "Difference", "formula", {
  kind: "number",
  op: "subtract",
  leftFieldId: "effort",
  rightFieldId: "effort",
});
const stage = definition("stage", "Stage", "dropdown");

describe("serializeProjectFieldCsv", () => {
  it("writes a BOM, a Project header, and selected columns in definition order", () => {
    const csv = serializeProjectFieldCsv({
      definitions: [customer, notes, efforts],
      projects: [],
      columnIds: ["effort", "customer"],
    });
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toBe('\uFEFF"Project","Customer","Effort"\r\n');
  });

  it("quotes and escapes embedded quotes and newlines", () => {
    const csv = serializeProjectFieldCsv({
      definitions: [customer, notes],
      projects: [
        project("acme", 'Acme "North"', {
          customer: 'Acme "North"',
          notes: "line one\nline two",
        }),
      ],
      columnIds: ["customer", "notes"],
    });
    expect(csv).toContain('"Acme ""North"""');
    expect(csv).toContain('"line one\nline two"');
  });

  it("formats choices, blanks, and canonical formula output", () => {
    const product = definition("products", "Products", "multiselect");
    const csv = serializeProjectFieldCsv({
      definitions: [customer, stage, product, differences],
      projects: [
        project(
          "acme",
          "Acme",
          { customer: "Acme", stage: "Core", products: '["Core","Reports"]' },
          { diff: "-2" },
        ),
        project("blank", "Blank", {}),
      ],
      columnIds: ["customer", "stage", "products", "diff"],
    });

    expect(csv).toContain('"Acme","Core","Core, Reports","-2"');
    expect(csv).toContain('"Blank","","","",""');
  });

  it("neutralizes spreadsheet formula prefixes but keeps real numbers", () => {
    const csv = serializeProjectFieldCsv({
      definitions: [
        definition("header", "=Header", "text"),
        customer,
        efforts,
        stage,
      ],
      projects: [
        project("acme", "@Acme", {
          customer: "+sum",
          effort: "-42",
          stage: "=cmd",
        }),
        project("bad-number", "Bad", { effort: "-abc" }),
      ],
      columnIds: ["header", "customer", "effort", "stage"],
    });

    expect(csv).toContain(`"'=Header"`);
    expect(csv).toContain(`"'@Acme"`);
    expect(csv).toContain(`"'+sum"`);
    expect(csv).toContain(`"'=cmd"`);
    expect(csv).toContain('"-42"');
    expect(csv).toContain(`"'-abc"`);
    expect(csv).not.toContain(`"'-42"`);
  });

  it("guards tab, carriage return, and leading-whitespace prefixes", () => {
    const csv = serializeProjectFieldCsv({
      definitions: [customer],
      projects: [project("acme", "  =Acme", { customer: "\t=cmd" })],
      columnIds: ["customer"],
    });
    expect(csv).toContain(`"'  =Acme"`);
    expect(csv).toContain(`"'\t=cmd"`);
  });

  it("keeps the primitives composable without a duplicate BOM", () => {
    const header = serializeProjectFieldCsvHeader([customer], ["customer"]);
    const rows = serializeProjectFieldCsvRows(
      [customer],
      [project("acme", "Acme", { customer: "Acme" })],
      ["customer"],
    );
    expect(header.startsWith("\uFEFF")).toBe(true);
    expect(rows.startsWith("\uFEFF")).toBe(false);
    expect(header + rows).toBe(
      serializeProjectFieldCsv({
        definitions: [customer],
        projects: [project("acme", "Acme", { customer: "Acme" })],
        columnIds: ["customer"],
      }),
    );
  });
});
