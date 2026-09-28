import { CheckoutForm } from "@/components/aa-demo/checkout-form";
import { DemoChrome } from "@/components/aa-demo/chrome";
import { demoVerdict, PRODUCTS } from "@/lib/server/aa/demo";

export const dynamic = "force-dynamic";

export default async function DemoCheckout({ params, searchParams }: { params: Promise<{ site: string }>; searchParams: Promise<{ item?: string }> }) {
  const { site: key } = await params;
  const { item } = await searchParams;
  const p = PRODUCTS.find((x) => x.id === item) ?? PRODUCTS[0];
  const { v } = await demoVerdict(key, `/aa/demo/${key}/checkout?item=${p.id}`);
  return (
    <DemoChrome siteKey={key} vt={v.vt} tier={v.tier} agentName={v.agent?.name} reason={v.verify.status === "invalid" ? v.verify.reason : null}>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Checkout</h1>
      <p className="mt-1 text-sm text-black/55">
        {p.name} · ${p.price}. Demo only: nothing is charged or shipped, and no payment details are asked for.
      </p>
      <CheckoutForm product={p.name} />
    </DemoChrome>
  );
}
