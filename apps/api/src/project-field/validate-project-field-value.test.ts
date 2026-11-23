import { describe, expect, it } from "vite-plus/test";
import { normalizeProjectFieldValue } from "./validate-project-field-value";
import type { ProjectFieldType } from "./types";

function definition(
  type: ProjectFieldType,
  overrides: Partial<{
    required: boolean;
    options: string[] | null;
    hiddenOptions: string[];
  }> = {},
) {
  return {
    name: "Field",
    type,
    required: overrides.required ?? false,
    options: overrides.options ?? null,
    hiddenOptions: overrides.hiddenOptions ?? [],
  };
}

describe("normalizeProjectFieldValue", () => {
  it("keeps text content but clears all-whitespace values", () => {
    expect(
      normalizeProjectFieldValue(definition("text"), "  Acme  ", null),
    ).toBe("  Acme  ");
    expect(
      normalizeProjectFieldValue(definition("text"), "   ", null),
    ).toBeNull();
    expect(
      normalizeProjectFieldValue(
        definition("long_text"),
        "line one\nline two",
        null,
      ),
    ).toBe("line one\nline two");
  });

  it("accepts finite numbers and rejects the rest", () => {
    expect(
      normalizeProjectFieldValue(definition("number"), " -42.5 ", null),
    ).toBe("-42.5");
    expect(() =>
      normalizeProjectFieldValue(definition("number"), "12abc", null),
    ).toThrow();
    expect(() =>
      normalizeProjectFieldValue(definition("number"), "Infinity", null),
    ).toThrow();
  });

  it("requires a strict YYYY-MM-DD date", () => {
    expect(
      normalizeProjectFieldValue(definition("date"), "2026-02-28", null),
    ).toBe("2026-02-28");
    expect(() =>
      normalizeProjectFieldValue(
        definition("date"),
        "2026-02-28T10:00:00Z",
        null,
      ),
    ).toThrow();
    expect(() =>
      normalizeProjectFieldValue(definition("date"), "2026-02-30", null),
    ).toThrow();
  });

  it("accepts only exact booleans", () => {
    expect(
      normalizeProjectFieldValue(definition("boolean"), "true", null),
    ).toBe("true");
    expect(() =>
      normalizeProjectFieldValue(definition("boolean"), "TRUE", null),
    ).toThrow();
  });

  it("accepts active dropdown options only", () => {
    const field = definition("dropdown", {
      options: ["Planned", "Live", "Retired"],
      hiddenOptions: ["Retired"],
    });
    expect(normalizeProjectFieldValue(field, "Live", null)).toBe("Live");
    expect(() => normalizeProjectFieldValue(field, "Other", null)).toThrow();
    expect(() => normalizeProjectFieldValue(field, "Retired", null)).toThrow();
  });

  it("normalizes multiselect arrays and removes duplicates", () => {
    const field = definition("multiselect", {
      options: ["Core", "Reports", "Extra"],
    });
    expect(
      normalizeProjectFieldValue(field, '["Reports","Core","Reports"]', null),
    ).toBe('["Reports","Core"]');
    expect(() =>
      normalizeProjectFieldValue(field, '["Other"]', null),
    ).toThrow();
    expect(() => normalizeProjectFieldValue(field, "not-json", null)).toThrow();
  });

  it("keeps hidden options already selected but rejects new picks", () => {
    const field = definition("dropdown", {
      options: ["Planned", "Retired"],
      hiddenOptions: ["Retired"],
    });
    expect(normalizeProjectFieldValue(field, "Retired", "Retired")).toBe(
      "Retired",
    );
    expect(() =>
      normalizeProjectFieldValue(field, "Retired", "Planned"),
    ).toThrow();

    const multi = definition("multiselect", {
      options: ["Core", "Retired"],
      hiddenOptions: ["Retired"],
    });
    expect(
      normalizeProjectFieldValue(multi, '["Core","Retired"]', '["Retired"]'),
    ).toBe('["Core","Retired"]');
    expect(() =>
      normalizeProjectFieldValue(multi, '["Core","Retired"]', '["Core"]'),
    ).toThrow();
  });

  it("rejects clearing required fields and clears optional ones", () => {
    expect(() =>
      normalizeProjectFieldValue(
        definition("text", { required: true }),
        "  ",
        null,
      ),
    ).toThrow();
    expect(() =>
      normalizeProjectFieldValue(
        definition("multiselect", {
          required: true,
          options: ["Core", "Reports"],
        }),
        "[]",
        '["Core"]',
      ),
    ).toThrow();

    expect(
      normalizeProjectFieldValue(definition("date"), null, "2026-01-01"),
    ).toBeNull();
    expect(
      normalizeProjectFieldValue(
        definition("multiselect", { options: ["Core", "Reports"] }),
        "[]",
        '["Core"]',
      ),
    ).toBeNull();
  });

  it("rejects writes to formula fields", () => {
    expect(() =>
      normalizeProjectFieldValue(definition("formula"), "1", null),
    ).toThrow();
  });
});
