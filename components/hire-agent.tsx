"use client";

import { ArrowLeft, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TEMPLATES, type AgentTemplate } from "@/lib/catalog";
import { hire } from "@/lib/seed";
import { useStore } from "@/lib/store";
import { AgentConfig, type AgentDraft } from "./agent-config";
import { AgentAvatar, Button, Modal, ToolLogo } from "./ui";

const BLANK: AgentTemplate = {
  name: "",
  role: "",
  emoji: "🦉",
  color: "#64748B",
  pitch: "",
  instructions: "",
  tools: [],
  brain: "auto",
  autonomy: "ask",
  routines: [],
};

export function HireAgent({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, update, toast } = useStore();
  const router = useRouter();
  const [tpl, setTpl] = useState<AgentTemplate | null>(null);
  const [draft, setDraft] = useState<AgentDraft | null>(null);

  const close = () => {
    onClose();
    setTimeout(() => {
      setTpl(null);
      setDraft(null);
    }, 200);
  };

  const pick = (t: AgentTemplate) => {
    setTpl(t);
    const { pitch: _p, routines: _r, ...d } = t;
    setDraft(d);
  };

  const confirm = () => {
    if (!tpl || !draft) return;
    const { agent, routines } = hire({ ...tpl, ...draft, name: draft.name || "Teammate", role: draft.role || "Generalist" });
    update((s) => ({ ...s, agents: [...s.agents, agent], routines: [...s.routines, ...routines] }));
    toast(`${agent.name} joined your team 🎉`);
    close();
    router.push(`/app/agents/${agent.id}`);
  };

  const hiredRoles = new Set(state.agents.map((a) => a.role));

  return (
    <Modal
      open={open}
      onClose={close}
      className="sm:max-w-2xl"
      title={
        draft ? (
          <button onClick={() => setDraft(null)} className="flex items-center gap-2 text-sm">
            <ArrowLeft size={16} /> Customize {draft.name || "teammate"}
          </button>
        ) : (
          "Hire a teammate"
        )
      }
    >
      {!draft ? (
        <div className="p-5">
          <p className="mb-4 text-sm text-muted">Start from a proven role — you can change everything afterwards.</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.role}
                onClick={() => pick(t)}
                className="group flex gap-3 rounded-xl border border-line p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card"
              >
                <AgentAvatar agent={t} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {t.role}
                    {hiredRoles.has(t.role) && <span className="text-[11px] font-normal text-muted">· hired</span>}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted">{t.pitch}</div>
                  <div className="mt-2 flex -space-x-1">
                    {t.tools.map((id) => (
                      <ToolLogo key={id} id={id} size={16} className="rounded-full ring-2 ring-surface" />
                    ))}
                  </div>
                </div>
              </button>
            ))}
            <button
              onClick={() => pick(BLANK)}
              className="flex items-center gap-3 rounded-xl border border-dashed border-line-strong p-3.5 text-left hover:bg-surface-2 sm:col-span-2"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-surface-2">
                <Wand2 size={18} className="text-muted" />
              </span>
              <div>
                <div className="text-sm font-medium">Describe your own</div>
                <div className="text-xs text-muted">Write a job description in plain English.</div>
              </div>
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="p-5">
            <AgentConfig draft={draft} onChange={setDraft} />
          </div>
          <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-line bg-surface/90 px-5 py-3 backdrop-blur">
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Back
            </Button>
            <Button variant="primary" onClick={confirm} disabled={!draft.name.trim()}>
              Hire {draft.name || "teammate"}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
