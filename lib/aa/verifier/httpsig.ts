/**
 * Web Bot Auth: HTTP Message Signatures (RFC 9421) profile for automated clients.
 * Runtime-agnostic (WebCrypto only) so it runs in Node, edge workers and browsers.
 *
 * An agent signs `@authority` (+ `signature-agent` when it sends that header) with an
 * Ed25519 key. `keyid` is the key's JWK SHA-256 thumbprint (RFC 7638). The verifier
 * looks the key up in a directory it trusts and checks the time window and nonce.
 */
import { b64ToBytes, bytesToB64, bytesToB64url, utf8 } from "./b64";
import { isInnerList, parseDictionary, parseItem, serializeBareItem, serializeParams, type BareItem, type InnerList } from "./sfv";

export const WEB_BOT_AUTH_TAG = "web-bot-auth";
export const DIRECTORY_PATH = "/.well-known/http-message-signatures-directory";
export const DIRECTORY_MEDIA_TYPE = "application/http-message-signatures-directory+json";

export interface Ed25519PublicJwk {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  kid?: string;
  [k: string]: unknown;
}

export interface RequestLike {
  method: string;
  url: string;
  headers: Headers | Record<string, string | string[] | undefined>;
}

function getHeader(h: RequestLike["headers"], name: string): string | null {
  if (typeof (h as Headers).get === "function") return (h as Headers).get(name);
  const rec = h as Record<string, string | string[] | undefined>;
  const key = Object.keys(rec).find((k) => k.toLowerCase() === name);
  const v = key ? rec[key] : undefined;
  if (v == null) return null;
  return Array.isArray(v) ? v.join(", ") : v;
}

/* ------------------------------ Keys ------------------------------- */

/** RFC 7638 JWK thumbprint (SHA-256, base64url) of an Ed25519 public key. */
export async function jwkThumbprint(jwk: Pick<Ed25519PublicJwk, "crv" | "kty" | "x">): Promise<string> {
  const canonical = `{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}"}`;
  return bytesToB64url(new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(canonical))));
}

export function isEd25519PublicJwk(v: unknown): v is Ed25519PublicJwk {
  const j = v as Ed25519PublicJwk;
  return !!j && j.kty === "OKP" && j.crv === "Ed25519" && typeof j.x === "string" && /^[A-Za-z0-9_-]{43}$/.test(j.x) && !("d" in j);
}

/** Generate an Ed25519 key pair; returns JWKs (the private one includes `d`). */
export async function generateAgentKey() {
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const publicJwk = (await crypto.subtle.exportKey("jwk", kp.publicKey)) as Ed25519PublicJwk;
  const privateJwk = (await crypto.subtle.exportKey("jwk", kp.privateKey)) as Ed25519PublicJwk & { d: string };
  const kid = await jwkThumbprint(publicJwk);
  return { kid, publicJwk: { kty: "OKP", crv: "Ed25519", x: publicJwk.x, kid } as Ed25519PublicJwk, privateJwk: { ...privateJwk, kid } };
}

/* ------------------------- Signature base -------------------------- */

interface Component {
  name: string;
  params: Record<string, BareItem>;
}

function componentId(c: Component) {
  return `"${c.name}"${serializeParams(c.params)}`;
}

function componentValue(req: RequestLike, c: Component): string {
  const url = new URL(req.url);
  switch (c.name) {
    case "@authority":
      return url.host.toLowerCase();
    case "@method":
      return req.method.toUpperCase();
    case "@scheme":
      return url.protocol.replace(":", "").toLowerCase();
    case "@target-uri":
      return url.href;
    case "@path":
      return url.pathname || "/";
    case "@query":
      return url.search || "?";
    case "@request-target":
      return `${url.pathname}${url.search}`;
  }
  if (c.name.startsWith("@")) throw new SignatureError("unsupported_component", `unsupported derived component ${c.name}`);
  const raw = getHeader(req.headers, c.name);
  if (raw == null) throw new SignatureError("missing_component", `covered header ${c.name} is missing`);
  const key = c.params.key;
  if (key && key.type === "string") {
    // Dictionary member of a structured header (e.g. "signature-agent";key="sig1").
    const member = parseDictionary(raw).get(key.value);
    if (!member) throw new SignatureError("missing_component", `${c.name} has no member ${key.value}`);
    return member.raw;
  }
  return raw.trim().replace(/\s*\n\s*/g, " ");
}

export function signatureBase(req: RequestLike, components: Component[], signatureParams: string) {
  const lines = components.map((c) => `${componentId(c)}: ${componentValue(req, c)}`);
  lines.push(`"@signature-params": ${signatureParams}`);
  return lines.join("\n");
}

/* ------------------------------ Signing ---------------------------- */

export interface SignOptions {
  /** Private Ed25519 JWK (with `d`) or a CryptoKey. */
  key: JsonWebKey | CryptoKey;
  keyid: string;
  /** Directory URL advertised in Signature-Agent (e.g. https://agentic.do). */
  signatureAgent?: string;
  label?: string;
  created?: number;
  /** Validity in seconds (default 60). */
  ttl?: number;
  nonce?: string;
  tag?: string;
}

/** Returns the headers an agent adds to a request: Signature, Signature-Input and (optionally) Signature-Agent. */
export async function signRequest(req: Omit<RequestLike, "headers">, opts: SignOptions): Promise<Record<string, string>> {
  const label = opts.label ?? "sig1";
  const created = opts.created ?? Math.floor(Date.now() / 1000);
  const expires = created + (opts.ttl ?? 60);
  const nonce = opts.nonce ?? bytesToB64url(crypto.getRandomValues(new Uint8Array(32)));
  const headers: Record<string, string> = {};
  const components: Component[] = [{ name: "@authority", params: {} }];
  if (opts.signatureAgent) {
    headers["signature-agent"] = `"${opts.signatureAgent}"`;
    components.push({ name: "signature-agent", params: {} });
  }
  const params =
    `(${components.map(componentId).join(" ")})` +
    `;created=${created};expires=${expires};keyid=${serializeBareItem({ type: "string", value: opts.keyid })}` +
    `;alg="ed25519";nonce=${serializeBareItem({ type: "string", value: nonce })};tag="${opts.tag ?? WEB_BOT_AUTH_TAG}"`;
  const base = signatureBase({ ...req, headers }, components, params);
  const key =
    "type" in opts.key && (opts.key as CryptoKey).type === "private"
      ? (opts.key as CryptoKey)
      : await crypto.subtle.importKey("jwk", opts.key as JsonWebKey, { name: "Ed25519" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, utf8(base)));
  headers["signature-input"] = `${label}=${params}`;
  headers["signature"] = `${label}=:${bytesToB64(sig)}:`;
  return headers;
}

/* ---------------------------- Verification ------------------------- */

export type VerifyFailure =
  | "malformed"
  | "no_signature_for_label"
  | "wrong_tag"
  | "unsupported_alg"
  | "authority_not_covered"
  | "signature_agent_not_covered"
  | "missing_component"
  | "unsupported_component"
  | "missing_created_or_expires"
  | "not_yet_valid"
  | "expired"
  | "validity_too_long"
  | "unknown_key"
  | "untrusted_directory"
  | "revoked_key"
  | "replay"
  | "bad_signature";

export class SignatureError extends Error {
  constructor(
    public code: VerifyFailure,
    message: string,
  ) {
    super(message);
  }
}

export interface ResolvedKey {
  jwk: Ed25519PublicJwk;
  /** Whether the directory that vouches for this key is trusted by the verifier. */
  trusted: boolean;
  revoked?: boolean;
  /** Registry metadata passed through to the result (e.g. agent id). */
  meta?: Record<string, unknown>;
}

export interface VerifyOptions {
  /** Resolve a key by id. `directory` is the Signature-Agent URL when the request sent one. */
  resolveKey: (keyid: string, directory: string | null) => Promise<ResolvedKey | null>;
  /** Returns false when the nonce was already used (replay). */
  checkNonce?: (keyid: string, nonce: string, expires: number) => Promise<boolean>;
  now?: number;
  clockSkewSec?: number;
  maxValiditySec?: number;
}

export type VerifyResult =
  | { status: "absent" }
  | { status: "invalid"; reason: VerifyFailure; detail: string; keyid?: string; directory?: string | null }
  | {
      status: "valid";
      keyid: string;
      directory: string | null;
      trusted: boolean;
      created: number;
      expires: number;
      nonce?: string;
      meta?: Record<string, unknown>;
    };

function str(v: BareItem | undefined) {
  return v && (v.type === "string" || v.type === "token") ? String(v.value) : undefined;
}
function int(v: BareItem | undefined) {
  return v && v.type === "integer" ? v.value : undefined;
}

/** Parse Signature-Agent: a string item, or a dictionary keyed by signature label. */
export function parseSignatureAgent(raw: string | null, label: string): string | null {
  if (!raw) return null;
  try {
    const item = parseItem(raw);
    if (item.value.type === "string") return item.value.value;
  } catch {
    /* not an item: try dictionary */
  }
  try {
    const m = parseDictionary(raw).get(label)?.member;
    if (m && !isInnerList(m) && m.value.type === "string") return m.value.value;
  } catch {
    /* fallthrough */
  }
  return null;
}

export async function verifyRequest(req: RequestLike, opts: VerifyOptions): Promise<VerifyResult> {
  const inputRaw = getHeader(req.headers, "signature-input");
  const sigRaw = getHeader(req.headers, "signature");
  if (!inputRaw && !sigRaw) return { status: "absent" };
  const fail = (reason: VerifyFailure, detail: string, extra: { keyid?: string; directory?: string | null } = {}): VerifyResult => ({
    status: "invalid",
    reason,
    detail,
    ...extra,
  });
  if (!inputRaw || !sigRaw) return fail("malformed", "Signature and Signature-Input must both be present");

  let inputs: ReturnType<typeof parseDictionary>, sigs: ReturnType<typeof parseDictionary>;
  try {
    inputs = parseDictionary(inputRaw);
    sigs = parseDictionary(sigRaw);
  } catch (e) {
    return fail("malformed", (e as Error).message);
  }

  // Prefer the web-bot-auth labelled signature; fall back to the first one.
  let label: string | undefined;
  for (const [k, v] of inputs) if (isInnerList(v.member) && str(v.member.params.tag) === WEB_BOT_AUTH_TAG) label = k;
  label ??= inputs.keys().next().value as string | undefined;
  const entry = label ? inputs.get(label) : undefined;
  if (!label || !entry || !isInnerList(entry.member)) return fail("malformed", "Signature-Input has no inner list");
  const sigEntry = sigs.get(label);
  if (!sigEntry || isInnerList(sigEntry.member) || sigEntry.member.value.type !== "bytes") return fail("no_signature_for_label", `no Signature for ${label}`);

  const list = entry.member as InnerList;
  const p = list.params;
  const keyid = str(p.keyid);
  const tag = str(p.tag);
  const alg = str(p.alg);
  const created = int(p.created);
  const expires = int(p.expires);
  const nonce = str(p.nonce);
  const directory = parseSignatureAgent(getHeader(req.headers, "signature-agent"), label);
  const ctx = { keyid, directory };

  if (!keyid) return fail("malformed", "keyid is required", ctx);
  if (tag !== WEB_BOT_AUTH_TAG) return fail("wrong_tag", `tag must be ${WEB_BOT_AUTH_TAG}`, ctx);
  if (alg && alg !== "ed25519") return fail("unsupported_alg", `alg ${alg} is not supported`, ctx);

  const components: Component[] = [];
  for (const it of list.items) {
    if (it.value.type !== "string") return fail("malformed", "component identifiers must be strings", ctx);
    components.push({ name: it.value.value.toLowerCase(), params: it.params });
  }
  if (!components.some((c) => c.name === "@authority")) return fail("authority_not_covered", "@authority must be signed", ctx);
  if (directory && !components.some((c) => c.name === "signature-agent"))
    return fail("signature_agent_not_covered", "signature-agent header must be signed when present", ctx);

  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const skew = opts.clockSkewSec ?? 30;
  if (created == null || expires == null) return fail("missing_created_or_expires", "created and expires are required", ctx);
  if (created > now + skew) return fail("not_yet_valid", "created is in the future", ctx);
  if (expires < now - skew) return fail("expired", "signature expired", ctx);
  if (expires - created > (opts.maxValiditySec ?? 3600)) return fail("validity_too_long", "signature validity window is too long", ctx);

  const resolved = await opts.resolveKey(keyid, directory);
  if (!resolved) return fail("unknown_key", "key not found in any directory", ctx);
  if (!resolved.trusted) return fail("untrusted_directory", "key is not vouched for by a trusted directory", ctx);
  if (resolved.revoked) return fail("revoked_key", "key has been revoked", ctx);

  let base: string;
  try {
    base = signatureBase(req, components, entry.raw);
  } catch (e) {
    if (e instanceof SignatureError) return fail(e.code, e.message, ctx);
    return fail("malformed", (e as Error).message, ctx);
  }

  let ok = false;
  try {
    const key = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: resolved.jwk.x }, { name: "Ed25519" }, false, ["verify"]);
    ok = await crypto.subtle.verify({ name: "Ed25519" }, key, b64ToBytes(sigEntry.member.value.value) as BufferSource, utf8(base) as BufferSource);
  } catch {
    ok = false;
  }
  if (!ok) return fail("bad_signature", "signature does not match", ctx);

  // Only burn the nonce once the signature is proven, so forged requests can't exhaust it.
  if (nonce && opts.checkNonce && !(await opts.checkNonce(keyid, nonce, expires))) return fail("replay", "nonce already used", ctx);

  return { status: "valid", keyid, directory, trusted: true, created, expires, nonce, meta: resolved.meta };
}
