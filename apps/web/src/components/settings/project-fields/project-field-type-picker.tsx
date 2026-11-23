import { useTranslation } from "react-i18next";
import {
  PROJECT_FIELD_TYPES,
  type ProjectFieldType,
} from "@/components/project-fields/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ProjectFieldTypePicker({
  value,
  onChange,
  disabledTypes = [],
  id,
  "aria-label": ariaLabel,
}: {
  value: ProjectFieldType;
  onChange: (value: ProjectFieldType) => void;
  disabledTypes?: ProjectFieldType[];
  id?: string;
  "aria-label"?: string;
}) {
  const { t } = useTranslation();

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (PROJECT_FIELD_TYPES.includes(next as ProjectFieldType)) {
          onChange(next as ProjectFieldType);
        }
      }}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className="w-full">
        <SelectValue>
          {t(`settings:workspaceProjectFields.types.${value}`)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {PROJECT_FIELD_TYPES.map((type) => (
          <SelectItem
            key={type}
            value={type}
            disabled={disabledTypes.includes(type)}
          >
            {t(`settings:workspaceProjectFields.types.${type}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
