"use client";

import { AlertTriangle, CheckCircle2, Loader2, Mail, Send } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Field, input } from "@/components/agent-config";
import { PageHeader } from "@/components/shell";
import { Button, Card, Switch } from "@/components/ui";
import { safeZone } from "@/lib/schedule";
import { useStore } from "@/lib/store";
import type { NotificationPrefs } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { state, update, mode, account, live, toast } = useStore();
  const [sending, setSending] = useState(false);
  const prefs: NotificationPrefs = { approvals: state.notifications?.approvals ?? true, failures: state.notifications?.failures ?? true };
  const tz = safeZone(state.user.timezone);
  const zones = useMemo(() => {
    let list: string[] = [];
    try {
      list = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
    } catch {}
    // The browser's list omits aliases like "UTC"; always include the saved zone so the select shows the truth.
    return [...new Set(["UTC", tz, ...list])];
  }, [tz]);
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const setUser = (patch: Partial<typeof state.user>) => update((s) => ({ ...s, user: { ...s.user, ...patch } }));
  const setPrefs = (patch: Partial<NotificationPrefs>) => update((s) => ({ ...s, notifications: { ...prefs, ...patch } }));

  const sendTest = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/notifications/test", { method: "POST" });
      const body = (await res.json()) as { to?: string; error?: string };
      toast(res.ok ? `Test email sent to ${body.to}` : (body.error ?? "Couldn't send"));
    } finally {
      setSending(false);
    }
  };

  const emailReady = !!live?.email.configured;
  const resendVerification = async () => {
    const res = await fetch("/api/auth/verify/resend", { method: "POST" }).catch(() => null);
    const body = ((await res?.json().catch(() => ({}))) ?? {}) as { error?: string; to?: string };
    toast(res?.ok ? `Sent — check ${account?.email}` : (body.error ?? "Couldn't send"));
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" subtitle="Your profile, timezone and how your team reaches you." />

      <section className="mb-10">
        <h2 className="mb-3 text-[15px] font-semibold">Profile</h2>
        <Card className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input className={input} value={state.user.name} onChange={(e) => setUser({ name: e.target.value })} />
            </Field>
            <Field label="Company">
              <input className={input} value={state.user.company} onChange={(e) => setUser({ company: e.target.value })} />
            </Field>
          </div>
          <Field label="Timezone" hint="Routines run on this clock — a “Weekdays · 08:00” routine runs at 08:00 here.">
            <div className="flex flex-wrap items-center gap-2">
              <select className={cn(input, "max-w-xs")} value={tz} onChange={(e) => setUser({ timezone: e.target.value })}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              {browserTz && browserTz !== tz && (
                <Button size="sm" variant="soft" onClick={() => setUser({ timezone: browserTz })}>
                  Use {browserTz.replace(/_/g, " ")}
                </Button>
              )}
            </div>
          </Field>
        </Card>
      </section>

      <section>
        <h2 className="mb-1 text-[15px] font-semibold">Email alerts</h2>
        <p className="mb-3 text-sm text-muted">For work that happens while you're away. Things you start yourself show up in the app, not your inbox.</p>
        <Card className="divide-y divide-line">
          <div className="flex flex-wrap items-center gap-3 px-5 py-4 text-sm">
            <Mail size={16} className="text-muted" />
            <span className="text-muted">Sent to</span>
            <span className="font-medium">{mode === "account" ? account?.email : "your account email"}</span>
            {mode === "account" &&
              (account?.emailVerified ? (
                <span className="inline-flex items-center gap-1 text-xs text-ok">
                  <CheckCircle2 size={13} /> Confirmed
                </span>
              ) : (
                <span className="ml-auto flex items-center gap-2 text-xs">
                  <span className="text-warn">Not confirmed — alerts are paused</span>
                  <Button size="sm" variant="soft" onClick={resendVerification}>
                    Resend link
                  </Button>
                </span>
              ))}
          </div>
          <Toggle
            title="A scheduled run needs my approval"
            body="E.g. the morning brief drafted a reply. One email per check, grouping everything waiting."
            checked={prefs.approvals}
            onChange={(v) => setPrefs({ approvals: v })}
          />
          <Toggle title="A scheduled routine fails" body="With the reason, like an expired Google connection or a missing API key." checked={prefs.failures} onChange={(v) => setPrefs({ failures: v })} />
          <div className="flex flex-wrap items-center gap-3 px-5 py-4">
            {mode !== "account" ? (
              <p className="text-sm text-muted">
                Alerts need an account.{" "}
                <Link href="/signup" className="font-medium text-accent hover:underline">
                  Create one
                </Link>
              </p>
            ) : emailReady && !account?.emailVerified ? (
              <p className="text-sm text-muted">Confirm your email above to turn alerts on.</p>
            ) : emailReady ? (
              <Button size="sm" onClick={sendTest} disabled={sending}>
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send test email
              </Button>
            ) : (
              <p className="flex items-start gap-2 text-sm text-warn">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                Email isn't set up on this server yet, so alerts can't be delivered. Set RESEND_API_KEY and EMAIL_FROM.
              </p>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}

function Toggle({ title, body, checked, onChange }: { title: string; body: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-0.5 text-[13px] text-muted">{body}</div>
      </div>
      <Switch label={title} checked={checked} onChange={onChange} />
    </div>
  );
}
