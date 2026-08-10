"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { createCatalogRequestFor, linkStagedAttachments } from "@/lib/portal-tickets";

export type CatalogState =
  | { error?: string; fieldErrors?: Record<string, string> }
  | undefined;

export async function createCatalogRequest(
  _prev: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  const me = await getSessionUser();
  if (!me) return { error: "Not authenticated" };

  const itemId = String(formData.get("catalogItemId") ?? "");
  const rawAnswers: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (k.startsWith("f_")) rawAnswers[k.slice(2)] = String(v);

  const result = await createCatalogRequestFor(me, itemId, rawAnswers);
  if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors };

  await linkStagedAttachments(me.id, result.ticket.id, formData.getAll("attachmentIds").map(String));
  redirect(`/portal/tickets/${result.ticket.id}`);
}
