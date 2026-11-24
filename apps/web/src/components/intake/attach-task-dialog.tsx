import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAttachIntakeTask } from "@/hooks/mutations/intake/use-attach-intake-task";
import { useGetColumns } from "@/hooks/queries/column/use-get-columns";
import type { AttachIntakeTaskBody } from "@/fetchers/intake/attach-intake-task";
import { toast } from "@/lib/toast";
import { type ChangeEvent, useId, useState } from "react";

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const DEFAULT_PRIORITY = "medium" satisfies AttachIntakeTaskBody["priority"];

type AttachTaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
  projectId: string;
  /** Seed the title with the request title so staff edit instead of retyping. */
  defaultTitle: string;
  defaultDescription: string;
};

export function AttachTaskDialog({
  open,
  onOpenChange,
  requestId,
  projectId,
  defaultTitle,
  defaultDescription,
}: AttachTaskDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const descriptionId = useId();
  const statusId = useId();
  const priorityId = useId();
  const columns = useGetColumns(open ? projectId : "");
  const attach = useAttachIntakeTask();
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [priority, setPriority] =
    useState<AttachIntakeTaskBody["priority"]>(DEFAULT_PRIORITY);
  const [status, setStatus] = useState("");

  const firstColumn = columns.data?.[0]?.slug;
  const chosenStatus = status || firstColumn || "to-do";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setTitle(defaultTitle);
          setDescription(defaultDescription);
        }
        onOpenChange(next);
      }}
    >
      <DialogPopup className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("intake:staff.attachTitle")}</DialogTitle>
          <DialogDescription>
            {t("intake:staff.attachDescription")}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            attach.mutate(
              {
                requestId,
                projectId,
                body: {
                  title: title.trim(),
                  description: description.trim(),
                  priority,
                  status: chosenStatus,
                },
              },
              {
                onSuccess: () => {
                  toast.success(t("intake:staff.attachSuccess"));
                  onOpenChange(false);
                },
                onError: () => toast.error(t("intake:staff.attachError")),
              },
            );
          }}
        >
          <DialogPanel className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={titleId}>{t("intake:staff.taskTitle")}</Label>
              <Input
                id={titleId}
                value={title}
                required
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setTitle(event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={descriptionId}>
                {t("intake:form.descriptionLabel")}
              </Label>
              <Textarea
                id={descriptionId}
                value={description}
                rows={4}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor={statusId}>{t("intake:staff.status")}</Label>
                <Select
                  value={chosenStatus}
                  onValueChange={(value) => {
                    if (typeof value === "string") setStatus(value);
                  }}
                >
                  <SelectTrigger id={statusId}>
                    <SelectValue>{chosenStatus}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(columns.data ?? []).map((column) => (
                      <SelectItem key={column.slug} value={column.slug}>
                        {column.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={priorityId}>{t("intake:staff.priority")}</Label>
                <Select
                  value={priority}
                  onValueChange={(value) => {
                    if (typeof value === "string") {
                      setPriority(value as AttachIntakeTaskBody["priority"]);
                    }
                  }}
                >
                  <SelectTrigger id={priorityId}>
                    <SelectValue>{priority}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((option) => (
                      <SelectItem key={option} value={option}>
                        <Badge variant="outline">{option}</Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" disabled={attach.isPending || !title.trim()}>
              {t("intake:staff.attachSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
