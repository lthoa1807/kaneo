import { cn } from "@/lib/cn";

/**
 * A count. Clickable when there is a list behind it; the label and the value
 * are both inside the button so its accessible name states them.
 */
export default function MetricTile({
  label,
  value,
  hint,
  onOpen,
  className,
}: {
  label: string;
  value: number | undefined;
  hint?: string;
  onOpen?: () => void;
  className?: string;
}) {
  const content = (
    <>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-semibold text-3xl tabular-nums leading-none">
        {value ?? "—"}
      </span>
      {hint ? (
        <span className="text-muted-foreground text-xs">{hint}</span>
      ) : null}
    </>
  );

  const shell = cn(
    "overview-card flex min-h-24 flex-col justify-between gap-2 rounded-xl border p-4 text-left",
    className,
  );

  if (!onOpen) {
    return <div className={shell}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        shell,
        "transition-colors hover:border-ring/60 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
      )}
    >
      {content}
    </button>
  );
}
