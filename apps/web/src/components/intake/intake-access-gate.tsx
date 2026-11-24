import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";

// Guests hold no workspace:read and staff may lack intake:read, so each surface
// sends an unentitled visitor home instead of rendering a page it cannot fill.
export function IntakeAccessGate({
  allowed,
  ready = true,
  workspaceId,
  projectId,
  children,
}: {
  allowed: boolean;
  /** False while membership and capabilities load; do not bounce yet. */
  ready?: boolean;
  workspaceId: string;
  /** Set on project surfaces to send an unentitled visitor to the board. */
  projectId?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    if (allowed || !ready) return;
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
  }, [allowed, ready, navigate, projectId, workspaceId]);

  return allowed && ready ? children : null;
}
