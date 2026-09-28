/**
 * Minimal Web Bot Auth client: fetches URLs with signed requests, the way a
 * registered agent would. Use it to try the registry and the demo store.
 *
 *   npx tsx scripts/aa-agent.mts --key ./my-agent-private-key.json \
 *     --registry http://localhost:3000 http://localhost:3000/aa/demo/<site-key>
 *
 * --key       private JWK downloaded from Agent registry → Register agent
 * --registry  origin sent in Signature-Agent (default: APP_URL or http://localhost:3000)
 * --ua        user agent to send (default: "aa-agent/0.1")
 * --unsigned  send the same requests without a signature, for comparison
 */
import { readFileSync } from "node:fs";

const mod = await import(new URL("../lib/aa/verifier/httpsig.ts", import.meta.url).href);
const { signRequest } = (mod.default ?? mod) as typeof import("../lib/aa/verifier/httpsig.ts");

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const bool = (name: string) => {
  const i = args.indexOf(`--${name}`);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
};
const keyPath = flag("key");
const registry = flag("registry") ?? process.env.APP_URL ?? "http://localhost:3000";
const ua = flag("ua") ?? "aa-agent/0.1";
const unsigned = bool("unsigned");
const urls = args;

if (!urls.length || (!keyPath && !unsigned)) {
  console.error("usage: tsx scripts/aa-agent.mts --key <private-key.json> [--registry <origin>] [--ua <ua>] [--unsigned] <url>…");
  process.exit(1);
}

const key = keyPath ? JSON.parse(readFileSync(keyPath, "utf8")) : null;
if (key && (!key.d || !key.kid)) {
  console.error("That file isn't a private agent key (expected a JWK with d and kid).");
  process.exit(1);
}

for (const url of urls) {
  const headers: Record<string, string> = { "user-agent": ua };
  if (!unsigned) Object.assign(headers, await signRequest({ method: "GET", url }, { key, keyid: key.kid, signatureAgent: registry }));
  const res = await fetch(url, { headers });
  const html = await res.text();
  const banner = /data-testid="aa-banner"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  console.log(`${res.status} ${url}${banner ? `\n    ${banner}` : ""}`);
}
