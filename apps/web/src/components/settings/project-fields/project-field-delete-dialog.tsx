import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectFieldDefinition } from "@/components/project-fields/types";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import useDeleteProjectField from "@/hooks/mutations/project-field/use-delete-project-field";
import useProjectFieldUsage from "@/hooks/queries/project-field/use-project-field-usage";
import { toast } from "@/lib/toast";

type ProjectFieldDeleteDialogProps = {
  workspaceId: string;
  field: ProjectFieldDefinition | null;
  onClose: () => void;
};

export function ProjectFieldDeleteDialog({
  workspaceId,
  field,
  onClose,
}: ProjectFieldDeleteDialogProps) {
  const { t } = useTranslation();
  const deleteField = useDeleteProjectField(workspaceId);
  const usage = useProjectFieldUsage(field?.id ?? null);
  const [error, setError] = useState("");

  const blocked = (usage.data?.dependentFormulaCount ?? 0) > 0;

  const handleDelete = async () => {
    if (!field || blocked) return;
    setError("");
    try {
      await deleteField.mutateAsync(field.id);
      toast.success(t("settings:workspaceProjectFields.deleteSuccess"));
      onClose();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error && deleteError.message
          ? deleteError.message
          : t("settings:workspaceProjectFields.deleteError"),
      );
    }
  };

  return (
    <Dialog
      open={field !== null}
      onOpenChange={(open) => {
        if (!open && !deleteField.isPending) {
          setError("");
          onClose();
        }
      }}
    >
      <DialogPopup className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("settings:workspaceProjectFields.deleteTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("settings:workspaceProjectFields.deleteDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-3 text-sm">
          {usage.isPending ? null : usage.isError ? (
            <p className="text-muted-foreground">
              {t("settings:workspaceProjectFields.usageUnavailable")}
            </p>
          ) : usage.data ? (
            <>
              <p className="text-muted-foreground">
                {t("settings:workspaceProjectFields.deleteUsage", {
                  projects: usage.data.projectCount,
                  formulas: usage.data.dependentFormulaCount,
                })}
              </p>
              {usage.data.dependentFormulas.length > 0 ? (
                <div className="rounded-md border border-border bg-muted/40 p-3">
                  <p className="font-medium">
                    {t("settings:workspaceProjectFields.deleteBlocked")}
                  </p>
                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                    {usage.data.dependentFormulas.map((formula) => (
                      <li key={formula.id}>{formula.name}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
          {error ? (
            <p role="alert" className="text-destructive-foreground">
              {error}
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteField.isPending || blocked}
            onClick={() => void handleDelete()}
          >
            {t("settings:workspaceProjectFields.deleteConfirm")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
