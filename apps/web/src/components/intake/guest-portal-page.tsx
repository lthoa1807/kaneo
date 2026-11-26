import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IntakeRequestList } from "@/components/intake/intake-request-list";
import { IntakeRequestFormModal } from "@/components/intake/intake-request-form-modal";
import {
  INTAKE_STATUSES,
  type IntakeStatus,
} from "@/components/intake/intake-status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import useGetIntakeRequests from "@/hooks/queries/intake/use-get-intake-requests";
import { cn } from "@/lib/cn";

type StatusFilter = IntakeStatus | "all";

export function GuestPortalPage({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  /** Omit on the workspace-level page to list every accessible request. */
  projectId?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const requests = useGetIntakeRequests({
    workspaceId,
    projectId,
    status: status === "all" ? undefined : status,
  });

  const filters: StatusFilter[] = ["all", ...INTAKE_STATUSES];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-2xl tracking-tight">
          {t("intake:portal.title")}
        </h1>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus />
          {t("intake:portal.newRequest")}
        </Button>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {filters.map((filter) => (
          <Button
            key={filter}
            type="button"
            size="sm"
            variant={filter === status ? "secondary" : "ghost"}
            className={cn(
              "h-7 px-2 text-xs",
              filter !== status && "text-muted-foreground",
            )}
            onClick={() => setStatus(filter)}
          >
            {filter === "all"
              ? t("intake:portal.all")
              : t(`intake:status.${filter}`)}
          </Button>
        ))}
      </div>

      {requests.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>
      ) : requests.isError ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-destructive-foreground text-sm">
            {t("intake:list.loadError")}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void requests.refetch()}
          >
            {t("intake:list.retry")}
          </Button>
        </div>
      ) : (
        <IntakeRequestList
          items={requests.data?.items ?? []}
          showProject={!projectId}
          onRowClick={(request) => {
            const targetProject = request.projectId ?? projectId;
            if (!targetProject) return;
            void navigate({
              to: "/dashboard/workspace/$workspaceId/project/$projectId/requests/$requestId",
              params: {
                workspaceId,
                projectId: targetProject,
                requestId: request.id,
              },
            });
          }}
        />
      )}

      <IntakeRequestFormModal
        workspaceId={workspaceId}
        projectId={projectId}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
    </div>
  );
}
