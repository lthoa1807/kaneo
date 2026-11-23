import { describe, expect, it } from "vite-plus/test";
import type { ProjectFieldDefinition } from "@/components/project-fields/types";
import {
  decodeProjectTableSearch,
  encodeProjectTableSearch,
  filterOperatorsFor,
  PROJECT_TABLE_PAGE_SIZE,
} from "./project-table-search";

function field(
  id: string,
  type: ProjectFieldDefinition["type"],
): ProjectFieldDefinition {
  return {
    id,
    workspaceId: "workspace-1",
    name: id,
    type,
    required: false,
    defaultValue: null,
    options: type === "dropdown" ? ["Planned", "Live"] : null,
    hiddenOptions: [],
    formula: null,
    position: 0,
    createdAt: "",
    updatedAt: "",
  };
}

const definitions = [
  field("customer", "text"),
  field("stage", "dropdown"),
  field("effort", "number"),
  field("due", "date"),
  field("billable", "boolean"),
  field("total", "formula"),
];

describe("project table search", () => {
  it("round-trips values with commas, colons, quotes, Unicode, and newlines", () => {
    const filters = [
      {
        fieldId: "customer",
        operator: "contains" as const,
        value: 'Acme, "North": Tokyo\nZürich',
      },
    ];
    const sort = [{ key: "effort", direction: "desc" as const }];
    const encoded = encodeProjectTableSearch({ filters, sort });
    expect(decodeProjectTableSearch(encoded, definitions)).toMatchObject({
      filters,
      sort,
    });
  });

  it("caps filters at 20 and sorts at two", () => {
    const filters = Array.from({ length: 30 }, () => ({
      fieldId: "customer",
      operator: "notEmpty" as const,
    }));
    const sort = ["customer", "effort", "due"].map((key) => ({
      key,
      direction: "asc" as const,
    }));
    const decoded = decodeProjectTableSearch(
      {
        filters: JSON.stringify(filters),
        sort: JSON.stringify(sort),
      },
      definitions,
    );
    expect(decoded.filters).toHaveLength(20);
    expect(decoded.sort).toHaveLength(2);
  });

  it("drops unknown and formula field filters and sorts", () => {
    const decoded = decodeProjectTableSearch(
      {
        filters: JSON.stringify([
          { fieldId: "gone", operator: "notEmpty" },
          { fieldId: "total", operator: "notEmpty" },
          { fieldId: "customer", operator: "contains", value: "Acme" },
        ]),
        sort: JSON.stringify([
          { key: "gone", direction: "asc" },
          { key: "total", direction: "asc" },
          // The API has no due-date sort; a saved link must not 400 the table.
          { key: "dueDate", direction: "asc" },
        ]),
      },
      definitions,
    );
    expect(decoded.filters).toEqual([
      { fieldId: "customer", operator: "contains", value: "Acme" },
    ]);
    expect(decoded.sort).toEqual([]);
  });

  it("rejects operators the API does not support for the field type", () => {
    const decoded = decodeProjectTableSearch(
      {
        filters: JSON.stringify([
          { fieldId: "effort", operator: "contains", value: "1" },
          { fieldId: "stage", operator: "in", value: ["Live"] },
        ]),
      },
      definitions,
    );
    expect(decoded.filters).toEqual([
      { fieldId: "stage", operator: "in", value: ["Live"] },
    ]);
    expect(filterOperatorsFor(field("total", "formula"))).toEqual([]);
  });

  it("keeps the page the table writes and drops page 0", () => {
    // The table sets page back to 0 before encoding a filter change.
    expect(encodeProjectTableSearch({ page: 0 })).not.toHaveProperty("page");
    expect(encodeProjectTableSearch({ page: 3 })).toMatchObject({ page: 3 });
    expect(
      decodeProjectTableSearch(
        encodeProjectTableSearch({ page: 3 }),
        definitions,
      ).page,
    ).toBe(3);
  });

  it("omits defaults and tolerates corrupt JSON", () => {
    expect(encodeProjectTableSearch({})).toEqual({});
    expect(
      decodeProjectTableSearch(
        { filters: "{", sort: "nope", page: -2 },
        definitions,
      ),
    ).toEqual({
      filters: [],
      sort: [],
      page: 0,
      limit: PROJECT_TABLE_PAGE_SIZE,
      includeArchived: false,
    });
  });
});
