import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { ProjectFieldsPage } from "@/components/settings/project-fields/project-fields-page";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/workspace/project-fields",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();

  return (
    <>
      <PageTitle title={t("settings:workspaceProjectFields.pageTitle")} />
      <ProjectFieldsPage />
    </>
  );
}
