import { describe, expect, it } from "vite-plus/test";
import { type IntakeIdentity, resolveIntakeSurfaces } from "./intake-surfaces";

function identity(overrides: Partial<IntakeIdentity>): IntakeIdentity {
  return {
    kind: "guest",
    readIntake: false,
    createIntakeRequests: false,
    updateIntake: false,
    manageIntake: false,
    ...overrides,
  };
}

describe("resolveIntakeSurfaces", () => {
  it("gives a guest with read and create the portal, never the staff tab", () => {
    expect(
      resolveIntakeSurfaces(
        identity({ readIntake: true, createIntakeRequests: true }),
      ),
    ).toEqual({
      guestPortal: true,
      staffIntake: false,
      canCreate: true,
      canManage: false,
    });
  });

  it("hides the portal from a guest who cannot create requests", () => {
    expect(resolveIntakeSurfaces(identity({ readIntake: true }))).toEqual({
      guestPortal: false,
      staffIntake: false,
      canCreate: false,
      canManage: false,
    });
  });

  it("gives the full staff surface to a member", () => {
    expect(
      resolveIntakeSurfaces(
        identity({
          kind: "staff",
          readIntake: true,
          createIntakeRequests: true,
          updateIntake: true,
          manageIntake: true,
        }),
      ),
    ).toEqual({
      guestPortal: false,
      staffIntake: true,
      canCreate: true,
      canManage: true,
    });
  });

  it("gives a viewer the staff surface, read-only", () => {
    const surfaces = resolveIntakeSurfaces(
      identity({ kind: "staff", readIntake: true }),
    );
    expect(surfaces.staffIntake).toBe(true);
    expect(surfaces.canCreate).toBe(false);
    expect(surfaces.canManage).toBe(false);
  });

  it("shows nothing when the workspace has no intake permissions", () => {
    expect(resolveIntakeSurfaces(identity({ kind: "staff" }))).toEqual({
      guestPortal: false,
      staffIntake: false,
      canCreate: false,
      canManage: false,
    });
  });

  it("never shows a guest the staff surface, whatever the permissions say", () => {
    expect(
      resolveIntakeSurfaces(
        identity({
          readIntake: true,
          createIntakeRequests: true,
          updateIntake: true,
          manageIntake: true,
        }),
      ).staffIntake,
    ).toBe(false);
  });
});
