import { useTranslation } from "react-i18next";
import type {
  ProjectFieldDefinition,
  ProjectFieldFormula,
} from "@/components/project-fields/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ProjectFieldFormulaEditorProps = {
  fields: ProjectFieldDefinition[];
  value: ProjectFieldFormula | null;
  onChange: (value: ProjectFieldFormula | null) => void;
};

function optionsOf(fields: ProjectFieldDefinition[], type: "date" | "number") {
  return fields.filter(
    (field) => field.type === type && field.formula === null,
  );
}

export function defaultFormula(fields: ProjectFieldDefinition[]) {
  const dates = optionsOf(fields, "date");
  const numbers = optionsOf(fields, "number");
  if (dates.length >= 2) {
    return {
      kind: "date_diff",
      fromFieldId: dates[0].id,
      toFieldId: dates[1].id,
      unit: "day",
    } satisfies ProjectFieldFormula;
  }
  if (numbers.length >= 2) {
    return {
      kind: "number",
      op: "add",
      leftFieldId: numbers[0].id,
      rightFieldId: numbers[1].id,
    } satisfies ProjectFieldFormula;
  }
  return null;
}

export function ProjectFieldFormulaEditor({
  fields,
  value,
  onChange,
}: ProjectFieldFormulaEditorProps) {
  const { t } = useTranslation();
  const dateFields = optionsOf(fields, "date");
  const numberFields = optionsOf(fields, "number");
  const kind = value?.kind ?? "date_diff";

  const selectField = (
    label: string,
    selected: string,
    candidates: ProjectFieldDefinition[],
    onSelect: (id: string) => void,
  ) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={selected}
        onValueChange={(next) => {
          if (typeof next === "string" && next) onSelect(next);
        }}
      >
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue placeholder={label}>
            {candidates.find((field) => field.id === selected)?.name}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {candidates.map((field) => (
            <SelectItem key={field.id} value={field.id}>
              {field.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="project-field-formula-kind">
          {t("settings:workspaceProjectFields.formulaLabel")}
        </Label>
        <Select
          value={kind}
          onValueChange={(next) => {
            if (next === "date_diff" && dateFields.length >= 2) {
              onChange({
                kind: "date_diff",
                fromFieldId: dateFields[0].id,
                toFieldId: dateFields[1].id,
                unit: "day",
              });
            } else if (next === "date_add" && dateFields.length >= 1) {
              onChange({
                kind: "date_add",
                fromFieldId: dateFields[0].id,
                amount: 1,
                unit: "day",
              });
            } else if (next === "number" && numberFields.length >= 2) {
              onChange({
                kind: "number",
                op: "add",
                leftFieldId: numberFields[0].id,
                rightFieldId: numberFields[1].id,
              });
            }
          }}
        >
          <SelectTrigger
            id="project-field-formula-kind"
            aria-label={t("settings:workspaceProjectFields.formulaLabel")}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date_diff" disabled={dateFields.length < 2}>
              {t("settings:workspaceProjectFields.operationDateDiff")}
            </SelectItem>
            <SelectItem value="date_add" disabled={dateFields.length < 1}>
              {t("settings:workspaceProjectFields.operationDateAdd")}
            </SelectItem>
            <SelectItem value="number" disabled={numberFields.length < 2}>
              {t("settings:workspaceProjectFields.operationNumber")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {value?.kind === "date_diff" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {selectField(
            t("settings:workspaceProjectFields.formulaSource"),
            value.fromFieldId,
            dateFields,
            (id) => onChange({ ...value, fromFieldId: id }),
          )}
          {selectField(
            t("settings:workspaceProjectFields.formulaTarget"),
            value.toFieldId,
            dateFields,
            (id) => onChange({ ...value, toFieldId: id }),
          )}
        </div>
      ) : null}

      {value?.kind === "date_add" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {selectField(
            t("settings:workspaceProjectFields.formulaSource"),
            value.fromFieldId,
            dateFields,
            (id) => onChange({ ...value, fromFieldId: id }),
          )}
          <div className="space-y-1.5">
            <Label htmlFor="project-field-formula-amount">
              {t("settings:workspaceProjectFields.formulaAmount")}
            </Label>
            <Input
              id="project-field-formula-amount"
              type="number"
              step="1"
              value={value.amount}
              onChange={(event) =>
                onChange({
                  ...value,
                  amount: Number.parseInt(event.target.value, 10) || 0,
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("settings:workspaceProjectFields.formulaUnit")}</Label>
            <Select
              value={value.unit}
              onValueChange={(unit) => {
                if (unit === "day" || unit === "month") {
                  onChange({ ...value, unit });
                }
              }}
            >
              <SelectTrigger
                aria-label={t("settings:workspaceProjectFields.formulaUnit")}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">
                  {t("settings:workspaceProjectFields.unitDay")}
                </SelectItem>
                <SelectItem value="month">
                  {t("settings:workspaceProjectFields.unitMonth")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      {value?.kind === "number" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {selectField(
            t("settings:workspaceProjectFields.formulaLeft"),
            value.leftFieldId,
            numberFields,
            (id) => onChange({ ...value, leftFieldId: id }),
          )}
          <div className="space-y-1.5">
            <Label>
              {t("settings:workspaceProjectFields.formulaOperation")}
            </Label>
            <Select
              value={value.op}
              onValueChange={(op) => {
                if (
                  op === "add" ||
                  op === "subtract" ||
                  op === "multiply" ||
                  op === "divide"
                ) {
                  onChange({ ...value, op });
                }
              }}
            >
              <SelectTrigger
                aria-label={t(
                  "settings:workspaceProjectFields.formulaOperation",
                )}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="add">
                  {t("settings:workspaceProjectFields.operatorAdd")}
                </SelectItem>
                <SelectItem value="subtract">
                  {t("settings:workspaceProjectFields.operatorSubtract")}
                </SelectItem>
                <SelectItem value="multiply">
                  {t("settings:workspaceProjectFields.operatorMultiply")}
                </SelectItem>
                <SelectItem value="divide">
                  {t("settings:workspaceProjectFields.operatorDivide")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {selectField(
            t("settings:workspaceProjectFields.formulaRight"),
            value.rightFieldId,
            numberFields,
            (id) => onChange({ ...value, rightFieldId: id }),
          )}
        </div>
      ) : null}
    </div>
  );
}
