"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { decideEntityApproval } from "@/lib/actions/approvals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Compact approve/reject control for a generic ad-hoc approval (used in the hub). */
export function EntityApprovalDecision({ approvalId }: { approvalId: string }) {
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();

  function decide(decision: "APPROVED" | "REJECTED") {
    const fd = new FormData();
    fd.set("approvalId", approvalId);
    fd.set("decision", decision);
    if (comment.trim()) fd.set("comment", comment.trim());
    start(async () => {
      await decideEntityApproval(fd);
      setComment("");
      toast.success(decision === "APPROVED" ? "Approval recorded" : "Rejection recorded");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment (optional)"
        className="h-7 min-w-40 flex-1 text-xs"
      />
      <Button size="sm" variant="outline" disabled={pending} onClick={() => decide("APPROVED")}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        Approve
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => decide("REJECTED")}>
        <X className="size-3.5" /> Reject
      </Button>
    </div>
  );
}
