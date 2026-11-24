import { resolveIntakeSurfaces } from "@/components/intake/intake-surfaces";
import useGetWorkspaceMembership from "@/hooks/queries/workspace/use-get-workspace-membership";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

// Identity (guest or staff) comes from membership; capabilities only decide what
// the surface offers. `ready` stays false until both have answered, so callers
// never flash the staff UI at a guest while the identity request is in flight.
export function useIntakeSurfaces() {
  const { data: workspace } = useActiveWorkspace();
  const membership = useGetWorkspaceMembership(workspace?.id);
  const permission = useWorkspacePermission();

  const surfaces = resolveIntakeSurfaces({
    kind: membership.data?.kind ?? "guest",
    readIntake: permission.canReadIntake(),
    createIntakeRequests: permission.canCreateIntakeRequests(),
    updateIntake: permission.canUpdateIntake(),
    manageIntake: permission.canManageIntake(),
  });

  return {
    surfaces,
    ready:
      Boolean(workspace?.id) &&
      membership.isSuccess &&
      !permission.isCheckingPermissions,
  };
}
