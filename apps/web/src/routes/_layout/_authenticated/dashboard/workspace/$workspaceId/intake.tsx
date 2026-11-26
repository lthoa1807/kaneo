import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { IntakeAccessGate } from "@/components/intake/intake-access-gate";
import { StaffIntakePage } from "@/components/intake/staff-intake-page";
import PageTitle from "@/components/page-title";
import { useIntakeSurfaces } from "@/hooks/use-intake-surfaces";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/intake",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { surfaces, ready } = useIntakeSurfaces();

  return (
    <>
      <PageTitle title={t("intake:staff.title")} />
      <WorkspaceLayout title={t("intake:staff.title")}>
        <div className="h-full overflow-y-auto">
          <IntakeAccessGate
            allowed={surfaces.staffIntake}
            ready={ready}
            workspaceId={workspaceId}
          >
            <StaffIntakePage workspaceId={workspaceId} />
          </IntakeAccessGate>
        </div>
      </WorkspaceLayout>
    </>
  );
}
