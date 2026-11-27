/**
 * The guest portal groups. `confirmed`/`rejected` belong to no group: they only
 * appear in `all`, so the summary never counts finished work.
 */
export const INTAKE_GROUP_VALUES = [
  "all",
  "waiting",
  "in_progress",
  "awaiting",
] as const;

export type IntakeGroup = (typeof INTAKE_GROUP_VALUES)[number];

export function groupStatuses(group: Exclude<IntakeGroup, "all">) {
  switch (group) {
    case "waiting":
      return ["new", "triaged"] as const;
    case "in_progress":
      return ["approved", "in_progress", "needs_revision"] as const;
    case "awaiting":
      return ["delivered"] as const;
  }
}
