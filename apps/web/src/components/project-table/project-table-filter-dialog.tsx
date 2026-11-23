import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ProjectFieldDefinition,
  ProjectFieldFilter,
  ProjectFieldFilterOperator,
} from "@/components/project-fields/types";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { filterOperatorsFor, operatorNeedsValue } from "./project-table-search";

const OPERATOR_KEYS: Record<ProjectFieldFilterOperator, string> = {
  eq: "equals",
  neq: "notEquals",
  contains: "contains",
  notContains: "notContains",
  startsWith: "startsWith",
  gt: "greaterThan",
  gte: "greaterOrEqual",
  lt: "lessThan",
  lte: "lessOrEqual",
  before: "before",
  after: "after",
  onOrBefore: "onOrBefore",
  onOrAfter: "onOrAfter",
  empty: "isEmpty",
  notEmpty: "isNotEmpty",
  in: "isAnyOf",
  isTrue: "isYes",
  isFalse: "isNo",
};

export function ProjectTableFilterDialog({
  open,
  onClose,
  definitions,
  filter,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  definitions: ProjectFieldDefinition[];
  filter: ProjectFieldFilter | null;
  onSave: (filter: ProjectFieldFilter) => void;
}) {
  const { t } = useTranslation();
  const filterable = definitions.filter((field) => field.type !== "formula");
  const [fieldId, setFieldId] = useState(
    filter?.fieldId ?? filterable[0]?.id ?? "",
  );
  const [operator, setOperator] = useState<ProjectFieldFilterOperator>(
    filter?.operator ?? "contains",
  );
  const [value, setValue] = useState("");
  const [values, setValues] = useState<string[]>([]);

  const field = filterable.find((item) => item.id === fieldId) ?? filterable[0];

  useEffect(() => {
    if (!open || !field) return;
    setOperator(
      filter?.operator && filterOperatorsFor(field).includes(filter.operator)
        ? filter.operator
        : filterOperatorsFor(field)[0],
    );
    setValue(typeof filter?.value === "string" ? filter.value : "");
    setValues(Array.isArray(filter?.value) ? filter.value : []);
  }, [open, field, filter]);

  if (!field) return null;

  const operators = filterOperatorsFor(field);
  const choices = field.options ?? [];
  const needsValue = operatorNeedsValue(operator);
  const usesList =
    operator === "in" || (field.type === "multiselect" && needsValue);

  const valueControl = !needsValue ? null : field.type === "boolean" ? (
    <Select
      value={value || "true"}
      onValueChange={(next) => setValue(next ?? "true")}
    >
      <SelectTrigger aria-label={field.name} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="true">
          {t("settings:projectGeneral.projectFields.yes")}
        </SelectItem>
        <SelectItem value="false">
          {t("settings:projectGeneral.projectFields.no")}
        </SelectItem>
      </SelectContent>
    </Select>
  ) : usesList ? (
    <div className="flex flex-wrap gap-2">
      {choices.map((choice) => {
        const selected = values.includes(choice);
        return (
          <Button
            key={choice}
            type="button"
            size="xs"
            variant={selected ? "secondary" : "outline"}
            aria-pressed={selected}
            onClick={() =>
              setValues((current) =>
                selected
                  ? current.filter((item) => item !== choice)
                  : [...current, choice],
              )
            }
          >
            {choice}
          </Button>
        );
      })}
    </div>
  ) : field.type === "dropdown" ? (
    <Select value={value} onValueChange={(next) => setValue(next ?? "")}>
      <SelectTrigger aria-label={field.name} className="w-full">
        <SelectValue placeholder={field.name} />
      </SelectTrigger>
      <SelectContent>
        {choices.map((choice) => (
          <SelectItem key={choice} value={choice}>
            {choice}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : (
    <Input
      type={
        field.type === "number"
          ? "number"
          : field.type === "date"
            ? "date"
            : "text"
      }
      aria-label={field.name}
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );

  const canSave = needsValue
    ? usesList
      ? values.length > 0
      : value.trim().length > 0
    : true;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPopup className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("workspace:projects.table.addFilter")}</DialogTitle>
          <DialogDescription>
            {t("workspace:projects.table.filterDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("workspace:projects.table.field")}</Label>
            <Select
              value={fieldId}
              onValueChange={(next) => {
                if (typeof next === "string" && next) {
                  setFieldId(next);
                  setValue("");
                  setValues([]);
                }
              }}
            >
              <SelectTrigger
                aria-label={t("workspace:projects.table.field")}
                className="w-full"
              >
                <SelectValue>{field.name}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {filterable.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("workspace:projects.table.condition")}</Label>
            <Select
              value={operator}
              onValueChange={(next) =>
                setOperator(next as ProjectFieldFilterOperator)
              }
            >
              <SelectTrigger
                aria-label={t("workspace:projects.table.condition")}
                className="w-full"
              >
                <SelectValue>
                  {t(
                    `workspace:projects.table.operators.${OPERATOR_KEYS[operator]}`,
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {operators.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(
                      `workspace:projects.table.operators.${OPERATOR_KEYS[option]}`,
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {valueControl ? (
            <div className="space-y-1.5">
              <Label>{t("workspace:projects.table.value")}</Label>
              {valueControl}
            </div>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!canSave}
            onClick={() =>
              onSave({
                fieldId: field.id,
                operator,
                ...(needsValue
                  ? { value: usesList ? values : value.trim() }
                  : {}),
              })
            }
          >
            {t("workspace:projects.table.applyFilter")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
