import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { GuestPortalLayout } from "@/components/intake/guest-portal-layout";
import { GuestPortalPage } from "@/components/intake/guest-portal-page";
import { IntakeAccessGate } from "@/components/intake/intake-access-gate";
import PageTitle from "@/components/page-title";
import { useIntakeSurfaces } from "@/hooks/use-intake-surfaces";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/requests/",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId, projectId } = Route.useParams();
  const { surfaces, ready } = useIntakeSurfaces();

  return (
    <>
      <PageTitle title={t("intake:portal.title")} />
      <GuestPortalLayout workspaceId={workspaceId} projectId={projectId}>
        <div className="h-full overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
            <IntakeAccessGate
              allowed={surfaces.guestPortal}
              ready={ready}
              workspaceId={workspaceId}
            >
              <GuestPortalPage
                workspaceId={workspaceId}
                projectId={projectId}
              />
            </IntakeAccessGate>
          </div>
        </div>
      </GuestPortalLayout>
    </>
  );
}
