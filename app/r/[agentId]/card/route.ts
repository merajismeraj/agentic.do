import { agentCard, getAgent } from "@/lib/server/aa/registry";
import { registryOrigin } from "@/lib/server/aa/util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public Signature Agent Card: who operates the agent, why it acts, how fast, and its keys. */
export async function GET(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const agent = await getAgent((await params).agentId);
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });
  return Response.json(agentCard(agent, registryOrigin(req)), {
    headers: { "cache-control": "public, max-age=60", "access-control-allow-origin": "*" },
  });
}
