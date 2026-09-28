import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { siteByKey } from "./sites";
import { verifyForSite } from "./verify";

/** Verify the request for a demo-store page exactly as a customer's edge would via /api/aa/verify. */
export async function demoVerdict(siteKey: string, path: string) {
  const site = await siteByKey(siteKey);
  if (!site) notFound();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const v = await verifyForSite(site, {
    method: "GET",
    url: `${proto}://${host}${path}`,
    headers: Object.fromEntries(h.entries()),
    ip: h.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
  });
  return { site, v };
}

export const PRODUCTS = [
  {
    id: "trail-shell",
    name: "Ridge Trail Shell",
    price: 189,
    tagline: "Three-layer waterproof jacket",
    body: [
      "A three-layer shell for long, wet days above the tree line. The membrane is bonded to a brushed backer, so it feels soft against a base layer and stays quiet when you move.",
      "Pit zips run 30 cm and open from either end. The hood fits over a climbing helmet and cinches down with one pull when you take the helmet off. Both hand pockets sit above a hip belt.",
      "Seams are taped with 13 mm tape. The face fabric has a PFC-free water repellent finish; rinse and tumble dry on low to restore it.",
      "Weight: 390 g (size M). Packs into its own chest pocket. Fit: regular, room for a fleece underneath.",
    ],
  },
  { id: "bottle", name: "Everyday Bottle 750", price: 24, tagline: "Insulated steel bottle", body: ["Keeps drinks cold for 24 hours or hot for 12. Dishwasher-safe lid."] },
  {
    id: "stove",
    name: "Pocket Canister Stove",
    price: 59,
    tagline: "Boils a litre in 3.5 minutes",
    body: [
      "A 78 g stove that folds to the size of an egg. The regulator keeps output steady as the canister cools, so the last boil is nearly as fast as the first.",
      "Piezo ignition, wide pot supports for pans up to 20 cm, and a windshield ring that clips on without tools.",
    ],
  },
  { id: "headlamp", name: "Nightline Headlamp", price: 39, tagline: "400 lumens, USB-C", body: ["Red night mode, lockout for travel, and a battery gauge you can read with gloves on."] },
  {
    id: "tent",
    name: "Two-Person Ultralight Tent",
    price: 429,
    tagline: "Freestanding, 1.3 kg",
    body: [
      "Two doors, two vestibules, and enough headroom for two people to sit up at the same time. The hubbed pole set pitches in under three minutes and stands on its own, so it works on rock and sand as well as soil.",
      "The fly is silicone-coated ripstop nylon with a 3,000 mm hydrostatic head. The inner is mostly mesh for summer; a solid-panel inner for shoulder seasons is sold separately.",
      "Floor area: 2.7 m². Packed size: 46 × 15 cm. Includes 10 stakes, guylines, and a stuff sack with compression straps.",
      "Care: pitch it to dry before storing, and store it loose rather than packed.",
    ],
  },
  { id: "socks", name: "Merino Hiking Socks (3-pack)", price: 36, tagline: "Cushioned, seamless toe", body: ["70% merino, 30% nylon for durability."] },
];
