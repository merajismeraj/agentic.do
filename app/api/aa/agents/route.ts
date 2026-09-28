import { errorResponse, requireUser } from "@/lib/server/auth";
import { agentCard, createAgent, listAgents } from "@/lib/server/aa/registry";
import { agentOutcomes } from "@/lib/server/aa/stats";
import { isAaAdmin, registryOrigin } from "@/lib/server/aa/util";
import { requireWorkspace } from "@/lib/server/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Agents this workspace operates, with their cross-site outcomes. */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const ws = await requireWorkspace(user.id);
    const origin = registryOrigin(req);
    const agents = await listAgents(ws.id);
    return Response.json({
      origin,
      admin: isAaAdmin(user.email),
      agents: await Promise.all(agents.map(async (a) => ({ ...a, card: agentCard(a, origin), outcomes: await agentOutcomes(a.id) }))),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Register an agent with its first Ed25519 public key. Starts as "pending" (T2) until reviewed. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const ws = await requireWorkspace(user.id);
    const agent = await createAgent(ws.id, await req.json());
    return Response.json({ agent: { ...agent, card: agentCard(agent, registryOrigin(req)) } });
  } catch (e) {
    return errorResponse(e);
  }
}
