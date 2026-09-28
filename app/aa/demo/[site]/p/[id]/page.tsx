import { notFound } from "next/navigation";
import { DemoChrome } from "@/components/aa-demo/chrome";
import { demoVerdict, PRODUCTS } from "@/lib/server/aa/demo";

export const dynamic = "force-dynamic";

export default async function DemoProduct({ params }: { params: Promise<{ site: string; id: string }> }) {
  const { site: key, id } = await params;
  const p = PRODUCTS.find((x) => x.id === id);
  if (!p) notFound();
  const { v } = await demoVerdict(key, `/aa/demo/${key}/p/${id}`);
  return (
    <DemoChrome siteKey={key} vt={v.vt} tier={v.tier} agentName={v.agent?.name} reason={v.verify.status === "invalid" ? v.verify.reason : null}>
      <a href={`/aa/demo/${key}`} className="text-sm text-black/55 hover:underline">
        ← All gear
      </a>
      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <div className="aspect-square rounded-2xl bg-gradient-to-br from-[#e9e3d6] to-[#cfc4ab]" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{p.name}</h1>
          <div className="mt-1 text-black/55">{p.tagline}</div>
          <div className="mt-4 text-2xl font-semibold">${p.price}</div>
          <div className="mt-6 space-y-3 text-[15px] leading-relaxed text-black/75">
            {p.body.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
          <a
            href={`/aa/demo/${key}/checkout?item=${p.id}`}
            className="mt-8 inline-flex h-11 items-center rounded-full bg-[#1d1b16] px-6 text-sm font-medium text-white hover:bg-black"
            data-action="buy"
          >
            Buy now
          </a>
        </div>
      </div>
    </DemoChrome>
  );
}
