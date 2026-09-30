import { isSuperAdmin } from "@/lib/server/admin";
import { currentUser, errorResponse } from "@/lib/server/auth";
import { googleConfigured } from "@/lib/server/google";
import { emailConfigured } from "@/lib/server/mailer";
import { ensureWorkspace } from "@/lib/server/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user (and makes sure they have a workspace). */
export async function GET(req: Request) {
  try {
    const server = { google: googleConfigured(), email: emailConfigured() };
    const user = await currentUser(req);
    if (!user) return Response.json({ user: null, server }, { status: 401 });
    await ensureWorkspace(user.id);
    return Response.json({ user: { ...user, superAdmin: isSuperAdmin(user) }, server });
  } catch (e) {
    return errorResponse(e);
  }
}
