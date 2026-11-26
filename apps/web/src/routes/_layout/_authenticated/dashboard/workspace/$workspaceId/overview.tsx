import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import DashboardSkeleton from "@/components/dashboard/dashboard-skeleton";
import DeadlineRisk from "@/components/dashboard/deadline-risk";
import DueLoadChart from "@/components/dashboard/due-load-chart";
import IntakeQueue from "@/components/dashboard/intake-queue";
import MetricTile from "@/components/dashboard/metric-tile";
import PriorityDonut from "@/components/dashboard/priority-donut";
import ProjectLoadChart from "@/components/dashboard/project-load-chart";
import TaskDrilldown from "@/components/dashboard/task-drilldown";
import WidgetCard from "@/components/dashboard/widget-card";
import WidgetError from "@/components/dashboard/widget-error";
import type { Drill } from "@/components/dashboard/types";
import { navForSurfaces } from "@/components/intake/intake-surfaces";
import PageTitle from "@/components/page-title";
import useGetDashboardSummary from "@/hooks/queries/dashboard/use-get-dashboard-summary";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import useGetAssignedTasks from "@/hooks/queries/task/use-get-assigned-tasks";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { useIntakeSurfaces } from "@/hooks/use-intake-surfaces";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/overview",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { surfaces, ready } = useIntakeSurfaces();
  // Guests hold no task:read or project:read; disable, do not merely unrender.
  const staffNav = navForSurfaces(surfaces).staffNav;
  const enabled = ready && staffNav;

  const summary = useGetDashboardSummary(workspaceId, enabled);
  const projects = useGetProjects({ workspaceId, enabled }, false);
  const members = useGetActiveWorkspaceUsers(enabled ? workspaceId : "");
  const assigned = useGetAssignedTasks(workspaceId, true, enabled);
  const [drill, setDrill] = useState<Drill | null>(null);

  if (ready && !staffNav) {
    return (
      <Navigate
        to="/dashboard/workspace/$workspaceId/my-requests"
        params={{ workspaceId }}
        replace
      />
    );
  }

  const tasks = summary.data?.tasks;
  const charts = summary.data?.charts;

  const openBucket = (
    title: string,
    hint: string,
    bucket: NonNullable<typeof tasks>["mineOverdue"],
    filters: Drill["filters"],
  ) => setDrill({ title, hint, bucket, filters });

  const openChart = (title: string, hint: string, filters: Drill["filters"]) =>
    setDrill({ title, hint, filters });

  return (
    <>
      <PageTitle title={t("dashboard:title")} />
      <WorkspaceLayout title={t("dashboard:title")}>
        <div className="h-full overflow-y-auto">
          <div className="overview-atmosphere" aria-hidden="true" />
          <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6">
            <header className="flex flex-col gap-1">
              <h1 className="font-semibold text-2xl tracking-tight">
                {t("dashboard:title")}
              </h1>
            </header>

            {summary.isLoading ? (
              <DashboardSkeleton />
            ) : summary.isError ? (
              <WidgetError onRetry={() => summary.refetch()} />
            ) : (
              <>
                <section
                  aria-label={t("dashboard:title")}
                  className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
                >
                  <MetricTile
                    label={t("dashboard:tiles.projects")}
                    value={projects.data?.length}
                  />
                  <MetricTile
                    label={t("dashboard:tiles.members")}
                    value={members.data?.total}
                  />
                  <MetricTile
                    label={t("dashboard:tiles.myOpen")}
                    value={assigned.data?.total}
                  />
                  <MetricTile
                    label={t("dashboard:tiles.myOverdue")}
                    value={tasks?.mineOverdue.total}
                    onOpen={() =>
                      tasks &&
                      openBucket(
                        t("dashboard:tiles.myOverdue"),
                        t("dashboard:risk.hint"),
                        tasks.mineOverdue,
                        {},
                      )
                    }
                  />
                </section>

                <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                  <DeadlineRisk
                    className="xl:col-span-2"
                    title={t("dashboard:risk.title")}
                    hint={t("dashboard:risk.hint")}
                    blocks={[
                      {
                        label: t("dashboard:risk.overdue"),
                        value: tasks?.overdueUrgent.total ?? 0,
                        onOpen: () =>
                          tasks &&
                          openBucket(
                            t("dashboard:risk.overdue"),
                            t("dashboard:risk.hint"),
                            tasks.overdueUrgent,
                            {},
                          ),
                      },
                      {
                        label: t("dashboard:risk.dueSoon", {
                          days: tasks?.dueSoon.withinDays ?? 3,
                        }),
                        value: tasks?.dueSoon.total ?? 0,
                        meta: t("dashboard:risk.urgentShare", {
                          count: tasks?.dueSoon.urgent ?? 0,
                        }),
                        onOpen: () =>
                          tasks &&
                          openBucket(
                            t("dashboard:risk.dueSoon", {
                              days: tasks?.dueSoon.withinDays ?? 3,
                            }),
                            t("dashboard:risk.hint"),
                            tasks.dueSoon,
                            {},
                          ),
                      },
                    ]}
                  />
                  <MetricTile
                    className="min-h-40"
                    label={t("dashboard:tiles.unassigned")}
                    value={tasks?.unassigned.total}
                    hint={t("dashboard:risk.hint")}
                    onOpen={() =>
                      tasks &&
                      openBucket(
                        t("dashboard:tiles.unassigned"),
                        t("dashboard:risk.hint"),
                        tasks.unassigned,
                        {},
                      )
                    }
                  />
                </section>

                <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  {charts ? (
                    <>
                      <PriorityDonut
                        series={charts.byPriority}
                        onOpen={(priority) =>
                          openChart(
                            t(`tasks:priority.${priority}`),
                            t("dashboard:charts.byPriorityHint", {
                              count: charts.byPriority.reduce(
                                (sum, row) => sum + row.count,
                                0,
                              ),
                            }),
                            { priority },
                          )
                        }
                      />
                      <DueLoadChart
                        series={charts.dueByDay}
                        onOpen={(day) =>
                          openChart(t("dashboard:charts.dueLoad"), day, { day })
                        }
                      />
                      <ProjectLoadChart
                        series={charts.byProject}
                        onOpen={(projectId) => {
                          const project = charts.byProject.find(
                            (row) => row.projectId === projectId,
                          );
                          openChart(
                            project?.name ?? t("dashboard:charts.byProject"),
                            t("dashboard:charts.byProjectHint"),
                            { projectId },
                          );
                        }}
                      />
                    </>
                  ) : (
                    <WidgetCard
                      title={t("dashboard:charts.byPriority")}
                      className="lg:col-span-3"
                    >
                      <p className="text-muted-foreground text-xs">
                        {t("dashboard:drill.empty")}
                      </p>
                    </WidgetCard>
                  )}
                </section>

                <IntakeQueue workspaceId={workspaceId} />
              </>
            )}
          </div>
        </div>
      </WorkspaceLayout>

      <TaskDrilldown
        drill={drill}
        workspaceId={workspaceId}
        onClose={() => setDrill(null)}
      />
    </>
  );
}
