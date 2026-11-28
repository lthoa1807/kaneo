import type { IntakeStatus } from "./intake-status";

/**
 * Guest portal groups. Mirrors the API's `group` values: finished requests
 * (`confirmed`/`rejected`) belong to no group and only appear in `all`.
 */
export const INTAKE_GROUPS = [
  { key: "waiting", statuses: ["new", "triaged"] },
  {
    key: "in_progress",
    statuses: ["approved", "in_progress", "needs_revision"],
  },
  { key: "awaiting", statuses: ["delivered"] },
] as const satisfies ReadonlyArray<{
  key: string;
  statuses: readonly IntakeStatus[];
}>;

export type IntakeGroupKey = (typeof INTAKE_GROUPS)[number]["key"];
export type IntakeGroupFilter = IntakeGroupKey | "all";

export function groupForStatus(status: IntakeStatus): IntakeGroupKey | null {
  const group = INTAKE_GROUPS.find((item) =>
    (item.statuses as readonly IntakeStatus[]).includes(status),
  );
  return group?.key ?? null;
}

/** Guest-facing badge label: a status is named after the group a guest cares about. */
export function guestStatusLabelKey(status: IntakeStatus) {
  const group = groupForStatus(status);
  return group ? `intake:portal.group.${group}` : `intake:status.${status}`;
}
