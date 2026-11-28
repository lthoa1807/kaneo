import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GuestRequestList } from "@/components/intake/guest-request-list";
import type { IntakeGroupFilter } from "@/components/intake/intake-groups";
import { IntakeRequestFormModal } from "@/components/intake/intake-request-form-modal";
import { IntakeSummary } from "@/components/intake/intake-summary";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import useGetIntakeRequestPages from "@/hooks/queries/intake/use-get-intake-request-pages";
import useGetIntakeRequests from "@/hooks/queries/intake/use-get-intake-requests";
import { cn } from "@/lib/cn";

const PAGE_LIMIT = 100;

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
  const [group, setGroup] = useState<IntakeGroupFilter>("all");
  const [showAll, setShowAll] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const requests = useGetIntakeRequests({
    workspaceId,
    projectId,
    group,
    limit: PAGE_LIMIT,
  });
  const extraPages = useGetIntakeRequestPages({
    workspaceId,
    projectId,
    group,
    limit: PAGE_LIMIT,
    totalPages: requests.data?.totalPages ?? 0,
    enabled: showAll,
  });

  const counts = requests.data?.counts;
  const total = requests.data?.total ?? 0;
  // Cached pages stay in the query cache after a group switch; only append
  // them while the user is in "show all" mode, otherwise stale rows return.
  // Page 1 and the extra pages poll separately, so merge by id too.
  const items = [
    ...new Map(
      [
        ...(requests.data?.items ?? []),
        ...(showAll ? extraPages.items : []),
      ].map((item) => [item.id, item]),
    ).values(),
  ];
  const awaiting = counts?.awaiting ?? 0;

  // A new group is a new list: page 2 of the previous group must not leak in.
  const selectGroup = (next: IntakeGroupFilter) => {
    setGroup(next);
    setShowAll(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-2xl tracking-tight">
          {t("intake:portal.title")}
        </h1>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus />
          {t("intake:portal.newRequest")}
        </Button>
      </header>

      {awaiting > 0 ? (
        <section
          aria-labelledby="intake-banner-heading"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-secondary/40 p-3"
        >
          <h2 id="intake-banner-heading" className="sr-only">
            {t("intake:portal.bannerTitle")}
          </h2>
          <p className="text-sm">
            {t("intake:portal.banner", { count: awaiting })}
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => selectGroup("awaiting")}
          >
            {t("intake:portal.bannerAction")}
          </Button>
        </section>
      ) : null}

      {requests.isLoading ? (
        <div className="flex flex-col gap-4">
          <IntakeSummary selected={group} onSelect={selectGroup} />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-11 w-full" />
            ))}
          </div>
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
          <IntakeSummary
            counts={counts}
            selected={group}
            onSelect={selectGroup}
          />

          <div
            className={cn(
              "transition-opacity",
              requests.isPlaceholderData && "opacity-60",
            )}
          >
            <GuestRequestList
              items={items}
              showProject={!projectId}
              emptyLabel={
                group === "all"
                  ? t("intake:list.empty")
                  : t("intake:portal.emptyGroup")
              }
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
          </div>

          {!requests.isPlaceholderData && items.length < total ? (
            <div className="flex flex-col items-center gap-2">
              {extraPages.isError ? (
                <p className="text-destructive-foreground text-sm">
                  {t("intake:list.loadError")}
                </p>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={extraPages.isFetching}
                onClick={() => {
                  if (showAll) void extraPages.refetch();
                  else setShowAll(true);
                }}
              >
                {extraPages.isFetching
                  ? t("intake:portal.showAllLoading")
                  : t("intake:portal.showAll", { total })}
              </Button>
            </div>
          ) : null}
        </>
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
