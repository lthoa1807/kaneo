import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { INTAKE_STATUS_TONES, type IntakeStatus } from "./intake-status";

export function IntakeStatusBadge({ status }: { status: IntakeStatus }) {
  const { t } = useTranslation();

  return (
    <Badge variant={INTAKE_STATUS_TONES[status]}>
      {t(`intake:status.${status}`)}
    </Badge>
  );
}
