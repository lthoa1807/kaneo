import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import { IntakeAccessGate } from "@/components/intake/intake-access-gate";
import { StaffRequestDetail } from "@/components/intake/staff-request-detail";
import PageTitle from "@/components/page-title";
import { useIntakeSurfaces } from "@/hooks/use-intake-surfaces";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/intake/$requestId_",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId, projectId, requestId } = Route.useParams();
  const { surfaces, ready } = useIntakeSurfaces();

  return (
    <>
      <PageTitle title={t("intake:staff.title")} />
      <ProjectLayout
        workspaceId={workspaceId}
        projectId={projectId}
        activeView="intake"
      >
        <div className="h-full overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
            <IntakeAccessGate
              allowed={surfaces.staffIntake}
              ready={ready}
              workspaceId={workspaceId}
              projectId={projectId}
            >
              <StaffRequestDetail
                workspaceId={workspaceId}
                projectId={projectId}
                requestId={requestId}
              />
            </IntakeAccessGate>
          </div>
        </div>
      </ProjectLayout>
    </>
  );
}
