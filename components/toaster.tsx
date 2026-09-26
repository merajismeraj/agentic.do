"use client";

import { useStore } from "@/lib/store";

export function Toaster() {
  const { toasts } = useStore();
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="animate-pop rounded-full bg-fg px-4 py-2 text-sm font-medium text-bg shadow-pop">
          {t.text}
        </div>
      ))}
    </div>
  );
}
