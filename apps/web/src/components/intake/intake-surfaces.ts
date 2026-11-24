export type MembershipKind = "guest" | "staff";

export type IntakeIdentity = {
  kind: MembershipKind;
  readIntake: boolean;
  createIntakeRequests: boolean;
  updateIntake: boolean;
  manageIntake: boolean;
};

export type IntakeSurfaces = {
  kind: MembershipKind;
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
    kind: can.kind,
    guestPortal: isGuest && can.readIntake && can.createIntakeRequests,
    staffIntake: !isGuest && can.readIntake,
    canCreate: can.createIntakeRequests,
    canManage: can.manageIntake,
  };
}

export type IntakeNav = {
  staffNav: boolean;
  projectsNav: boolean;
  portalNav: boolean;
};

// The sidebar follows the same split: a guest sees only their portal, staff
// keep the workspace nav and the project list.
export function navForSurfaces(surfaces: IntakeSurfaces): IntakeNav {
  // Keyed on identity, not on intake permission: a custom staff role without
  // intake:read still belongs in the workspace nav.
  const isGuest = surfaces.kind === "guest";
  return {
    staffNav: !isGuest,
    projectsNav: !isGuest,
    portalNav: surfaces.guestPortal,
  };
}
