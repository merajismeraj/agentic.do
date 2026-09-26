"use client";

import { X } from "lucide-react";
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { integrationById, providerById } from "@/lib/catalog";
import type { Agent, ProviderId } from "@/lib/types";
import { cn } from "@/lib/utils";

/* Buttons ----------------------------------------------------------- */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        size === "sm" && "h-8 px-2.5 text-[13px]",
        size === "md" && "h-9 px-3.5 text-sm",
        size === "lg" && "h-11 px-5 text-[15px]",
        variant === "primary" && "bg-accent text-accent-fg shadow-sm hover:brightness-110",
        variant === "secondary" && "border border-line bg-surface text-fg shadow-sm hover:bg-surface-2",
        variant === "ghost" && "text-fg-2 hover:bg-surface-2 hover:text-fg",
        variant === "soft" && "bg-accent-soft text-accent-ink hover:brightness-95 dark:hover:brightness-125",
        variant === "danger" && "text-danger hover:bg-danger-soft",
        className,
      )}
    />
  );
}

/* Small bits -------------------------------------------------------- */

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "ok" | "warn" | "danger";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4",
        tone === "neutral" && "bg-surface-2 text-fg-2",
        tone === "accent" && "bg-accent-soft text-accent-ink",
        tone === "ok" && "bg-ok-soft text-ok",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "danger" && "bg-danger-soft text-danger",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1 font-mono text-[10px] text-muted">
      {children}
    </kbd>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn("rounded-2xl border border-line bg-surface shadow-card", className)}>
      {children}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        checked ? "bg-accent" : "bg-surface-3 ring-1 ring-inset ring-line-strong",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform",
          checked && "translate-x-4",
        )}
      />
    </button>
  );
}

export function Meter({ value, className }: { value: number; className?: string }) {
  const tone = value >= 90 ? "bg-danger" : value >= 70 ? "bg-warn" : "bg-ok";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-lg border border-line bg-surface-2 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-[13px] font-medium transition-all",
            value === o.value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* Logos & avatars --------------------------------------------------- */

export function ProviderLogo({ id, size = 28, className }: { id: ProviderId; size?: number; className?: string }) {
  const p = providerById(id);
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-lg font-semibold text-white", className)}
      style={{ width: size, height: size, background: p.color, fontSize: size * 0.5 }}
      aria-label={p.name}
      title={p.name}
    >
      {p.glyph}
    </span>
  );
}

export function ToolLogo({ id, size = 24, className }: { id: string; size?: number; className?: string }) {
  const i = integrationById(id);
  if (!i) return null;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-md font-bold text-white", className)}
      style={{ width: size, height: size, background: i.color, fontSize: size * (i.glyph.length > 1 ? 0.36 : 0.5) }}
      title={i.name}
      aria-label={i.name}
    >
      {i.glyph}
    </span>
  );
}

export function AgentAvatar({
  agent,
  size = 32,
  showStatus = false,
  className,
}: {
  agent: Pick<Agent, "emoji" | "color" | "name"> & { status?: Agent["status"] };
  size?: number;
  showStatus?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className="inline-flex items-center justify-center rounded-full"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.5,
          background: `color-mix(in srgb, ${agent.color} 16%, var(--surface))`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${agent.color} 30%, transparent)`,
        }}
        aria-label={agent.name}
      >
        {agent.emoji}
      </span>
      {showStatus && agent.status && (
        <span
          className={cn(
            "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-surface",
            agent.status === "working" && "bg-accent animate-pulse-ring",
            agent.status === "idle" && "bg-ok",
            agent.status === "paused" && "bg-muted",
          )}
        />
      )}
    </span>
  );
}

/* Modal ------------------------------------------------------------- */

export function Modal({
  open,
  onClose,
  children,
  className,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  title?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal
        className={cn(
          "animate-pop relative max-h-[92vh] w-full overflow-auto rounded-t-2xl border border-line bg-surface shadow-pop sm:max-w-lg sm:rounded-2xl",
          className,
        )}
      >
        {title && (
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/90 px-5 py-3.5 backdrop-blur">
            <div className="font-semibold">{title}</div>
            <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
              <X size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/* Rich text: **bold**, bullet lines, paragraphs ---------------------- */

export function Rich({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("space-y-2 text-[14px] leading-relaxed text-fg-2", className)}>
      {text.split(/\n\n+/).map((para, i) => (
        <div key={i} className="space-y-1">
          {para.split("\n").map((line, j) => (
            <p key={j} className={cn(line.startsWith("• ") && "flex gap-2")}>
              {line.startsWith("• ") ? (
                <>
                  <span className="text-muted">•</span>
                  <span>{inline(line.slice(2))}</span>
                </>
              ) : (
                inline(line)
              )}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).map((part, i) =>
    part.startsWith("**") ? (
      <strong key={i} className="font-semibold text-fg">
        {part.slice(2, -2)}
      </strong>
    ) : part.startsWith("*") && part.length > 2 ? (
      <em key={i}>{part.slice(1, -1)}</em>
    ) : (
      part
    ),
  );
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-surface-2 text-muted">{icon}</div>
      <div className="font-semibold">{title}</div>
      <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="relative inline-flex size-6 items-center justify-center rounded-[7px] bg-fg text-bg">
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <span>
        agentic<span className="text-accent">.do</span>
      </span>
    </span>
  );
}
