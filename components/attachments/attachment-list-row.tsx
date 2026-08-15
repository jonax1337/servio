"use client";

// Client wrapper for a single attachment row's clickable filename. Lets the
// (Server Component) AttachmentList open the shared file-preview lightbox on
// click for previewable files, while non-previewable files keep the plain
// download link. The explicit download icon in the row is preserved separately.
import { FilePreview, useFilePreview, canPreview, type PreviewFile } from "@/components/file-preview";
import type { AttachmentRow } from "@/lib/attachments-ui";

function toPreviewFile(a: AttachmentRow): PreviewFile {
  return { id: a.id, name: a.filename, mime: a.mime, size: a.size };
}

export function AttachmentFilenameLink({
  attachment,
  siblings,
}: {
  attachment: AttachmentRow;
  /** Whole list, so prev/next navigation works inside the lightbox. */
  siblings: AttachmentRow[];
}) {
  const preview = useFilePreview();
  const file = toPreviewFile(attachment);
  const className = "block truncate text-left text-sm font-medium hover:text-primary hover:underline";

  if (!canPreview(file)) {
    return (
      <a href={`/api/files/${attachment.id}`} download className={className}>
        {attachment.filename}
      </a>
    );
  }

  const previewable = siblings.filter((s) => canPreview(toPreviewFile(s))).map(toPreviewFile);

  return (
    <>
      <button type="button" onClick={() => preview.openFile(file, previewable)} className={className}>
        {attachment.filename}
      </button>
      <FilePreview {...preview.props} />
    </>
  );
}
