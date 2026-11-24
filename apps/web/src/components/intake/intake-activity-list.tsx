import { useTranslation } from "react-i18next";
import type { IntakeActivity } from "@/types/intake";
import { formatRelativeTime } from "@/lib/format";
import { isIntakeStatus } from "./intake-status";

function statusName(value: unknown) {
  return typeof value === "string" && isIntakeStatus(value) ? value : null;
}

export function IntakeActivityList({ items }: { items: IntakeActivity[] }) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("intake:detail.activityEmpty")}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const from = statusName(item.eventData?.from);
        const to = statusName(item.eventData?.to);
        return (
          <li key={item.id} className="flex flex-col gap-0.5 text-sm">
            <span>
              {item.type === "status_changed" && from && to
                ? `${t(`intake:status.${from}`)} → ${t(`intake:status.${to}`)}`
                : item.content || t(`intake:detail.${item.type}`)}
            </span>
            {item.type === "status_changed" && item.content ? (
              <span>{item.content}</span>
            ) : null}
            <span className="text-muted-foreground text-xs">
              {formatRelativeTime(item.createdAt)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
