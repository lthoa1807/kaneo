import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { INTAKE_STATUS_TONES, type IntakeStatus } from "./intake-status";

export function IntakeStatusBadge({
  status,
  label,
}: {
  status: IntakeStatus;
  /** Overrides the raw status text, e.g. the guest portal's group wording. */
  label?: string;
}) {
  const { t } = useTranslation();

  return (
    <Badge variant={INTAKE_STATUS_TONES[status]}>
      {label ?? t(`intake:status.${status}`)}
    </Badge>
  );
}
