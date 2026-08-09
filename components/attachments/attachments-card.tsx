import { Paperclip } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AttachmentList } from "@/components/attachments/attachment-list";
import { FileUpload } from "@/components/attachments/file-upload";
import type { AttachmentRow, AttachmentTarget } from "@/lib/attachments-ui";
import { cn } from "@/lib/utils";

export function AttachmentsCard({
  attachments, target, canUpload, canDeleteAll = false, currentUserId, className,
}: {
  attachments: AttachmentRow[];
  target: AttachmentTarget;
  canUpload: boolean;
  /** Agents may delete any file; otherwise only own uploads (via currentUserId). */
  canDeleteAll?: boolean;
  currentUserId?: string;
  className?: string;
}) {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Paperclip className="size-4 text-muted-foreground" />
          Attachments
          {attachments.length > 0 ? (
            <span className="rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">{attachments.length}</span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <AttachmentList attachments={attachments} canDeleteAll={canDeleteAll} currentUserId={currentUserId} />
        {canUpload ? <FileUpload target={target} /> : null}
      </CardContent>
    </Card>
  );
}
