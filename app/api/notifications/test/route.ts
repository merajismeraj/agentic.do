import { errorResponse, HttpError, newId, requireUser } from "@/lib/server/auth";
import { emailConfigured } from "@/lib/server/mailer";
import { enqueueNotification, flushNotifications } from "@/lib/server/notify";
import { clientIp, limited } from "@/lib/server/ratelimit";
import { requireWorkspace } from "@/lib/server/workspace";

export const runtime = "nodejs";

/** Sends a test alert to the signed-in user's email. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const ws = await requireWorkspace(user.id);
    if (!emailConfigured()) throw new HttpError(503, "Email isn't configured on this server yet");
    if (!user.emailVerified) throw new HttpError(403, "Confirm your email first — alerts only go to verified addresses");
    if (limited(`test-email:${user.id}:${clientIp(req)}`, 3, 10 * 60_000)) throw new HttpError(429, "Test email already sent — check your inbox (and spam)");
    await enqueueNotification({ userId: user.id, workspaceId: ws.id, kind: "test", dedupeKey: `test:${newId()}`, payload: {} });
    const r = await flushNotifications({ userId: user.id });
    if (!r.sent) throw new HttpError(502, "Couldn't send the test email — check the email settings on the server");
    return Response.json({ ok: true, to: user.email });
  } catch (e) {
    return errorResponse(e);
  }
}
