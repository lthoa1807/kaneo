import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { PROJECT_TABLE_PAGE_SIZE } from "./project-table-search";

export function ProjectTablePagination({
  page,
  total,
  onPageChange,
}: {
  page: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  const lastPage = Math.max(0, Math.ceil(total / PROJECT_TABLE_PAGE_SIZE) - 1);

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <p className="text-muted-foreground text-sm">
        {total === 0
          ? t("workspace:projects.table.noResults")
          : t("workspace:projects.table.pageSummary", {
              from: page * PROJECT_TABLE_PAGE_SIZE + 1,
              to: Math.min(total, (page + 1) * PROJECT_TABLE_PAGE_SIZE),
              total,
            })}
      </p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={t("workspace:projects.table.previousPage")}
          disabled={page <= 0}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={t("workspace:projects.table.nextPage")}
          disabled={page >= lastPage}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
