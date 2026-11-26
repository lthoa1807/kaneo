import WidgetCard from "./widget-card";

type RiskBlock = {
  label: string;
  value: number;
  meta?: string;
  onOpen: () => void;
};

export default function DeadlineRisk({
  title,
  hint,
  blocks,
  className,
}: {
  title: string;
  hint: string;
  blocks: [RiskBlock, RiskBlock];
  className?: string;
}) {
  return (
    <WidgetCard title={title} hint={hint} className={className}>
      <div className="grid grid-cols-2 gap-3">
        {blocks.map((block) => (
          <button
            key={block.label}
            type="button"
            onClick={block.onOpen}
            className="flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors hover:border-ring/60 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            <span className="text-muted-foreground text-xs">{block.label}</span>
            <span className="font-semibold text-2xl tabular-nums leading-none">
              {block.value}
            </span>
            {block.meta ? (
              <span className="text-muted-foreground text-xs">
                {block.meta}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </WidgetCard>
  );
}
