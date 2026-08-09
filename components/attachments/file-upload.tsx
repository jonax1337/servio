"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_UPLOAD_BYTES, formatBytes, type AttachmentTarget } from "@/lib/attachments-ui";

function targetField(target: AttachmentTarget): [string, string] {
  if ("ticketId" in target) return ["ticketId", String(target.ticketId)];
  if ("commentId" in target) return ["commentId", target.commentId];
  return ["articleId", target.articleId];
}

export function FileUpload({
  target, disabled, accept, label = "Attach file",
}: {
  target: AttachmentTarget;
  disabled?: boolean;
  accept?: string;
  label?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const uploadOne = (file: File) =>
    new Promise<void>((resolve) => {
      const [field, value] = targetField(target);
      const fd = new FormData();
      fd.set("file", file);
      fd.set(field, value);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/files/upload");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          try {
            setError(JSON.parse(xhr.responseText)?.error ?? "Upload failed.");
          } catch {
            setError("Upload failed.");
          }
          resolve();
        }
      };
      xhr.onerror = () => { setError("Network error during upload."); resolve(); };
      xhr.send(fd);
    });

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    for (const file of Array.from(files)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        setError(`${file.name} is larger than ${formatBytes(MAX_UPLOAD_BYTES)}.`);
        continue;
      }
      setProgress(0);
      await uploadOne(file);
    }
    setBusy(false);
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  };

  return (
    <div className="grid gap-1.5">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
        {busy ? `Uploading… ${progress}%` : label}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
