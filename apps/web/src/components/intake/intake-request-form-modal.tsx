import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateIntakeRequest } from "@/hooks/mutations/intake/use-create-intake-request";
import useGetIntakeProjects from "@/hooks/queries/intake/use-get-intake-projects";
import { toast } from "@/lib/toast";

type IntakeRequestFormModalProps = {
  workspaceId: string;
  /** Omit to let the guest pick an intake-enabled project. */
  projectId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function IntakeRequestFormModal({
  workspaceId,
  projectId,
  open,
  onOpenChange,
}: IntakeRequestFormModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const descriptionId = useId();
  const projectSelectId = useId();
  const projects = useGetIntakeProjects(projectId ? undefined : workspaceId);
  const create = useCreateIntakeRequest();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedProject, setSelectedProject] = useState<string>("");

  const targetProject = projectId ?? selectedProject;
  const canSubmit = title.trim() !== "" && targetProject !== "";

  const close = () => {
    setTitle("");
    setDescription("");
    setSelectedProject("");
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(next);
      }}
    >
      <DialogPopup className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("intake:form.title")}</DialogTitle>
          <DialogDescription>{t("intake:form.description")}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            create.mutate(
              {
                workspaceId,
                projectId: targetProject,
                title: title.trim(),
                description: description.trim() || undefined,
              },
              {
                onSuccess: () => {
                  toast.success(t("intake:form.success"));
                  close();
                },
                onError: () => toast.error(t("intake:form.error")),
              },
            );
          }}
        >
          <DialogPanel className="space-y-4">
            {projectId ? null : (
              <div className="space-y-2">
                <Label htmlFor={projectSelectId}>
                  {t("intake:form.projectLabel")}
                </Label>
                <Select
                  value={selectedProject}
                  onValueChange={(value) => {
                    if (typeof value === "string") setSelectedProject(value);
                  }}
                >
                  <SelectTrigger id={projectSelectId}>
                    <SelectValue>
                      {projects.data?.find(
                        (project) => project.id === selectedProject,
                      )?.name ?? t("intake:form.projectPlaceholder")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {projects.data?.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor={titleId}>{t("intake:form.titleLabel")}</Label>
              <Input
                id={titleId}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("intake:form.titlePlaceholder")}
                required
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={descriptionId}>
                {t("intake:form.descriptionLabel")}
              </Label>
              <Textarea
                id={descriptionId}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("intake:form.descriptionPlaceholder")}
                rows={4}
              />
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit || create.isPending}>
              {t(
                create.isPending
                  ? "intake:form.submitting"
                  : "intake:form.submit",
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
