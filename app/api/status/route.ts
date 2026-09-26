import { providerStatus } from "@/lib/server/providers";
import { toolStatus } from "@/lib/server/tools";
import type { LiveStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which AI providers and integrations can run for real (credentials present). */
export function GET() {
  const body: LiveStatus = { providers: providerStatus(), tools: toolStatus() };
  return Response.json(body);
}
