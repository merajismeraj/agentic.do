"use client";

import { Building2, Plus, Trash2, User, Users } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/shell";
import { Button, Card, Segmented } from "@/components/ui";
import { useStore } from "@/lib/store";
import type { MemoryFact } from "@/lib/types";
import { uid } from "@/lib/utils";

const SCOPES: { value: MemoryFact["scope"]; label: string; icon: typeof User; blurb: string }[] = [
  { value: "me", label: "About you", icon: User, blurb: "Preferences, voice, working hours" },
  { value: "team", label: "Your team", icon: Users, blurb: "Rituals, channels, owners" },
  { value: "company", label: "Your company", icon: Building2, blurb: "Product, customers, strategy" },
];

export default function MemoryPage() {
  const { state, update, toast } = useStore();
  const [text, setText] = useState("");
  const [scope, setScope] = useState<MemoryFact["scope"]>("me");

  const add = () => {
    if (!text.trim()) return;
    update((s) => ({ ...s, memory: [{ id: uid(), text: text.trim(), source: "You added this", scope }, ...s.memory] }));
    setText("");
    toast("Your team will remember that");
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Context"
        subtitle="What your teammates know about you and your work. They learn as they go — you stay in control."
      />

      <Card className="mb-8 p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add();
          }}
          rows={2}
          placeholder="Teach your team something… e.g. “Never book meetings on Friday afternoons.”"
          className="w-full resize-none bg-transparent text-[15px] outline-none placeholder:text-muted"
        />
        <div className="mt-2 flex items-center gap-2">
          <Segmented value={scope} onChange={setScope} options={SCOPES.map((s) => ({ value: s.value, label: s.label }))} />
          <Button variant="primary" size="sm" className="ml-auto" onClick={add} disabled={!text.trim()}>
            <Plus size={14} /> Remember
          </Button>
        </div>
      </Card>

      <div className="space-y-8">
        {SCOPES.map(({ value, label, icon: Icon, blurb }) => {
          const facts = state.memory.filter((m) => m.scope === value);
          return (
            <section key={value}>
              <div className="mb-3 flex items-center gap-2">
                <Icon size={16} className="text-muted" />
                <h2 className="text-[15px] font-semibold">{label}</h2>
                <span className="text-sm text-muted">· {blurb}</span>
              </div>
              <Card className="divide-y divide-line">
                {facts.map((f) => (
                  <div key={f.id} className="group flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">{f.text}</div>
                      <div className="mt-0.5 text-xs text-muted">{f.source}</div>
                    </div>
                    <button
                      onClick={() => update((s) => ({ ...s, memory: s.memory.filter((m) => m.id !== f.id) }))}
                      className="rounded-md p-1 text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-danger-soft hover:text-danger focus:opacity-100"
                      aria-label="Forget"
                      title="Forget this"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {!facts.length && <div className="px-4 py-3 text-sm text-muted">Nothing yet.</div>}
              </Card>
            </section>
          );
        })}
      </div>
    </div>
  );
}
