export type MembershipKind = "guest" | "staff";

export type IntakeIdentity = {
  kind: MembershipKind;
  readIntake: boolean;
  createIntakeRequests: boolean;
  updateIntake: boolean;
  manageIntake: boolean;
};

export type IntakeSurfaces = {
  guestPortal: boolean;
  staffIntake: boolean;
  canCreate: boolean;
  canManage: boolean;
};

// Identity comes from the server (membership); capabilities only decide what
// the surface may offer. Neither is inferred from the other.
export function resolveIntakeSurfaces(can: IntakeIdentity): IntakeSurfaces {
  const isGuest = can.kind === "guest";
  return {
    guestPortal: isGuest && can.readIntake && can.createIntakeRequests,
    staffIntake: !isGuest && can.readIntake,
    canCreate: can.createIntakeRequests,
    canManage: can.manageIntake,
  };
}
