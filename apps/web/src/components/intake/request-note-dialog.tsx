import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type RequestNoteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  required: boolean;
  pending: boolean;
  onConfirm: (note: string) => void;
};

export function RequestNoteDialog({
  open,
  onOpenChange,
  title,
  description,
  required,
  pending,
  onConfirm,
}: RequestNoteDialogProps) {
  const { t } = useTranslation();
  const noteId = useId();
  const [note, setNote] = useState("");
  const trimmed = note.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setNote("");
        onOpenChange(next);
      }}
    >
      <DialogPopup className="sm:max-w-md">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <DialogPanel className="space-y-2">
          <Label htmlFor={noteId}>{t("intake:note.placeholder")}</Label>
          <Textarea
            id={noteId}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            required={required}
          />
        </DialogPanel>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("common:actions.cancel")}
          </Button>
          <Button
            type="button"
            disabled={pending || (required && trimmed === "")}
            onClick={() => {
              onConfirm(trimmed);
              setNote("");
            }}
          >
            {t("intake:note.confirm")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
