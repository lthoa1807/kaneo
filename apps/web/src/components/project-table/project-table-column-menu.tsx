import { Columns3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProjectFieldDefinition } from "@/components/project-fields/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function ProjectTableColumnMenu({
  definitions,
  hidden,
  onToggle,
}: {
  definitions: ProjectFieldDefinition[];
  hidden: string[];
  onToggle: (fieldId: string, hidden: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <Columns3 aria-hidden="true" />
            {t("workspace:projects.columns")}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-56 p-1">
        <div className="max-h-72 overflow-y-auto">
          {definitions.map((field) => (
            <label
              key={field.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox
                checked={!hidden.includes(field.id)}
                onCheckedChange={(checked) =>
                  onToggle(field.id, checked !== true)
                }
              />
              <span className="truncate">{field.name}</span>
            </label>
          ))}
          {definitions.length === 0 ? (
            <p className="px-2 py-1.5 text-muted-foreground text-sm">
              {t("workspace:projects.table.noDefinitions")}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
