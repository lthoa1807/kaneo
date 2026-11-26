import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** The one card shell every widget uses: smoked glass, one heading, one hint. */
export default function WidgetCard({
  title,
  hint,
  children,
  footer,
  className,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "@container overview-card flex flex-col gap-4 rounded-xl border p-4",
        className,
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-medium text-sm">{title}</h2>
        {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      </header>
      {children}
      {footer}
    </section>
  );
}
