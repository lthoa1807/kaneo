import type { ProjectFieldDefinition } from "@/components/project-fields/types";

export type ProjectTablePreferences = {
  order: string[];
  hidden: string[];
  widths: Record<string, number>;
};

export const PROJECT_TABLE_MIN_WIDTH = 120;
export const PROJECT_TABLE_MAX_WIDTH = 600;

export function defaultProjectTablePreferences(
  definitions: ProjectFieldDefinition[],
): ProjectTablePreferences {
  return {
    order: definitions.map((field) => field.id),
    hidden: definitions
      .filter((field) => field.type === "long_text")
      .map((field) => field.id),
    widths: {},
  };
}

function clampWidth(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(
    PROJECT_TABLE_MAX_WIDTH,
    Math.max(PROJECT_TABLE_MIN_WIDTH, Math.round(value)),
  );
}

export function reconcileProjectTablePreferences(
  raw: unknown,
  definitions: ProjectFieldDefinition[],
): ProjectTablePreferences {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return defaultProjectTablePreferences(definitions);
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return defaultProjectTablePreferences(definitions);
  }

  const value = parsed as Partial<ProjectTablePreferences>;
  const known = new Set(definitions.map((field) => field.id));
  const seen = new Set<string>();
  const order: string[] = [];
  for (const id of Array.isArray(value.order) ? value.order : []) {
    if (typeof id !== "string" || !known.has(id) || seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  for (const field of definitions) {
    if (seen.has(field.id)) continue;
    seen.add(field.id);
    order.push(field.id);
  }

  const hidden = new Set<string>();
  for (const id of Array.isArray(value.hidden) ? value.hidden : []) {
    if (typeof id === "string" && known.has(id)) hidden.add(id);
  }
  // Long text is noisy by default, but only the first time a field is seen.
  const previouslyKnown = new Set(
    Array.isArray(value.order) ? value.order : [],
  );
  for (const field of definitions) {
    if (
      field.type === "long_text" &&
      !previouslyKnown.has(field.id) &&
      !hidden.has(field.id)
    ) {
      hidden.add(field.id);
    }
  }

  const widths: Record<string, number> = {};
  const rawWidths =
    value.widths && typeof value.widths === "object" ? value.widths : {};
  for (const [id, width] of Object.entries(rawWidths)) {
    if (!known.has(id)) continue;
    const clamped = clampWidth(width);
    if (clamped !== null) widths[id] = clamped;
  }

  return { order, hidden: [...hidden], widths };
}

export function projectTablePreferencesKey(
  userId: string,
  workspaceId: string,
) {
  return `kaneo:project-table:${userId}:${workspaceId}`;
}

export function readProjectTablePreferences(
  key: string,
  definitions: ProjectFieldDefinition[],
) {
  try {
    return reconcileProjectTablePreferences(
      window.localStorage.getItem(key),
      definitions,
    );
  } catch {
    return defaultProjectTablePreferences(definitions);
  }
}

export function writeProjectTablePreferences(
  key: string,
  preferences: ProjectTablePreferences,
) {
  try {
    window.localStorage.setItem(key, JSON.stringify(preferences));
  } catch {
    // Storage can be full or unavailable; preferences are optional.
  }
}

export function visibleProjectFields(
  definitions: ProjectFieldDefinition[],
  preferences: ProjectTablePreferences,
) {
  const byId = new Map(definitions.map((field) => [field.id, field]));
  return preferences.order
    .filter((id) => !preferences.hidden.includes(id))
    .map((id) => byId.get(id))
    .filter((field): field is ProjectFieldDefinition => Boolean(field));
}
