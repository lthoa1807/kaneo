import { describe, expect, it } from "vite-plus/test";
import exportProjectFieldTable, {
  type ExportProjectFieldTableDependencies,
  resolveExportColumns,
} from "./export-project-field-table";
import type { ProjectFieldDefinition } from "../types";

function definition(id: string, name: string): ProjectFieldDefinition {
  return {
    id,
    workspaceId: "workspace",
    name,
    type: "text",
    required: false,
    defaultValue: null,
    options: null,
    hiddenOptions: [],
    formula: null,
    position: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

const definitions = [
  definition("customer", "Customer"),
  definition("stage", "Stage"),
  definition("effort", "Effort"),
];

function dependencies(
  overrides: Partial<ExportProjectFieldTableDependencies>,
): ExportProjectFieldTableDependencies {
  return {
    transaction: (run) => run(null as never),
    loadDefinitions: async () => definitions,
    countRows: async () => 0,
    queryPage: async () => {
      throw new Error("queryPage must not run");
    },
    ...overrides,
  };
}

const request = {
  workspaceId: "workspace",
  userId: "user",
  filters: undefined,
  sort: undefined,
  limit: 500,
  offset: 0,
  includeArchived: false,
};

describe("exportProjectFieldTable", () => {
  it("rejects more than 20,000 rows before querying or serializing rows", async () => {
    const deps = dependencies({ countRows: async () => 20_001 });
    await expect(exportProjectFieldTable(request, deps)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("serializes only the header for an empty export", async () => {
    const deps = dependencies({ countRows: async () => 0 });
    const { csv, filename } = await exportProjectFieldTable(request, deps);
    expect(filename).toBe("projects-workspace.csv");
    expect(csv).toBe('\uFEFF"Project","Customer","Stage","Effort"\r\n');
  });

  it("drops repeated columns and keeps definition order", () => {
    expect(resolveExportColumns(definitions, "effort,customer,effort")).toEqual(
      ["customer", "effort"],
    );
    expect(resolveExportColumns(definitions, "")).toEqual([]);
    expect(() => resolveExportColumns(definitions, "unknown")).toThrow();
  });
});
