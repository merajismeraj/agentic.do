"use client";

import { useEffect, useRef, useState } from "react";

type AaQueue = { task: (name: string, state: "start" | "complete" | "fail") => void } | unknown[] | undefined;

/** Reports the checkout task to the SDK: start on arrival, complete on a valid order, fail on an invalid attempt. */
function task(state: "start" | "complete" | "fail") {
  const w = window as unknown as { aa?: AaQueue };
  if (w.aa && !Array.isArray(w.aa)) w.aa.task("checkout", state);
  else (w.aa = (w.aa as unknown[]) ?? []).push(["task", "checkout", state]);
}

export function CheckoutForm({ product }: { product: string }) {
  const [done, setDone] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    task("start");
  }, []);

  if (done)
    return (
      <div className="mt-8 max-w-md rounded-2xl border border-black/10 bg-white p-6" data-testid="order-confirmed">
        <div className="text-lg font-semibold">Order placed</div>
        <p className="mt-1 text-sm text-black/60">
          {product} for {done}. This was a demo — nothing was charged.
        </p>
      </div>
    );

  const field = "mt-1 h-11 w-full rounded-xl border border-black/15 bg-white px-3 text-[15px] outline-none focus:border-black/40";
  return (
    <form
      className="mt-8 grid max-w-md gap-4"
      onInvalid={() => task("fail")}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        task("complete");
        setDone(String(f.get("name")));
      }}
    >
      <label className="text-sm font-medium">
        Full name
        <input name="name" required autoComplete="name" className={field} />
      </label>
      <label className="text-sm font-medium">
        Email
        <input name="email" type="email" required autoComplete="email" className={field} />
      </label>
      <label className="text-sm font-medium">
        Shipping address
        <input name="address" required autoComplete="street-address" className={field} />
      </label>
      <button type="submit" className="mt-2 h-12 rounded-full bg-[#1d1b16] text-sm font-medium text-white hover:bg-black" data-action="place-order">
        Place order
      </button>
    </form>
  );
}
