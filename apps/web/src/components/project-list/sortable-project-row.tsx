import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties, ReactNode } from "react";
import { TableRow } from "@/components/ui/table";
import { EASE_OUT_CSS } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function SortableProjectRow({
  id,
  canReorder,
  onClick,
  children,
}: {
  id: string;
  canReorder: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const {
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isSorting,
  } = useSortable({
    id,
    disabled: !canReorder,
    animateLayoutChanges: () => false,
    transition: { duration: 200, easing: EASE_OUT_CSS },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isSorting ? transition : undefined,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      data-kaneo-sortable=""
      className={cn(
        "group/row cursor-pointer",
        isDragging && "relative z-10 bg-muted shadow-md",
      )}
      onClick={onClick}
      {...(canReorder ? listeners : {})}
    >
      {children}
    </TableRow>
  );
}
