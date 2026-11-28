import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { IntakeRequest } from "@/types/intake";
import useGetIntakeActivity from "@/hooks/queries/intake/use-get-intake-activity";
import { authClient } from "@/lib/auth-client";
import { IntakeActivityList } from "./intake-activity-list";
import { IntakeProgress } from "./intake-progress";
import { IntakeStatusBadge } from "./intake-status-badge";
import { IntakeStepper } from "./intake-stepper";

type IntakeRequestDetailProps = {
  request: IntakeRequest;
  /** Status buttons for whoever is looking at the request. */
  actions?: ReactNode;
  /** Guests get the lifecycle stepper; staff work from the badge instead. */
  showStepper?: boolean;
};

export function IntakeRequestDetail({
  request,
  actions,
  showStepper,
}: IntakeRequestDetailProps) {
  const { t } = useTranslation();
  const activity = useGetIntakeActivity(request.id);
  const { data: session } = authClient.useSession();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-muted-foreground text-xs">
            {request.displayId}
          </span>
          <IntakeStatusBadge status={request.status} />
          {request.taskCount > 0 ? (
            <IntakeProgress
              taskCount={request.taskCount}
              completedTaskCount={request.completedTaskCount}
            />
          ) : null}
        </div>
        <h1 className="font-semibold text-xl leading-tight">{request.title}</h1>
        <p className="text-muted-foreground text-sm">{request.projectName}</p>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </header>

      {showStepper ? <IntakeStepper status={request.status} /> : null}

      <section className="space-y-2">
        <p className="whitespace-pre-wrap text-sm">
          {request.description || t("intake:detail.descriptionEmpty")}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium text-sm">{t("intake:detail.activity")}</h2>
        {activity.data ? (
          <IntakeActivityList
            items={activity.data.items}
            currentUserId={session?.user.id}
          />
        ) : null}
      </section>
    </div>
  );
}
