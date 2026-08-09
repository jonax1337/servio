"use client";

import { Send } from "lucide-react";
import { submitChangeForApproval } from "@/lib/actions/changes";
import { ConfirmButton } from "@/components/confirm-dialog";

export function SubmitForApproval({
  changeId, isStandard, approverCount,
}: {
  changeId: number;
  isStandard: boolean;
  approverCount: number;
}) {
  const description = isStandard
    ? "This is a Standard (pre-authorized) change — submitting moves it straight to Approved."
    : approverCount > 0
      ? "This re-requests a CAB decision. Approvers are selected automatically by change type and risk."
      : "This requests a CAB decision. Approvers are selected automatically by change type and risk.";

  return (
    <ConfirmButton
      action={submitChangeForApproval}
      fields={{ id: changeId }}
      title="Submit for approval?"
      description={description}
      confirmLabel="Submit"
      confirmVariant="default"
      triggerVariant="default"
      triggerSize="sm"
      triggerLabel="Submit for approval"
    >
      <Send className="size-3.5" /> Submit for approval
    </ConfirmButton>
  );
}
