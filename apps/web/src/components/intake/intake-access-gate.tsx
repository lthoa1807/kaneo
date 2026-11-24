import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";

// Guests hold no workspace:read and staff may lack intake:read, so each surface
// sends an unentitled visitor home instead of rendering a page it cannot fill.
export function IntakeAccessGate({
  allowed,
  workspaceId,
  children,
}: {
  allowed: boolean;
  workspaceId: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    if (allowed) return;
    void navigate({
      to: "/dashboard/workspace/$workspaceId",
      params: { workspaceId },
    });
  }, [allowed, navigate, workspaceId]);

  return allowed ? children : null;
}
