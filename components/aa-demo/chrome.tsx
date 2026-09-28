import type { ReactNode } from "react";
import { TIER_LABEL, type Tier } from "@/lib/aa/verifier/tier";

/**
 * Frame for the demo store: a store header, a banner showing what the server-side
 * verifier concluded about this very request, and the SDK script tag carrying the
 * verification token. Plain <a> links so each navigation is a verified page load.
 */
export function DemoChrome({
  siteKey,
  vt,
  tier,
  agentName,
  reason,
  children,
}: {
  siteKey: string;
  vt: string;
  tier: Tier;
  agentName?: string | null;
  reason?: string | null;
  children: ReactNode;
}) {
  const base = `/aa/demo/${siteKey}`;
  return (
    <div className="min-h-screen bg-[#faf8f4] text-[#1d1b16]">
      <div className="border-b border-black/10 bg-[#1d1b16] px-4 py-2 text-center text-[12px] text-white/85" data-testid="aa-banner">
        Demo store for agentic.do agent analytics · this request was verified as{" "}
        <strong className="text-white">
          {tier} {TIER_LABEL[tier]}
        </strong>
        {agentName ? ` · ${agentName}` : ""}
        {reason ? ` · signature ${reason.replace(/_/g, " ")}` : ""}
      </div>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <a href={base} className="text-lg font-semibold tracking-tight">
          Ridgeline Outfitters
        </a>
        <nav className="flex gap-5 text-sm">
          <a href={base} className="hover:underline">
            Shop
          </a>
          <a href={`${base}/checkout?item=trail-shell`} className="hover:underline">
            Checkout
          </a>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-5 pb-20">{children}</main>
      <script src="/aa.js" data-site={siteKey} data-vt={vt} defer />
    </div>
  );
}
