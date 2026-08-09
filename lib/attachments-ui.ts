// Client-safe attachment helpers — NO Node imports (usable in client components).
import {
  File as FileIcon, FileText, FileImage, FileSpreadsheet, FileType,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Keep in sync with MAX_UPLOAD_MB / lib/files.ts MAX_UPLOAD_BYTES (server is authoritative).
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export type AttachmentTarget =
  | { ticketId: number }
  | { commentId: string }
  | { articleId: string };

export type AttachmentRow = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  createdAt: Date;
  uploadedById: string | null;
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function iconForMime(mime: string): LucideIcon {
  if (mime.startsWith("image/")) return FileImage;
  if (mime === "application/pdf") return FileType;
  if (mime.includes("spreadsheet") || mime === "text/csv") return FileSpreadsheet;
  if (mime.startsWith("text/") || mime.includes("word") || mime.includes("presentation")) return FileText;
  return FileIcon;
}
