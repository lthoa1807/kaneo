import type getDashboardSummary from "@/fetchers/dashboard/get-dashboard-summary";
import type getDashboardTaskDrilldown from "@/fetchers/dashboard/get-dashboard-task-drilldown";

export type DashboardSummary = Awaited<ReturnType<typeof getDashboardSummary>>;
export type DashboardBucket = Awaited<
  ReturnType<typeof getDashboardTaskDrilldown>
>;
export type DashboardTaskRow = DashboardBucket["items"][number];

/** Same filters a chart segment uses to ask for its drilldown bucket. */
export type DrillFilters = {
  priority?: DashboardSummary["charts"]["byPriority"][number]["priority"];
  projectId?: string;
  day?: string;
};

export type Drill = {
  title: string;
  hint: string;
  filters: DrillFilters;
  /** Present for the four count buckets, so their rows need no extra request. */
  bucket?: DashboardBucket;
};
