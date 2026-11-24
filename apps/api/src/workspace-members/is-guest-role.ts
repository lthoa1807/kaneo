import { splitRoles } from "../utils/split-roles";

// The role column stores one or more role names; `guest` is a reserved role.
export function isGuestRole(role: string | null | undefined): boolean {
  return splitRoles(role).includes("guest");
}
