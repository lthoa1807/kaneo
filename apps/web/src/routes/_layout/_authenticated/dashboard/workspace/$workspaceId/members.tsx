import { createFileRoute } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import InviteTeamMemberModal from "@/components/team/invite-team-member-modal";
import MembersTable from "@/components/team/members-table";
import { Button } from "@/components/ui/button";
import useGetFullWorkspace from "@/hooks/queries/workspace/use-get-full-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/members",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { data: workspace } = useGetFullWorkspace({ workspaceId });
  const { canInviteUsers } = useWorkspacePermission();
  const canInvite = Boolean(canInviteUsers());
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isInviteGuestOpen, setIsInviteGuestOpen] = useState(false);

  return (
    <>
      <PageTitle title={t("team:members.pageTitle")} />
      <WorkspaceLayout
        title={t("team:members.pageTitle")}
        headerActions={
          canInvite ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="xs"
                onClick={() => setIsInviteGuestOpen(true)}
                className="gap-1"
              >
                <UserPlus className="w-3 h-3" />
                {t("team:members.inviteGuest")}
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() => setIsInviteOpen(true)}
                className="gap-1"
              >
                <UserPlus className="w-3 h-3" />
                {t("team:members.inviteMember")}
              </Button>
            </div>
          ) : null
        }
      >
        <MembersTable
          workspaceId={workspaceId}
          users={workspace?.members ?? []}
          invitations={workspace?.invitations ?? []}
        />

        <InviteTeamMemberModal
          open={isInviteOpen}
          onClose={() => setIsInviteOpen(false)}
        />

        <InviteTeamMemberModal
          mode="guest"
          open={isInviteGuestOpen}
          onClose={() => setIsInviteGuestOpen(false)}
        />
      </WorkspaceLayout>
    </>
  );
}
