import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";

type IntakeProgressProps = {
  taskCount: number;
  completedTaskCount: number;
};

export function IntakeProgress({
  taskCount,
  completedTaskCount,
}: IntakeProgressProps) {
  const { t } = useTranslation();
  const label = t("intake:detail.tasksProgress", {
    done: completedTaskCount,
    total: taskCount,
  });
  const percent = taskCount === 0 ? 0 : (completedTaskCount / taskCount) * 100;

  return (
    <div className="flex items-center gap-2">
      <Progress value={percent} aria-label={label} className="w-20" />
      <span className="text-muted-foreground text-xs tabular-nums">
        {label}
      </span>
    </div>
  );
}
