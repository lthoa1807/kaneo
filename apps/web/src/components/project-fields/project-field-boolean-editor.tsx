import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type ProjectFieldBooleanEditorProps = {
  name: string;
  value: string | null;
  required: boolean;
  disabled?: boolean;
  onChange: (value: string | null) => void;
};

export function ProjectFieldBooleanEditor({
  name,
  value,
  required,
  disabled = false,
  onChange,
}: ProjectFieldBooleanEditorProps) {
  const { t } = useTranslation();
  const options = [
    ...(required
      ? []
      : [
          {
            key: "unset",
            label: t("settings:projectGeneral.projectFields.unset"),
            next: null,
          },
        ]),
    {
      key: "true",
      label: t("settings:projectGeneral.projectFields.yes"),
      next: "true",
    },
    {
      key: "false",
      label: t("settings:projectGeneral.projectFields.no"),
      next: "false",
    },
  ] as const;

  return (
    <div role="group" aria-label={name} className="flex items-center gap-1">
      {options.map((option) => {
        const selected =
          option.next === null ? value === null : value === option.next;
        return (
          <Button
            key={option.key}
            type="button"
            size="xs"
            variant={selected ? "secondary" : "ghost"}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => {
              if (selected) return;
              onChange(option.next);
            }}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
