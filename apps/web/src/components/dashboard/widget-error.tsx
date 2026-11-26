import { useTranslation } from "react-i18next";

/** One widget failing never blanks the page; it shows this inside its card. */
export default function WidgetError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border p-4">
      <p className="text-muted-foreground text-xs">
        {t("dashboard:error.title")}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded border px-2 py-1 text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      >
        {t("dashboard:error.retry")}
      </button>
    </div>
  );
}
