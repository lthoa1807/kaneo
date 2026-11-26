import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import useGetIntakeRequests from "@/hooks/queries/intake/use-get-intake-requests";
import { cn } from "@/lib/cn";
import { IntakeRequestList } from "./intake-request-list";
import { INTAKE_STATUSES, type IntakeStatus } from "./intake-status";

type StatusFilter = IntakeStatus | "all";

const STAFF_GROUPS: ReadonlyArray<{
  key: "triage" | "progress" | "awaiting" | "closed";
  statuses: IntakeStatus[];
}> = [
  { key: "triage", statuses: ["new", "triaged"] },
  { key: "progress", statuses: ["approved", "in_progress", "needs_revision"] },
  { key: "awaiting", statuses: ["delivered"] },
  { key: "closed", statuses: ["confirmed", "rejected"] },
];

const PAGE_LIMIT = 100;

export function StaffIntakePage({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  /** Omitted on the workspace-wide list, which spans every readable project. */
  projectId?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusFilter>("all");
  const requests = useGetIntakeRequests({
    workspaceId,
    projectId,
    status: status === "all" ? undefined : status,
    limit: PAGE_LIMIT,
  });

  const items = requests.data?.items ?? [];
  const total = requests.data?.total ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-2xl tracking-tight">
          {t("intake:staff.title")}
        </h1>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {(["all", ...INTAKE_STATUSES] as StatusFilter[]).map((filter) => (
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
        <>
          {/* One page of 100, grouped in the browser. Say so rather than let a
              group look complete: the guest's work must never hide behind a cut. */}
          {total > items.length ? (
            <p className="text-muted-foreground text-xs">
              {t("intake:staff.truncated", {
                shown: items.length,
                total,
              })}
            </p>
          ) : null}

          {items.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground text-sm">
              {t("intake:list.empty")}
            </p>
          ) : (
            STAFF_GROUPS.map((group) => {
              const groupItems = items.filter((item) =>
                group.statuses.includes(item.status),
              );
              if (groupItems.length === 0) return null;
              return (
                <section key={group.key} className="space-y-2">
                  <h2 className="flex items-center gap-2 font-medium text-sm">
                    {t(`intake:staff.group.${group.key}`)}
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {groupItems.length}
                    </span>
                  </h2>
                  <IntakeRequestList
                    items={groupItems}
                    showProject={!projectId}
                    onRowClick={(request) => {
                      const target = request.projectId ?? projectId;
                      if (!target) return;
                      void navigate({
                        to: "/dashboard/workspace/$workspaceId/project/$projectId/intake/$requestId",
                        params: {
                          workspaceId,
                          projectId: target,
                          requestId: request.id,
                        },
                      });
                    }}
                  />
                </section>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
