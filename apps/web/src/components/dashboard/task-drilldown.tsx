import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import useGetDashboardDrilldown from "@/hooks/queries/dashboard/use-get-dashboard-drilldown";
import { formatRelativeDueDate } from "@/components/task-chips/format-relative-due-date";
import { getRelativeDueDate } from "@/lib/relative-due-date";
import type { DashboardTaskRow, Drill } from "./types";

/**
 * Native <dialog> opened with showModal(): the browser supplies the focus trap,
 * Esc, backdrop and focus return, so no ARIA roles or manual trap are added.
 */
export default function TaskDrilldown({
  drill,
  workspaceId,
  onClose,
}: {
  drill: Drill | null;
  workspaceId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  // The payload carries rows only for the four count buckets; a chart segment
  // asks for its own bucket when it is opened.
  const fetched = useGetDashboardDrilldown(
    workspaceId,
    drill?.filters ?? {},
    Boolean(drill) && !drill?.bucket,
  );
  const bucket = drill?.bucket ?? (drill ? fetched.data : undefined);

  useEffect(() => {
    if (!drill) return;
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, [drill]);

  const close = () => {
    dialog.current?.close();
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="drill-title"
      onClose={onClose}
      className="m-auto w-[min(44rem,calc(100vw-2rem))] rounded-xl border bg-background p-0 text-foreground backdrop:bg-black/50 open:flex open:flex-col"
    >
      {drill ? (
        <>
          <header className="flex items-start justify-between gap-3 border-b p-4">
            <div className="flex flex-col gap-0.5">
              <h2 id="drill-title" className="font-semibold text-sm">
                {drill.title}
              </h2>
              <p className="text-muted-foreground text-xs">{drill.hint}</p>
            </div>
            <button
              type="button"
              onClick={close}
              className="rounded border px-2 py-1 text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            >
              {t("dashboard:drill.close")}
            </button>
          </header>

          <div className="max-h-[60vh] overflow-y-auto overscroll-contain p-2">
            {!bucket ? (
              <p className="p-4 text-muted-foreground text-xs">
                {t("dashboard:drill.loading")}
              </p>
            ) : bucket.items.length === 0 ? (
              <p className="p-4 text-muted-foreground text-xs">
                {t("dashboard:drill.empty")}
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="p-2 font-normal">
                      {t("tasks:entity.task")}
                    </th>
                    <th className="p-2 font-normal">
                      {t("tasks:properties.project")}
                    </th>
                    <th className="p-2 font-normal">
                      {t("tasks:assignee.label")}
                    </th>
                    <th className="p-2 font-normal">
                      {t("tasks:priority.label")}
                    </th>
                    <th className="p-2 font-normal">
                      {t("tasks:dueDate.label")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bucket.items.map((task: DashboardTaskRow) => (
                    <tr key={task.id} className="border-t">
                      <td className="p-2">
                        <span className="block truncate">{task.title}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {task.ticket}
                        </span>
                      </td>
                      <td className="p-2">{task.projectName}</td>
                      <td className="p-2">{task.assigneeName ?? "—"}</td>
                      <td className="p-2">
                        {t(`tasks:priority.${task.priority}`)}
                      </td>
                      <td className="p-2 tabular-nums">
                        {task.dueDate
                          ? formatRelativeDueDate(
                              getRelativeDueDate(task.dueDate),
                              task.dueDate,
                              t,
                            )
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {bucket?.truncated ? (
            <footer className="border-t p-4 text-xs text-muted-foreground">
              {t("dashboard:drill.cap", {
                shown: bucket.items.length,
                total: bucket.total,
              })}
            </footer>
          ) : null}
        </>
      ) : null}
    </dialog>
  );
}
