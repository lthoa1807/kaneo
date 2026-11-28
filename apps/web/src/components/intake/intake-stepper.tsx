import { useTranslation } from "react-i18next";
import type { IntakeStatus } from "./intake-status";

const MAIN_STEPS = [
  "submitted",
  "received",
  "inProgress",
  "awaiting",
  "completed",
] as const;

type StepState = "done" | "current" | "upcoming" | "rejected";

type Step = { key: string; state: StepState };

// Step 2 collects the receiving statuses, step 3 collects work in progress,
// including the feedback loop; rejected ends the line after two steps.
const STATUS_STEP: Partial<Record<IntakeStatus, number>> = {
  new: 0,
  triaged: 1,
  approved: 1,
  in_progress: 2,
  needs_revision: 2,
  delivered: 3,
};

function stepsFor(status: IntakeStatus): Step[] {
  if (status === "rejected") {
    return [
      { key: "submitted", state: "done" },
      { key: "received", state: "done" },
      { key: "rejected", state: "rejected" },
    ];
  }
  if (status === "confirmed") {
    return MAIN_STEPS.map((key) => ({ key, state: "done" }));
  }
  const current = STATUS_STEP[status] ?? 0;
  return MAIN_STEPS.map((key, index) => ({
    key,
    state:
      index < current ? "done" : index === current ? "current" : "upcoming",
  }));
}

const STATE_CLASSES: Record<
  StepState,
  { marker: string; label: string; connector: string }
> = {
  done: {
    marker:
      "border-success/50 bg-success/8 text-success-foreground font-semibold dark:bg-success/16",
    label: "text-foreground",
    connector: "after:bg-success/55",
  },
  current: {
    marker:
      "border-primary bg-primary text-primary-foreground font-bold ring-4 ring-primary/16",
    label: "text-foreground font-semibold",
    connector: "after:bg-border",
  },
  upcoming: {
    marker: "border-border bg-muted text-muted-foreground",
    label: "text-muted-foreground",
    connector: "after:bg-border",
  },
  rejected: {
    marker:
      "border-destructive/50 bg-destructive/8 text-destructive-foreground font-semibold dark:bg-destructive/16",
    label: "text-destructive-foreground font-semibold",
    connector: "after:bg-border",
  },
};

const CONNECTOR =
  "after:absolute after:-bottom-3 after:left-[11.5px] after:top-7 after:w-px sm:after:bottom-auto sm:after:left-[calc(50%+12px)] sm:after:right-[calc(-50%+4px)] sm:after:top-[11px] sm:after:h-px sm:after:w-auto";

export function IntakeStepper({ status }: { status: IntakeStatus }) {
  const { t } = useTranslation();
  const steps = stepsFor(status);

  return (
    <section className="space-y-2">
      <h2 className="font-medium text-sm">
        {t("intake:detail.stepper.label")}
      </h2>
      <ol className="flex flex-col gap-3 sm:flex-row sm:gap-2">
        {steps.map((step, index) => {
          const classes = STATE_CLASSES[step.state];
          const last = index === steps.length - 1;
          return (
            <li
              key={step.key}
              data-state={step.state}
              aria-current={step.state === "current" ? "step" : undefined}
              className={`relative flex items-start gap-2.5 sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:text-center ${
                last ? "" : `${CONNECTOR} ${classes.connector}`
              }`}
            >
              <span
                aria-hidden="true"
                className={`relative z-10 grid size-6 shrink-0 place-items-center rounded-full border text-[11px] tabular-nums ${classes.marker}`}
              >
                {index + 1}
              </span>
              <span className={`text-xs ${classes.label}`}>
                {t(`intake:detail.stepper.${step.key}`)}
              </span>
            </li>
          );
        })}
      </ol>
      {status === "needs_revision" ? (
        <p className="text-warning-foreground text-xs">
          {t("intake:detail.stepper.revisionNote")}
        </p>
      ) : null}
      {status === "rejected" ? (
        <p className="text-destructive-foreground text-xs">
          {t("intake:detail.stepper.rejectedNote")}
        </p>
      ) : null}
    </section>
  );
}
