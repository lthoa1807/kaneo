import { Link } from "@tanstack/react-router";
import { List } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ProjectFieldValueRow } from "@/components/settings/project-general/project-field-value-row";
import { SettingsCard } from "@/components/settings/settings-card";
import { SettingsEmpty } from "@/components/settings/settings-empty";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import useSetProjectFieldValue from "@/hooks/mutations/project-field/use-set-project-field-value";
import useProjectFieldValues from "@/hooks/queries/project-field/use-project-field-values";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";

export function ProjectFieldValuesSection({
  projectId,
}: {
  projectId: string;
}) {
  const { t } = useTranslation();
  const { data: workspace } = useActiveWorkspace();
  const { canUpdateProjects } = useWorkspacePermission();
  const {
    data: fields,
    isLoading,
    isError,
    refetch,
  } = useProjectFieldValues(projectId);
  const setValue = useSetProjectFieldValue();
  const canEdit = canUpdateProjects() && Boolean(workspace?.id);

  if (isLoading) {
    return (
      <SettingsSection title={t("settings:projectGeneral.projectFields.title")}>
        <SettingsCard>
          <div className="space-y-3 p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </SettingsCard>
      </SettingsSection>
    );
  }

  if (isError) {
    return (
      <SettingsSection title={t("settings:projectGeneral.projectFields.title")}>
        <SettingsCard>
          <div className="flex items-center justify-between gap-4 p-4">
            <p className="text-muted-foreground text-sm">
              {t("settings:projectGeneral.projectFields.loadError")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
            >
              {t("settings:projectGeneral.projectFields.retry")}
            </Button>
          </div>
        </SettingsCard>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title={t("settings:projectGeneral.projectFields.title")}
      description={t("settings:projectGeneral.projectFields.description")}
    >
      {fields && fields.length > 0 ? (
        <SettingsCard>
          {fields.map((field) => (
            <ProjectFieldValueRow
              key={field.id}
              field={field}
              canEdit={canEdit}
              saving={
                setValue.isPending && setValue.variables?.fieldId === field.id
              }
              onSave={(value) => {
                if (!workspace?.id) return;
                setValue.mutate(
                  {
                    workspaceId: workspace.id,
                    projectId,
                    fieldId: field.id,
                    value,
                  },
                  {
                    onError: (error) => {
                      toast.error(
                        error instanceof Error && error.message
                          ? error.message
                          : t(
                              "settings:projectGeneral.projectFields.saveError",
                            ),
                      );
                    },
                  },
                );
              }}
            />
          ))}
        </SettingsCard>
      ) : (
        <SettingsCard>
          <SettingsEmpty
            icon={<List />}
            title={t("settings:projectGeneral.projectFields.empty")}
            description={t(
              "settings:projectGeneral.projectFields.definedInWorkspace",
            )}
            action={
              <Button
                variant="outline"
                size="sm"
                render={
                  <Link to="/dashboard/settings/workspace/project-fields" />
                }
              >
                {t("settings:projectGeneral.projectFields.emptyAction")}
              </Button>
            }
          />
        </SettingsCard>
      )}
    </SettingsSection>
  );
}
