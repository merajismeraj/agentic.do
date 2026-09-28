import { DIRECTORY_MEDIA_TYPE, DIRECTORY_PATH, isEd25519PublicJwk, jwkThumbprint, type Ed25519PublicJwk } from "./httpsig";

/**
 * Fetches and caches JWKS directories of *trusted* origins only. Untrusted
 * Signature-Agent URLs are never fetched, so a request can't make us call an
 * arbitrary host (SSRF) or inflate our outbound traffic.
 */
export function directoryUrl(signatureAgent: string): string | null {
  try {
    const u = new URL(signatureAgent);
    if (u.protocol !== "https:" && !(u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"))) return null;
    // Bare origin → well-known path; a path means the URL is the directory itself.
    if (u.pathname === "/" || u.pathname === "") return `${u.origin}${DIRECTORY_PATH}`;
    return u.href;
  } catch {
    return null;
  }
}

export function originOf(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

interface Cached {
  at: number;
  keys: Map<string, Ed25519PublicJwk>;
}

export function createDirectoryCache(opts: { trustedOrigins: string[]; ttlMs?: number; fetchImpl?: typeof fetch; timeoutMs?: number }) {
  const trusted = new Set(opts.trustedOrigins.map((o) => originOf(o)).filter(Boolean) as string[]);
  const cache = new Map<string, Cached>();
  const ttl = opts.ttlMs ?? 10 * 60_000;

  async function load(url: string): Promise<Map<string, Ed25519PublicJwk>> {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < ttl) return hit.keys;
    const keys = new Map<string, Ed25519PublicJwk>();
    try {
      const res = await (opts.fetchImpl ?? fetch)(url, {
        headers: { accept: `${DIRECTORY_MEDIA_TYPE}, application/json` },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 3000),
        redirect: "error",
      });
      if (res.ok) {
        const body = (await res.json()) as { keys?: unknown[] };
        for (const k of body.keys ?? []) if (isEd25519PublicJwk(k)) keys.set(await jwkThumbprint(k), k);
      }
    } catch {
      /* unreachable directory: cache the empty result briefly */
    }
    cache.set(url, { at: Date.now(), keys });
    return keys;
  }

  return {
    isTrusted: (signatureAgent: string | null) => !!signatureAgent && trusted.has(originOf(signatureAgent) ?? ""),
    /** Find a key by thumbprint in a trusted directory; null when untrusted or absent. */
    async find(keyid: string, signatureAgent: string | null): Promise<Ed25519PublicJwk | null> {
      if (!signatureAgent || !trusted.has(originOf(signatureAgent) ?? "")) return null;
      const url = directoryUrl(signatureAgent);
      if (!url) return null;
      return (await load(url)).get(keyid) ?? null;
    },
  };
}
