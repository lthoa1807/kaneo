import { useTranslation } from "react-i18next";
import type { IntakeActivity } from "@/types/intake";
import { formatRelativeTime } from "@/lib/format";
import { isIntakeStatus } from "./intake-status";

function statusName(value: unknown) {
  return typeof value === "string" && isIntakeStatus(value) ? value : null;
}

type Line = { key: string; params: Record<string, string> } | { text: string };

// Guest-facing wording: the sentence says what happened, not which status
// value was written. Notes stay plain text and keep their line breaks.
function lineFor(
  item: IntakeActivity,
  actor: string,
  deliveryOrdinal: number,
  hasConfirmedEntry: boolean,
): Line | null {
  if (item.type === "created") {
    return { key: "intake:activity.created", params: { actor } };
  }

  if (item.type === "confirmed") {
    return { key: "intake:activity.confirmed", params: { actor } };
  }

  if (item.type === "status_changed") {
    const note = item.content ?? "";
    switch (statusName(item.eventData?.to)) {
      case "triaged":
      case "approved":
        return { key: "intake:activity.received", params: { actor } };
      case "in_progress":
        return { key: "intake:activity.started", params: { actor } };
      case "delivered": {
        // A repeat delivery may carry a reply, and either delivery can be
        // sent without one, so pick the copy that matches the note.
        const repeated = deliveryOrdinal > 1;
        if (!note) {
          return {
            key: repeated
              ? "intake:activity.deliveredAgainNoNote"
              : "intake:activity.delivered",
            params: { actor },
          };
        }
        return {
          key: repeated
            ? "intake:activity.deliveredAgain"
            : "intake:activity.deliveredWithNote",
          params: { actor, note },
        };
      }
      case "needs_revision":
        return { key: "intake:activity.feedback", params: { actor, note } };
      case "rejected":
        return { key: "intake:activity.rejected", params: { actor, note } };
      case "confirmed":
        // A confirm writes both a status_changed and a confirmed row.
        return hasConfirmedEntry
          ? null
          : { key: "intake:activity.confirmed", params: { actor } };
      default:
        return item.content
          ? { text: item.content }
          : { key: "intake:detail.status_changed", params: {} };
    }
  }

  return item.content
    ? { text: item.content }
    : { key: `intake:detail.${item.type}`, params: {} };
}

export function IntakeActivityList({
  items,
  currentUserId,
}: {
  items: IntakeActivity[];
  currentUserId?: string | null;
}) {
  const { t } = useTranslation();
  // task_linked is staff-internal; the API already filters it for guests.
  const visible = items.filter((item) => item.type !== "task_linked");

  if (visible.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("intake:detail.activityEmpty")}
      </p>
    );
  }

  const hasConfirmedEntry = visible.some((item) => item.type === "confirmed");
  const deliveryItems = visible.filter(
    (item) =>
      item.type === "status_changed" &&
      statusName(item.eventData?.to) === "delivered",
  );
  // Items are newest first, so the last delivery in the list is the first one.
  const deliveryOrdinals = new Map<string, number>();
  for (let index = 0; index < deliveryItems.length; index += 1) {
    deliveryOrdinals.set(deliveryItems[index].id, deliveryItems.length - index);
  }

  return (
    <ul className="space-y-3">
      {visible.map((item) => {
        const actor =
          item.userId && item.userId === currentUserId
            ? t("intake:activity.you")
            : t("intake:activity.team");
        const line = lineFor(
          item,
          actor,
          deliveryOrdinals.get(item.id) ?? 0,
          hasConfirmedEntry,
        );
        if (!line) return null;
        return (
          <li key={item.id} className="flex flex-col gap-0.5 text-sm">
            <span className="whitespace-pre-wrap">
              {"text" in line ? line.text : t(line.key, line.params)}
            </span>
            <span className="text-muted-foreground text-xs">
              {formatRelativeTime(item.createdAt)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
