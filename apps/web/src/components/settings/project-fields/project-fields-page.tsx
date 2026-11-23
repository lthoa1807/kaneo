import { PlusIcon, SlidersHorizontalIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ProjectFieldDeleteDialog } from "@/components/settings/project-fields/project-field-delete-dialog";
import { ProjectFieldDialog } from "@/components/settings/project-fields/project-field-dialog";
import { ProjectFieldRow } from "@/components/settings/project-fields/project-field-row";
import { SettingsCard } from "@/components/settings/settings-card";
import { SettingsEmpty } from "@/components/settings/settings-empty";
import { SettingsPage } from "@/components/settings/settings-page";
import { SettingsRowsSkeleton } from "@/components/settings/settings-rows-skeleton";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import type { ProjectFieldDefinition } from "@/components/project-fields/types";
import useReorderProjectFields from "@/hooks/mutations/project-field/use-reorder-project-fields";
import useProjectFields from "@/hooks/queries/project-field/use-project-fields";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";

export function ProjectFieldsPage() {
  const { t } = useTranslation();
  const { workspace, canManageSettings } = useWorkspacePermission();
  const workspaceId = workspace?.id ?? "";
  const fieldsQuery = useProjectFields(workspaceId);
  const reorderFields = useReorderProjectFields(workspaceId);
  const canManage = canManageSettings();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] =
    useState<ProjectFieldDefinition | null>(null);
  const [deletingField, setDeletingField] =
    useState<ProjectFieldDefinition | null>(null);

  const openDialog = (field: ProjectFieldDefinition | null) => {
    setEditingField(field);
    setDialogOpen(true);
  };

  const move = (field: ProjectFieldDefinition, direction: -1 | 1) => {
    const fields = fieldsQuery.data ?? [];
    const index = fields.findIndex((candidate) => candidate.id === field.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= fields.length) return;

    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    reorderFields.mutate(
      {
        workspaceId,
        fields: next.map((candidate, position) => ({
          id: candidate.id,
          position,
        })),
      },
      {
        onError: (error) =>
          toast.error(
            error instanceof Error
              ? error.message
              : t("settings:workspaceProjectFields.updateError"),
          ),
      },
    );
  };

  const newFieldButton = canManage ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => openDialog(null)}
    >
      <PlusIcon aria-hidden="true" />
      {t("settings:workspaceProjectFields.newField")}
    </Button>
  ) : null;

  const renderFields = () => {
    if (fieldsQuery.isPending) return <SettingsRowsSkeleton />;
    if (fieldsQuery.isError) {
      return (
        <p
          role="alert"
          className="px-4 py-3.5 text-destructive-foreground text-sm"
        >
          {t("settings:workspaceProjectFields.loadError")}
        </p>
      );
    }
    const fields = fieldsQuery.data ?? [];
    if (fields.length === 0) {
      return (
        <SettingsEmpty
          icon={<SlidersHorizontalIcon />}
          title={t("settings:workspaceProjectFields.emptyTitle")}
          description={t("settings:workspaceProjectFields.emptyDescription")}
          action={newFieldButton}
        />
      );
    }
    return fields.map((field, index) => (
      <ProjectFieldRow
        key={field.id}
        field={field}
        canManage={canManage}
        canMoveUp={index > 0}
        canMoveDown={index < fields.length - 1}
        onEdit={openDialog}
        onDelete={setDeletingField}
        onMove={move}
      />
    ));
  };

  return (
    <>
      <SettingsPage
        title={t("settings:workspaceProjectFields.title")}
        description={t("settings:workspaceProjectFields.subtitle")}
        actions={newFieldButton}
      >
        <SettingsSection>
          <SettingsCard>{renderFields()}</SettingsCard>
        </SettingsSection>
      </SettingsPage>
      {canManage && workspaceId ? (
        <>
          <ProjectFieldDialog
            key={editingField?.id ?? "new"}
            open={dialogOpen}
            workspaceId={workspaceId}
            fields={fieldsQuery.data ?? []}
            field={editingField}
            onClose={() => setDialogOpen(false)}
          />
          <ProjectFieldDeleteDialog
            workspaceId={workspaceId}
            field={deletingField}
            onClose={() => setDeletingField(null)}
          />
        </>
      ) : null}
    </>
  );
}
