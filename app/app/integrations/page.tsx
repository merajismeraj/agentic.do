"use client";

import { Check, Search } from "lucide-react";
import { useState } from "react";
import { ConnectTool } from "@/components/connect";
import { PageHeader } from "@/components/shell";
import { AgentAvatar, Button, Card, Segmented, ToolLogo } from "@/components/ui";
import { INTEGRATIONS } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import type { IntegrationCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function IntegrationsPage() {
  const { state, update, toast } = useStore();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "connected">("all");
  const [cat, setCat] = useState<IntegrationCategory | "All">("All");
  const [connecting, setConnecting] = useState<string | null>(null);

  const cats = ["All", ...new Set(INTEGRATIONS.map((i) => i.category))] as (IntegrationCategory | "All")[];
  const list = INTEGRATIONS.filter(
    (i) =>
      (filter === "all" || state.connected.includes(i.id)) &&
      (cat === "All" || i.category === cat) &&
      `${i.name} ${i.blurb}`.toLowerCase().includes(q.toLowerCase()),
  );
  // Tools teammates were given but can't reach yet — surface these first.
  const wanted = [...new Set(state.agents.flatMap((a) => a.tools))].filter((t) => !state.connected.includes(t));

  return (
    <div>
      <PageHeader
        title="Integrations"
        subtitle="Connect the tools you work in. Teammates only see what you connect, and only act with your permission."
        actions={
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "connected", label: `Connected · ${state.connected.length}` },
            ]}
          />
        }
      />

      {wanted.length > 0 && (
        <Card className="mb-6 flex flex-wrap items-center gap-3 border-warn/30 bg-warn-soft/50 p-4">
          <span className="text-sm">Your teammates are waiting on:</span>
          {wanted.map((t) => (
            <button
              key={t}
              onClick={() => setConnecting(t)}
              className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-[13px] font-medium hover:border-line-strong"
            >
              <ToolLogo id={t} size={18} className="rounded-full" /> {INTEGRATIONS.find((i) => i.id === t)?.name}
            </button>
          ))}
        </Card>
      )}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search 1,000+ apps"
            className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-sm outline-none focus:border-accent"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-[13px]",
                cat === c ? "bg-fg text-bg" : "text-fg-2 hover:bg-surface-2",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((i) => {
          const on = state.connected.includes(i.id);
          const users = state.agents.filter((a) => a.tools.includes(i.id));
          return (
            <Card key={i.id} className="flex flex-col p-4">
              <div className="flex items-start gap-3">
                <ToolLogo id={i.id} size={38} className="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-medium">
                    {i.name}
                    {on && <Check size={14} className="text-ok" />}
                  </div>
                  <div className="text-xs text-muted">{i.category}</div>
                </div>
                {on ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      update((s) => ({ ...s, connected: s.connected.filter((x) => x !== i.id) }));
                      toast(`${i.name} disconnected`);
                    }}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setConnecting(i.id)}>
                    Connect
                  </Button>
                )}
              </div>
              <p className="mt-3 text-[13px] text-fg-2">{i.blurb}</p>
              {users.length > 0 && (
                <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-3 text-xs text-muted">
                  <span className="flex -space-x-1">
                    {users.map((a) => (
                      <AgentAvatar key={a.id} agent={a} size={18} className="rounded-full ring-2 ring-surface" />
                    ))}
                  </span>
                  Used by {users.map((a) => a.name).join(", ")}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <ConnectTool id={connecting} onClose={() => setConnecting(null)} />
    </div>
  );
}
