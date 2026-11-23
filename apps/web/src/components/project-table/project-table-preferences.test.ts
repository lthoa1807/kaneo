import { describe, expect, it } from "vite-plus/test";
import type { ProjectFieldDefinition } from "@/components/project-fields/types";
import {
  defaultProjectTablePreferences,
  reconcileProjectTablePreferences,
  visibleProjectFields,
} from "./project-table-preferences";

function field(
  id: string,
  type: ProjectFieldDefinition["type"] = "text",
): ProjectFieldDefinition {
  return {
    id,
    workspaceId: "workspace-1",
    name: id,
    type,
    required: false,
    defaultValue: null,
    options: null,
    hiddenOptions: [],
    formula: null,
    position: 0,
    createdAt: "",
    updatedAt: "",
  };
}

const definitions = [
  field("customer"),
  field("notes", "long_text"),
  field("effort", "number"),
];

describe("project table preferences", () => {
  it("returns defaults for corrupt or missing storage", () => {
    expect(reconcileProjectTablePreferences("{", definitions)).toEqual(
      defaultProjectTablePreferences(definitions),
    );
    expect(reconcileProjectTablePreferences(null, definitions)).toEqual({
      order: ["customer", "notes", "effort"],
      hidden: ["notes"],
      widths: {},
    });
  });

  it("drops stale ids, appends new fields, and collapses duplicates", () => {
    const result = reconcileProjectTablePreferences(
      {
        order: ["effort", "gone", "effort", "customer"],
        hidden: [],
        widths: {},
      },
      definitions,
    );
    expect(result.order).toEqual(["effort", "customer", "notes"]);
  });

  it("keeps explicit user visibility and hides a long text field once", () => {
    const stored = {
      order: ["customer", "notes", "effort"],
      hidden: ["customer"],
      widths: {},
    };
    expect(
      reconcileProjectTablePreferences(stored, definitions).hidden,
    ).toEqual(["customer"]);

    const next = [...definitions, field("summary", "long_text")];
    expect(reconcileProjectTablePreferences(stored, next).hidden).toEqual([
      "customer",
      "summary",
    ]);
    // Seeing it once means an explicit unhide sticks.
    const unhidden = {
      order: ["customer", "notes", "effort", "summary"],
      hidden: ["summary"],
      widths: {},
    };
    expect(reconcileProjectTablePreferences(unhidden, next).hidden).toEqual([
      "summary",
    ]);
  });

  it("clamps widths to 120–600 px and drops unknown ids", () => {
    const result = reconcileProjectTablePreferences(
      {
        order: ["customer", "notes", "effort"],
        hidden: [],
        widths: {
          customer: 20,
          notes: 900,
          effort: 240.4,
          gone: 300,
          bad: "wide",
        },
      },
      definitions,
    );
    expect(result.widths).toEqual({
      customer: 120,
      notes: 600,
      effort: 240,
    });
  });

  it("returns only visible fields in stored order", () => {
    expect(
      visibleProjectFields(definitions, {
        order: ["effort", "customer", "notes"],
        hidden: ["notes"],
        widths: {},
      }).map((item) => item.id),
    ).toEqual(["effort", "customer"]);
  });
});
