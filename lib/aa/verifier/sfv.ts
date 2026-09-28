// Minimal RFC 8941 Structured Field parser — enough for Signature-Input, Signature and Signature-Agent.

export type BareItem =
  | { type: "string"; value: string }
  | { type: "token"; value: string }
  | { type: "integer"; value: number }
  | { type: "bytes"; value: string } // base64 text, undecoded
  | { type: "boolean"; value: boolean };

export interface Item {
  value: BareItem;
  params: Record<string, BareItem>;
}

export interface InnerList {
  items: Item[];
  params: Record<string, BareItem>;
}

export interface DictMember {
  /** Parsed value: an inner list or an item. */
  member: InnerList | Item;
  /** Raw serialized text of the member value (after `key=`), used for @signature-params. */
  raw: string;
}

class Cursor {
  i = 0;
  constructor(readonly s: string) {}
  peek() {
    return this.s[this.i];
  }
  eof() {
    return this.i >= this.s.length;
  }
  skipSP() {
    while (this.s[this.i] === " ") this.i++;
  }
  skipOWS() {
    while (this.s[this.i] === " " || this.s[this.i] === "\t") this.i++;
  }
  fail(msg: string): never {
    throw new Error(`structured field parse error at ${this.i}: ${msg}`);
  }
}

function parseKey(c: Cursor): string {
  const m = /^[a-z*][a-z0-9_\-.*]*/.exec(c.s.slice(c.i));
  if (!m) c.fail("expected key");
  c.i += m[0].length;
  return m[0];
}

function parseBareItem(c: Cursor): BareItem {
  const ch = c.peek();
  if (ch === '"') {
    c.i++;
    let out = "";
    while (!c.eof()) {
      const x = c.s[c.i++];
      if (x === "\\") {
        const n = c.s[c.i++];
        if (n !== '"' && n !== "\\") c.fail("bad escape");
        out += n;
      } else if (x === '"') {
        return { type: "string", value: out };
      } else out += x;
    }
    c.fail("unterminated string");
  }
  if (ch === ":") {
    c.i++;
    const end = c.s.indexOf(":", c.i);
    if (end < 0) c.fail("unterminated byte sequence");
    const v = c.s.slice(c.i, end);
    c.i = end + 1;
    return { type: "bytes", value: v };
  }
  if (ch === "?") {
    c.i++;
    const v = c.s[c.i++];
    if (v !== "0" && v !== "1") c.fail("bad boolean");
    return { type: "boolean", value: v === "1" };
  }
  if (ch === "-" || (ch >= "0" && ch <= "9")) {
    const m = /^-?\d{1,15}/.exec(c.s.slice(c.i));
    if (!m) c.fail("bad integer");
    c.i += m[0].length;
    return { type: "integer", value: Number(m[0]) };
  }
  const m = /^[A-Za-z*][A-Za-z0-9!#$%&'*+\-.^_`|~:/]*/.exec(c.s.slice(c.i));
  if (!m) c.fail("expected bare item");
  c.i += m[0].length;
  return { type: "token", value: m[0] };
}

function parseParams(c: Cursor): Record<string, BareItem> {
  const params: Record<string, BareItem> = {};
  while (c.peek() === ";") {
    c.i++;
    c.skipSP();
    const k = parseKey(c);
    let v: BareItem = { type: "boolean", value: true };
    if (c.peek() === "=") {
      c.i++;
      v = parseBareItem(c);
    }
    params[k] = v;
  }
  return params;
}

function parseItemOrInnerList(c: Cursor): InnerList | Item {
  if (c.peek() === "(") {
    c.i++;
    const items: Item[] = [];
    for (;;) {
      c.skipSP();
      if (c.peek() === ")") {
        c.i++;
        return { items, params: parseParams(c) };
      }
      const value = parseBareItem(c);
      items.push({ value, params: parseParams(c) });
      if (c.peek() !== " " && c.peek() !== ")") c.fail("expected space or ) in inner list");
    }
  }
  const value = parseBareItem(c);
  return { value, params: parseParams(c) };
}

export function parseDictionary(s: string): Map<string, DictMember> {
  const c = new Cursor(s.trim());
  const out = new Map<string, DictMember>();
  while (!c.eof()) {
    const key = parseKey(c);
    let member: InnerList | Item;
    const start = c.i + 1;
    if (c.peek() === "=") {
      c.i++;
      member = parseItemOrInnerList(c);
    } else {
      member = { value: { type: "boolean", value: true }, params: parseParams(c) };
    }
    out.set(key, { member, raw: c.s.slice(start, c.i) });
    c.skipOWS();
    if (c.eof()) break;
    if (c.peek() !== ",") c.fail("expected comma");
    c.i++;
    c.skipOWS();
  }
  return out;
}

export function parseItem(s: string): Item {
  const c = new Cursor(s.trim());
  const m = parseItemOrInnerList(c);
  if (isInnerList(m)) c.fail("expected item, got inner list");
  return m as Item;
}

export function isInnerList(m: InnerList | Item): m is InnerList {
  return "items" in m;
}

/** Serialize a bare item back to its RFC 8941 text form. */
export function serializeBareItem(v: BareItem): string {
  switch (v.type) {
    case "string":
      return `"${v.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    case "bytes":
      return `:${v.value}:`;
    case "boolean":
      return v.value ? "?1" : "?0";
    default:
      return String(v.value);
  }
}

export function serializeParams(p: Record<string, BareItem>): string {
  return Object.entries(p)
    .map(([k, v]) => (v.type === "boolean" && v.value ? `;${k}` : `;${k}=${serializeBareItem(v)}`))
    .join("");
}
