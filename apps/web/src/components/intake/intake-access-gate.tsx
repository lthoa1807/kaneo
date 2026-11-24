import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";

// Guests hold no workspace:read and staff may lack intake:read, so each surface
// sends an unentitled visitor home instead of rendering a page it cannot fill.
export function IntakeAccessGate({
  allowed,
  workspaceId,
  projectId,
  children,
}: {
  allowed: boolean;
  workspaceId: string;
  /** Set on project surfaces to send an unentitled visitor to the board. */
  projectId?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    if (allowed) return;
    void navigate(
      projectId
        ? {
            to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
            params: { workspaceId, projectId },
          }
        : {
            to: "/dashboard/workspace/$workspaceId",
            params: { workspaceId },
          },
    );
  }, [allowed, navigate, projectId, workspaceId]);

  return allowed ? children : null;
}
