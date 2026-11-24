import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import { IntakeAccessGate } from "@/components/intake/intake-access-gate";
import { StaffIntakePage } from "@/components/intake/staff-intake-page";
import PageTitle from "@/components/page-title";
import { useIntakeSurfaces } from "@/hooks/use-intake-surfaces";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/intake/",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId, projectId } = Route.useParams();
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
          <IntakeAccessGate
            allowed={surfaces.staffIntake}
            ready={ready}
            workspaceId={workspaceId}
            projectId={projectId}
          >
            <StaffIntakePage workspaceId={workspaceId} projectId={projectId} />
          </IntakeAccessGate>
        </div>
      </ProjectLayout>
    </>
  );
}
