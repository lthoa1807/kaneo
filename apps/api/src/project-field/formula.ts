import type { ProjectFieldFormula } from "./types";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const NUMBER_PATTERN = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i;

type UtcDate = { year: number; month: number; day: number };

export type ProjectFieldValueMap = Map<string, string | null>;

function parseDate(value: string | null | undefined): UtcDate | null {
  if (value == null) return null;
  const match = DATE_PATTERN.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function formatDate(date: Date) {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function utcDayNumber({ year, month, day }: UtcDate) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return Math.round(date.getTime() / 86_400_000);
}

function lastDayOfMonth(year: number, month: number) {
  const date = new Date(0);
  date.setUTCFullYear(year, month, 0);
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCDate();
}

function addDays(date: UtcDate, days: number) {
  const next = new Date(0);
  next.setUTCFullYear(date.year, date.month - 1, date.day + days);
  next.setUTCHours(0, 0, 0, 0);
  return formatDate(next);
}

function addMonths(date: UtcDate, months: number) {
  const targetMonthIndex = date.month - 1 + months;
  const year = date.year + Math.floor(targetMonthIndex / 12);
  const month = ((targetMonthIndex % 12) + 12) % 12;
  const day = Math.min(date.day, lastDayOfMonth(year, month + 1));
  const next = new Date(0);
  next.setUTCFullYear(year, month, day);
  next.setUTCHours(0, 0, 0, 0);
  return formatDate(next);
}

function completeMonthDiff(from: UtcDate, to: UtcDate) {
  let months = (to.year - from.year) * 12 + (to.month - from.month);
  if (months > 0 && to.day < from.day) months -= 1;
  if (months < 0 && to.day > from.day) months += 1;
  return months;
}

function parseNumber(value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!NUMBER_PATTERN.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonicalNumber(value: number) {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export function evaluateProjectFieldFormula(
  formula: ProjectFieldFormula,
  values: ProjectFieldValueMap,
): string | null {
  if (formula.kind === "date_diff") {
    const from = parseDate(values.get(formula.fromFieldId));
    const to = parseDate(values.get(formula.toFieldId));
    if (!from || !to) return null;

    if (formula.unit === "day") {
      return String(utcDayNumber(to) - utcDayNumber(from));
    }
    return String(completeMonthDiff(from, to));
  }

  if (formula.kind === "date_add") {
    const from = parseDate(values.get(formula.fromFieldId));
    if (!from || !Number.isInteger(formula.amount)) return null;
    return formula.unit === "day"
      ? addDays(from, formula.amount)
      : addMonths(from, formula.amount);
  }

  const left = parseNumber(values.get(formula.leftFieldId));
  const right = parseNumber(values.get(formula.rightFieldId));
  if (left === null || right === null) return null;

  switch (formula.op) {
    case "add":
      return canonicalNumber(left + right);
    case "subtract":
      return canonicalNumber(left - right);
    case "multiply":
      return canonicalNumber(left * right);
    case "divide":
      return right === 0 ? null : canonicalNumber(left / right);
  }
}
