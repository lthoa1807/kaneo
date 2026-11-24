export const INTAKE_STATUSES = [
  "new",
  "triaged",
  "rejected",
  "approved",
  "in_progress",
  "delivered",
  "needs_revision",
  "confirmed",
] as const;

export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export type TransitionTarget = Exclude<IntakeStatus, "new">;

export type IntakeAction = { to: TransitionTarget; noteRequired: boolean };

export function isIntakeStatus(value: string): value is IntakeStatus {
  return (INTAKE_STATUSES as readonly string[]).includes(value);
}

// Badge tone per status; the label always comes from `intake:status.*`.
export const INTAKE_STATUS_TONES = {
  new: "outline",
  triaged: "info",
  rejected: "error",
  approved: "success",
  in_progress: "warning",
  delivered: "info",
  needs_revision: "warning",
  confirmed: "success",
} as const satisfies Record<
  IntakeStatus,
  "outline" | "info" | "error" | "success" | "warning"
>;

export function isTerminalStatus(status: IntakeStatus): boolean {
  return status === "rejected" || status === "confirmed";
}

// Mirrors the spec's transition rules. The API is the authority; these maps
// only decide which buttons to render.
export function guestActionsFor(status: IntakeStatus): IntakeAction[] {
  if (status !== "delivered") return [];
  return [
    { to: "confirmed", noteRequired: false },
    { to: "needs_revision", noteRequired: true },
  ];
}

const STAFF_TRANSITIONS: Partial<Record<IntakeStatus, IntakeAction[]>> = {
  new: [
    { to: "triaged", noteRequired: false },
    { to: "approved", noteRequired: false },
    { to: "rejected", noteRequired: true },
  ],
  triaged: [
    { to: "approved", noteRequired: false },
    { to: "rejected", noteRequired: true },
  ],
  approved: [{ to: "in_progress", noteRequired: false }],
  needs_revision: [{ to: "in_progress", noteRequired: false }],
  in_progress: [{ to: "delivered", noteRequired: false }],
};

export function staffActionsFor(status: IntakeStatus): IntakeAction[] {
  return STAFF_TRANSITIONS[status] ?? [];
}
