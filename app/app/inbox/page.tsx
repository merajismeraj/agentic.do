"use client";

import { Inbox } from "lucide-react";
import { useEffect, useState } from "react";
import { ApprovalCard } from "@/components/approval-card";
import { PageHeader } from "@/components/shell";
import { Empty, Kbd, Segmented } from "@/components/ui";
import { useStore } from "@/lib/store";

export default function InboxPage() {
  const { state, decide } = useStore();
  const [tab, setTab] = useState<"pending" | "done">("pending");
  const [focus, setFocus] = useState(0);
  const list = state.approvals.filter((a) => (tab === "pending" ? a.status === "pending" : a.status !== "pending"));

  useEffect(() => {
    if (tab !== "pending") return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || e.metaKey || e.ctrlKey) return;
      if (e.key === "j") setFocus((f) => Math.min(list.length - 1, f + 1));
      if (e.key === "k") setFocus((f) => Math.max(0, f - 1));
      if (e.key === "a" && list[focus]) decide(list[focus].id, "approved");
      if (e.key === "x" && list[focus]) decide(list[focus].id, "rejected");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, list, focus, decide]);

  useEffect(() => setFocus((f) => Math.min(f, Math.max(0, list.length - 1))), [list.length]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Approvals"
        subtitle="Anything that leaves your company waits here until you say so."
        actions={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "pending", label: `Waiting · ${state.approvals.filter((a) => a.status === "pending").length}` },
              { value: "done", label: "Handled" },
            ]}
          />
        }
      />

      {tab === "pending" && list.length > 0 && (
        <div className="mb-4 hidden items-center gap-3 text-xs text-muted sm:flex">
          <span className="flex items-center gap-1"><Kbd>J</Kbd><Kbd>K</Kbd> move</span>
          <span className="flex items-center gap-1"><Kbd>A</Kbd> approve</span>
          <span className="flex items-center gap-1"><Kbd>X</Kbd> discard</span>
        </div>
      )}

      <div className="space-y-3">
        {list.map((a, i) => (
          <div key={a.id} onMouseEnter={() => setFocus(i)}>
            <ApprovalCard approval={a} focused={tab === "pending" && i === focus} />
          </div>
        ))}
      </div>

      {!list.length && (
        <Empty
          icon={<Inbox size={20} />}
          title={tab === "pending" ? "Inbox zero" : "Nothing handled yet"}
          body={
            tab === "pending"
              ? "Your teammates will queue emails, posts and record changes here for a one-tap review."
              : "Approved and discarded actions are kept here as an audit trail."
          }
        />
      )}
    </div>
  );
}
