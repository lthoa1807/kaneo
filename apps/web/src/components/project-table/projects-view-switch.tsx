import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

export function ProjectsViewSwitch({
  view,
  fieldCount = 0,
  onChange,
}: {
  view: "overview" | "fields";
  fieldCount?: number;
  onChange: (view: "overview" | "fields") => void;
}) {
  const { t } = useTranslation();
  const fieldsLabel = t("workspace:projects.views.fields");
  const hasFields = fieldCount > 0;
  const options = [
    { id: "overview", label: t("workspace:projects.views.overview") },
    {
      id: "fields",
      // The count is the only visible hint that this view has field columns.
      label: hasFields ? `${fieldsLabel} (${fieldCount})` : fieldsLabel,
    },
  ] as const;

  return (
    <div
      role="group"
      aria-label={t("workspace:projects.views.label")}
      className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={view === option.id}
          title={
            option.id === "fields"
              ? t("workspace:projects.views.fieldsHint")
              : undefined
          }
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            view === option.id
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
            // Accent, so people notice the field view exists at all.
            hasFields &&
              option.id === "fields" &&
              (view === option.id ? "text-primary" : "text-primary/80"),
          )}
          onClick={() => onChange(option.id)}
        >
          {hasFields && option.id === "fields" ? (
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-primary transition-colors"
            />
          ) : null}
          {option.label}
        </button>
      ))}
    </div>
  );
}
