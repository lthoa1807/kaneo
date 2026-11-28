import { Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTransitionIntakeRequest } from "@/hooks/mutations/intake/use-transition-intake-request";
import useGetIntakeRequest from "@/hooks/queries/intake/use-get-intake-request";
import { HttpError } from "@/lib/http-error";
import { toast } from "@/lib/toast";
import { IntakeRequestDetail } from "./intake-request-detail";
import { type IntakeAction, guestActionsFor } from "./intake-status";
import { RequestNoteDialog } from "./request-note-dialog";

type GuestRequestDetailProps = {
  workspaceId: string;
  projectId: string;
  requestId: string;
};

export function GuestRequestDetail({
  workspaceId,
  projectId,
  requestId,
}: GuestRequestDetailProps) {
  const { t } = useTranslation();
  const request = useGetIntakeRequest(requestId);
  const transition = useTransitionIntakeRequest();
  const [pendingAction, setPendingAction] = useState<IntakeAction | null>(null);

  if (request.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
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

  // A guest keeps access only to the projects they were invited to; a stale
  // link to another project goes back to their portal.
  if (data.projectId !== projectId) {
    return (
      <Navigate
        to="/dashboard/workspace/$workspaceId/my-requests"
        params={{ workspaceId }}
        replace
      />
    );
  }

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

  const actions = guestActionsFor(data.status).map((action) => (
    <Button
      key={action.to}
      variant={action.noteRequired ? "outline" : "default"}
      size="sm"
      disabled={transition.isPending}
      onClick={() => {
        if (action.noteRequired) setPendingAction(action);
        else runTransition(action);
      }}
    >
      {t(`intake:detail.action.${action.to}`)}
    </Button>
  ));

  return (
    <>
      <IntakeRequestDetail request={data} actions={actions} showStepper />
      {data.confirmedAt ? (
        <p className="text-muted-foreground text-xs">
          {t("intake:detail.confirmedOn", {
            date: new Date(data.confirmedAt).toLocaleDateString(),
          })}
        </p>
      ) : null}
      <RequestNoteDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        title={t("intake:detail.revisionTitle")}
        description={t("intake:detail.revisionDescription")}
        required
        pending={transition.isPending}
        onConfirm={(note) => {
          if (!pendingAction) return;
          runTransition(pendingAction, note);
        }}
      />
    </>
  );
}
