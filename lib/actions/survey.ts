"use server";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { SURVEY_RATING_MIN, SURVEY_RATING_MAX } from "@/lib/constants";

/**
 * CSAT (Customer Satisfaction) surveys.
 *
 * A survey is created when a ticket is resolved (see setTicketResolution in
 * lib/actions/tickets.ts). The requester gets a link to a PUBLIC rating page
 * (/survey/<token>) — no login required — carrying an unguessable token. The
 * submit action below is therefore intentionally unauthenticated: the token IS
 * the authorization. It is single-use (respondedAt gates re-submission) and the
 * rating is validated to the 1..5 range from lib/constants.
 */

export type SurveyState = { ok: true } | { error: string } | undefined;

/**
 * Ensure a ticket has a SurveyResponse row and return its token. Idempotent:
 * re-resolving a ticket reuses the existing survey (one per ticket — ticketId is
 * @unique) rather than orphaning the old link. Safe to call from the resolve
 * hook; never throws (returns null on failure so mail still sends).
 */
export async function ensureSurvey(ticketId: number): Promise<string | null> {
  try {
    const existing = await db.surveyResponse.findUnique({
      where: { ticketId },
      select: { token: true },
    });
    if (existing) return existing.token;
    const token = randomUUID().replace(/-/g, "");
    const created = await db.surveyResponse.create({
      data: { ticketId, token },
      select: { token: true },
    });
    return created.token;
  } catch {
    return null;
  }
}

/** Absolute URL to the public rating page for a token (APP_URL or a relative fallback). */
export async function surveyUrl(token: string): Promise<string> {
  const base = (await getSetting("APP_URL")) || "";
  const path = `/survey/${token}`;
  return base ? `${base.replace(/\/$/, "")}${path}` : path;
}

/** Look up a survey by token for the public page. Returns null for unknown tokens. */
export async function getSurveyByToken(token: string) {
  if (!token) return null;
  return db.surveyResponse.findUnique({
    where: { token },
    select: {
      token: true,
      rating: true,
      comment: true,
      respondedAt: true,
      ticket: { select: { id: true, prefix: true, title: true } },
    },
  });
}

/**
 * Public, unauthenticated submit. The token is the credential. One-time: once
 * respondedAt is set the survey is locked. Rating must be within
 * SURVEY_RATING_MIN..SURVEY_RATING_MAX; comment is optional.
 */
export async function submitSurvey(
  _prev: SurveyState,
  formData: FormData,
): Promise<SurveyState> {
  const token = String(formData.get("token") ?? "").trim();
  const rating = Number(formData.get("rating"));
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 2000) || null;

  if (!token) return { error: "Invalid survey link." };
  if (!Number.isInteger(rating) || rating < SURVEY_RATING_MIN || rating > SURVEY_RATING_MAX) {
    return { error: "Please pick a rating." };
  }

  const survey = await db.surveyResponse.findUnique({
    where: { token },
    select: { respondedAt: true },
  });
  if (!survey) return { error: "This survey link is not valid." };
  if (survey.respondedAt) return { error: "already-submitted" };

  await db.surveyResponse.update({
    where: { token },
    data: { rating, comment, respondedAt: new Date() },
  });
  return { ok: true };
}
