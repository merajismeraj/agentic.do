import type { Metadata } from "next";
import { DemoChrome } from "@/components/aa-demo/chrome";
import { demoVerdict, PRODUCTS } from "@/lib/server/aa/demo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ridgeline Outfitters — demo store", robots: { index: false } };

export default async function DemoShop({ params }: { params: Promise<{ site: string }> }) {
  const { site: key } = await params;
  const { v } = await demoVerdict(key, `/aa/demo/${key}`);
  return (
    <DemoChrome siteKey={key} vt={v.vt} tier={v.tier} agentName={v.agent?.name} reason={v.verify.status === "invalid" ? v.verify.reason : null}>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Gear for long days outside</h1>
      <p className="mt-2 max-w-xl text-[15px] text-black/60">Six things we actually carry. Pick one, read the details, and check out — or send your agent to do it.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PRODUCTS.map((p) => (
          <a key={p.id} href={`/aa/demo/${key}/p/${p.id}`} className="group rounded-2xl border border-black/10 bg-white p-5 transition-shadow hover:shadow-lg" data-product={p.id}>
            <div className="mb-4 aspect-[4/3] rounded-xl bg-gradient-to-br from-[#e9e3d6] to-[#d6cdb8]" />
            <div className="font-medium group-hover:underline">{p.name}</div>
            <div className="text-sm text-black/55">{p.tagline}</div>
            <div className="mt-2 font-semibold">${p.price}</div>
          </a>
        ))}
      </div>
    </DemoChrome>
  );
}
