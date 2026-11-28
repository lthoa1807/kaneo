import { Link } from "@tanstack/react-router";
import { PaperclipIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTransitionIntakeRequest } from "@/hooks/mutations/intake/use-transition-intake-request";
import useGetIntakeRequest from "@/hooks/queries/intake/use-get-intake-request";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { HttpError } from "@/lib/http-error";
import { toast } from "@/lib/toast";
import {
  type IntakeStatus,
  type IntakeAction,
  staffActionsFor,
} from "./intake-status";
import { IntakeRequestDetail } from "./intake-request-detail";
import { RequestNoteDialog } from "./request-note-dialog";
import { AttachTaskDialog } from "./attach-task-dialog";

const ATTACH_WINDOW: ReadonlySet<IntakeStatus> = new Set([
  "approved",
  "in_progress",
  "needs_revision",
]);

type StaffRequestDetailProps = {
  workspaceId: string;
  projectId: string;
  requestId: string;
};

export function StaffRequestDetail({
  workspaceId,
  projectId,
  requestId,
}: StaffRequestDetailProps) {
  const { t } = useTranslation();
  const request = useGetIntakeRequest(requestId);
  const transition = useTransitionIntakeRequest();
  const { canUpdateIntake, canManageIntake, canCreateTasks } =
    useWorkspacePermission();
  const [pendingAction, setPendingAction] = useState<IntakeAction | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);

  if (request.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (request.isError || !request.data) {
    return (
      <p role="alert" className="text-muted-foreground text-sm">
        {t("intake:errors.loadFailed")}
      </p>
    );
  }

  const data = request.data;
  const linkedTasks = data.linkedTasks ?? [];

  const runTransition = (action: IntakeAction, note?: string) => {
    transition.mutate(
      { requestId, to: action.to, note },
      {
        onSuccess: () => setPendingAction(null),
        onError: (error) => {
          toast.error(
            error instanceof HttpError && error.status === 409
              ? t("intake:errors.transitionConflict")
              : t("intake:errors.transitionFailed"),
          );
          setPendingAction(null);
          void request.refetch();
        },
      },
    );
  };

  // Delivering again is also the staff reply in the feedback loop, so the
  // note is optional there; rejecting still needs a reason.
  const noteDialog =
    pendingAction?.to === "rejected"
      ? {
          title: t("intake:staff.rejectTitle"),
          description: t("intake:staff.rejectDescription"),
          required: true,
        }
      : {
          title: t("intake:staff.deliverTitle"),
          description: t("intake:staff.deliverDescription"),
          required: false,
        };

  // A viewer holds intake:read only; the API would answer 403 to every
  // transition, so render none.
  const actions = canUpdateIntake()
    ? staffActionsFor(data.status).map((action) => (
        <Button
          key={action.to}
          size="sm"
          variant={action.to === "rejected" ? "outline" : "default"}
          disabled={transition.isPending}
          onClick={() => {
            if (action.noteRequired || action.to === "delivered")
              setPendingAction(action);
            else runTransition(action);
          }}
        >
          {t(`intake:detail.action.${action.to}`)}
        </Button>
      ))
    : [];

  if (ATTACH_WINDOW.has(data.status) && canManageIntake() && canCreateTasks()) {
    actions.push(
      <Button
        key="attach"
        size="sm"
        variant="outline"
        onClick={() => setAttachOpen(true)}
      >
        <PaperclipIcon />
        {t("intake:staff.attachTask")}
      </Button>,
    );
  }

  return (
    <>
      <IntakeRequestDetail request={data} actions={actions} />

      {linkedTasks.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-medium text-sm">
            {t("intake:staff.linkedTasks")}
          </h2>
          <ul className="space-y-1">
            {linkedTasks.map((task) => {
              // Same key the board shows, e.g. "PE-12"; no slug means the
              // project row is gone, so the bare number is all there is.
              const taskKey = [data.projectSlug, task.number]
                .filter(Boolean)
                .join("-");
              return (
                <li key={task.id}>
                  <Link
                    to="/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId"
                    params={{ workspaceId, projectId, taskId: task.id }}
                    className="text-sm hover:underline"
                  >
                    {taskKey ? `${taskKey} · ` : ""}
                    {task.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <RequestNoteDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        title={noteDialog.title}
        description={noteDialog.description}
        required={noteDialog.required}
        pending={transition.isPending}
        onConfirm={(note) => {
          if (!pendingAction) return;
          runTransition(pendingAction, note || undefined);
        }}
      />

      <AttachTaskDialog
        open={attachOpen}
        onOpenChange={setAttachOpen}
        requestId={requestId}
        projectId={projectId}
        defaultTitle={data.title}
        defaultDescription={data.description ?? ""}
      />
    </>
  );
}
