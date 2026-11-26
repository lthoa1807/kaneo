import type getDashboardSummary from "@/fetchers/dashboard/get-dashboard-summary";
import type getDashboardTaskDrilldown from "@/fetchers/dashboard/get-dashboard-task-drilldown";

export type DashboardSummary = Awaited<ReturnType<typeof getDashboardSummary>>;
export type DashboardBucket = Awaited<
  ReturnType<typeof getDashboardTaskDrilldown>
>;
export type DashboardTaskRow = DashboardBucket["items"][number];

/** Same filters the footer link carries into the Tasks page. */
export type DrillFilters = {
  priority?: string;
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
