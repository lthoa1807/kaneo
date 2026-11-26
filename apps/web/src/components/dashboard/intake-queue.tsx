import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import useGetIntakeRequests from "@/hooks/queries/intake/use-get-intake-requests";
import type { IntakeRequestListItem } from "@/fetchers/intake/list-intake-requests";
import WidgetCard from "./widget-card";

const ROWS_PER_GROUP = 4;

function ageInDays(createdAt: string) {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000),
  );
}

function IntakeRow({
  request,
  workspaceId,
}: {
  request: IntakeRequestListItem;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const days = ageInDays(request.createdAt);

  return (
    <li>
      <Link
        to="/dashboard/workspace/$workspaceId/project/$projectId/intake/$requestId"
        params={{
          workspaceId,
          projectId: request.projectId,
          requestId: request.id,
        }}
        className="flex flex-col gap-0.5 rounded px-1 py-1 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="truncate text-xs">{request.title}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
          <span className="tabular-nums">{request.displayId}</span>
          <span className="rounded border px-1">{request.projectName}</span>
          <span>
            {days === 0
              ? t("dashboard:intake.age.today")
              : t("dashboard:intake.age.days", { count: days })}
          </span>
        </span>
      </Link>
    </li>
  );
}

/**
 * Two groups over the existing intake endpoint: new + triaged wait for the
 * team, in_progress is being worked on. Rows are links, not drill triggers.
 */
export default function IntakeQueue({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const request = { workspaceId, limit: ROWS_PER_GROUP };
  const fresh = useGetIntakeRequests({ ...request, status: "new" });
  const triaged = useGetIntakeRequests({ ...request, status: "triaged" });
  const inProgress = useGetIntakeRequests({
    ...request,
    status: "in_progress",
  });

  const waiting = [
    ...(fresh.data?.items ?? []),
    ...(triaged.data?.items ?? []),
  ].slice(0, ROWS_PER_GROUP);
  const waitingTotal = (fresh.data?.total ?? 0) + (triaged.data?.total ?? 0);
  const progress = inProgress.data?.items ?? [];

  const groups = [
    {
      key: "waiting",
      label: t("dashboard:intake.waiting"),
      total: waitingTotal,
      items: waiting,
    },
    {
      key: "inProgress",
      label: t("dashboard:intake.inProgress"),
      total: inProgress.data?.total ?? 0,
      items: progress,
    },
  ];

  return (
    <WidgetCard
      title={t("dashboard:intake.title")}
      hint={t("dashboard:intake.hint")}
      footer={
        <Link
          to="/dashboard/workspace/$workspaceId/projects"
          params={{ workspaceId }}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          {t("dashboard:intake.viewAll")}
        </Link>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-1">
            <h3 className="flex items-baseline justify-between text-xs font-medium">
              <span>{group.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {group.total}
              </span>
            </h3>
            {group.items.length === 0 ? (
              <p className="text-muted-foreground text-[11px]">
                {t("dashboard:intake.empty")}
              </p>
            ) : (
              <ul className="flex flex-col">
                {group.items.map((item) => (
                  <IntakeRow
                    key={item.id}
                    request={item}
                    workspaceId={workspaceId}
                  />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </WidgetCard>
  );
}
