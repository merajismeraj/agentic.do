"use client";

import { Check, Pencil, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { integrationById } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import type { Approval } from "@/lib/types";
import { ago, cn } from "@/lib/utils";
import { AgentAvatar, Badge, Button, ToolLogo } from "./ui";

export function ApprovalCard({ approval, compact = false, focused = false }: { approval: Approval; compact?: boolean; focused?: boolean }) {
  const { state, decide } = useStore();
  const agent = state.agents.find((a) => a.id === approval.agentId);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState(approval.preview);
  const [expanded, setExpanded] = useState(!compact);
  const tool = integrationById(approval.toolId);
  const done = approval.status !== "pending";

  return (
    <div
      className={cn(
        "animate-rise overflow-hidden rounded-2xl border bg-surface shadow-card transition-all",
        focused ? "border-accent ring-4 ring-accent/10" : "border-line",
        done && "opacity-70",
      )}
    >
      <div className="flex items-start gap-3 p-4">
        {agent && <AgentAvatar agent={agent} size={34} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
            {agent && (
              <Link href={`/app/agents/${agent.id}`} className="font-medium text-fg hover:underline">
                {agent.name}
              </Link>
            )}
            <span>wants to</span>
            {tool && (
              <span className="inline-flex items-center gap-1 text-fg-2">
                <ToolLogo id={tool.id} size={14} className="rounded" /> {tool.name}
              </span>
            )}
            <span>· {ago(approval.at)}</span>
            {approval.status === "approved" && <Badge tone="ok">Approved</Badge>}
            {approval.status === "rejected" && <Badge>Discarded</Badge>}
          </div>
          <button className="mt-0.5 block text-left text-[15px] font-medium" onClick={() => setExpanded((v) => !v)}>
            {approval.title}
          </button>
          <p className="mt-0.5 text-[13px] text-muted">{approval.summary}</p>
        </div>
      </div>

      {expanded && (
        <div className="mx-4 mb-4 space-y-2 rounded-xl border border-line bg-surface-2/60 p-3">
          {fields.map((f, i) => (
            <div key={f.label} className="grid gap-1 sm:grid-cols-[80px_1fr] sm:gap-3">
              <div className="pt-0.5 text-xs font-medium text-muted">{f.label}</div>
              {editing ? (
                <textarea
                  value={f.value}
                  onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                  rows={f.value.split("\n").length + (f.value.length > 80 ? 1 : 0)}
                  className="w-full resize-y rounded-md border border-line bg-surface px-2 py-1 text-[13px] leading-relaxed outline-none focus:border-accent"
                />
              ) : (
                <div className="text-[13px] leading-relaxed whitespace-pre-wrap text-fg-2">{f.value}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {approval.result && (
        <div className="border-t border-line bg-surface-2/40 px-4 py-2.5 text-[13px] text-fg-2">{approval.result}</div>
      )}

      {!done && (
        <div className="flex items-center gap-2 border-t border-line bg-surface-2/40 px-4 py-2.5">
          <Button variant="primary" size="sm" onClick={() => decide(approval.id, "approved", fields)}>
            <Check size={14} /> {editing ? "Save & approve" : "Approve"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setExpanded(true);
              setEditing((v) => !v);
            }}
          >
            <Pencil size={13} /> {editing ? "Done editing" : "Edit"}
          </Button>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => decide(approval.id, "rejected")}>
            <X size={14} /> Discard
          </Button>
        </div>
      )}
    </div>
  );
}
