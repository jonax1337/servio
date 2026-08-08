"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function markAllRead() {
  const me = await getSessionUser();
  if (!me) return;

  await db.notification.updateMany({
    where: { userId: me.id, read: false },
    data: { read: true },
  });

  revalidatePath("/notifications");
}

export async function markRead(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await db.notification.updateMany({
    where: { id, userId: me.id },
    data: { read: true },
  });

  revalidatePath("/notifications");
}
