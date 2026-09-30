/**
 * Traffic attribution: where a session came from (source / medium / campaign) and
 * which channel that belongs to. Runtime-agnostic and pure, so the SDK's raw
 * signals are classified the same way everywhere.
 *
 * Channels follow the widely used default channel grouping (GA4-style), plus an
 * "AI assistants" channel for people who arrive from ChatGPT, Perplexity, Claude,
 * Gemini, Copilot and similar: the human side of agentic discovery.
 */

export const CHANNELS = [
  "AI assistants",
  "Organic search",
  "Paid search",
  "Organic social",
  "Paid social",
  "Email",
  "Display",
  "Affiliates",
  "Paid other",
  "Referral",
  "Direct",
  "Unassigned",
] as const;
export type Channel = (typeof CHANNELS)[number];

/** Raw signals the SDK collects once per session. */
export interface SourceSignals {
  /** Referrer as host + path (no query string); empty for none or same-site. */
  ref?: string;
  /** Landing page path. */
  land?: string;
  utm?: { source?: string; medium?: string; campaign?: string; term?: string; content?: string };
  /** Name of an ad click id present on the landing URL (gclid, fbclid, …); the value is never collected. */
  clid?: string;
}

export interface Attribution {
  channel: Channel;
  source: string;
  medium: string;
  campaign: string | null;
  /** Referrer host + path, when there was one. */
  referrer: string | null;
  landing: string | null;
}

/* Known sources (matched on the registrable-ish host, without "www."). */

const AI = ["chatgpt.com", "chat.openai.com", "openai.com", "perplexity.ai", "claude.ai", "gemini.google.com", "bard.google.com", "copilot.microsoft.com", "copilot.cloud.microsoft", "you.com", "phind.com", "poe.com", "meta.ai", "grok.com", "x.ai", "chat.deepseek.com", "deepseek.com", "chat.mistral.ai", "kagi.com/assistant", "character.ai", "pi.ai"];
const SEARCH = ["google", "bing.com", "duckduckgo.com", "search.yahoo.com", "yahoo.com", "baidu.com", "yandex", "ecosia.org", "search.brave.com", "startpage.com", "qwant.com", "naver.com", "seznam.cz", "kagi.com", "sogou.com", "so.com", "ask.com", "aol.com"];
const SOCIAL = ["facebook.com", "fb.com", "m.facebook.com", "l.facebook.com", "lm.facebook.com", "instagram.com", "l.instagram.com", "linkedin.com", "lnkd.in", "twitter.com", "x.com", "t.co", "reddit.com", "old.reddit.com", "youtube.com", "youtu.be", "m.youtube.com", "tiktok.com", "pinterest.com", "threads.net", "snapchat.com", "quora.com", "tumblr.com", "mastodon.social", "bsky.app", "news.ycombinator.com", "producthunt.com", "discord.com", "telegram.org", "t.me", "whatsapp.com", "wa.me", "vk.com", "weibo.com", "medium.com", "substack.com"];
const MAIL = ["mail.google.com", "outlook.live.com", "outlook.office.com", "outlook.office365.com", "mail.yahoo.com", "mail.proton.me", "mail.aol.com", "mail.zoho.com", "fastmail.com", "icloud.com"];

/** Friendly names for common hosts, so reports say "google" rather than "google.co.uk". */
const ALIASES: [RegExp, string][] = [
  // Specific Google properties first: gemini.google.com and mail.google.com aren't Google search.
  [/^mail\.google\.com$/, "gmail"],
  [/^(chat\.openai\.com|chatgpt\.com|openai\.com)$/, "chatgpt"],
  [/(^|\.)perplexity\.ai$/, "perplexity"],
  [/^claude\.ai$/, "claude"],
  [/^(gemini|bard)\.google\.com$/, "gemini"],
  [/^copilot\./, "copilot"],
  [/(^|\.)google\.[a-z.]+$/, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
  [/(^|\.)yahoo\.com$/, "yahoo"],
  [/(^|\.)yandex\.[a-z.]+$/, "yandex"],
  [/^(t\.co|twitter\.com|x\.com)$/, "x"],
  [/(^|\.)facebook\.com$|^fb\.com$/, "facebook"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/^(linkedin\.com|lnkd\.in)$/, "linkedin"],
  [/(^|\.)reddit\.com$/, "reddit"],
  [/^(youtube\.com|m\.youtube\.com|youtu\.be)$/, "youtube"],
  [/^news\.ycombinator\.com$/, "hacker news"],
];

const PAID_CLICK_IDS: Record<string, "search" | "social" | "display"> = {
  gclid: "search",
  gbraid: "search",
  wbraid: "search",
  msclkid: "search",
  dclid: "display",
  fbclid: "social", // also added to organic Facebook links; only counts as paid with a paid medium
  ttclid: "social",
  li_fat_id: "social",
  twclid: "social",
  scclid: "social",
  epik: "social",
};
export const CLICK_ID_PARAMS = Object.keys(PAID_CLICK_IDS);

const clean = (s: string | undefined, max = 100) => (s ?? "").trim().toLowerCase().slice(0, max);

export function hostOf(ref: string | undefined) {
  if (!ref) return "";
  const h = ref.replace(/^[a-z]+:\/\//i, "").split(/[/?#]/)[0].toLowerCase();
  return h.replace(/^www\./, "").replace(/:\d+$/, "");
}

const matches = (hostOrSource: string, list: string[], ref = "") =>
  list.some((d) => (d.includes("/") ? ref.includes(d) : hostOrSource === d || hostOrSource.endsWith("." + d)));

export function friendlySource(host: string) {
  for (const [re, name] of ALIASES) if (re.test(host)) return name;
  return host;
}

const isAi = (s: string, ref: string) => matches(s, AI, ref) || ["chatgpt", "perplexity", "claude", "gemini", "copilot", "openai", "deepseek", "mistral", "grok", "meta ai", "you.com", "phind", "poe"].includes(s);
const isSearch = (s: string) => matches(s, SEARCH) || /(^|\.)(google|yandex)\.[a-z.]+$/.test(s) || ["google", "bing", "duckduckgo", "yahoo", "yandex", "baidu", "ecosia", "brave", "startpage", "qwant", "naver", "seznam", "kagi", "sogou"].includes(s);
const isSocial = (s: string) => matches(s, SOCIAL) || ["x", "facebook", "instagram", "linkedin", "reddit", "youtube", "tiktok", "pinterest", "threads", "snapchat", "quora", "tumblr", "mastodon", "bluesky", "hacker news", "producthunt", "discord", "telegram", "whatsapp", "vk", "weibo", "medium", "substack", "twitter", "ig", "fb", "li", "yt"].includes(s);
const isMail = (s: string) => matches(s, MAIL) || s === "gmail";

const PAID_MEDIUM = /^(.*cp.*|ppc|retargeting|paid.*)$/;

/** Classify one session's raw signals into source / medium / campaign / channel. */
export function attribute(sig: SourceSignals | null | undefined): Attribution {
  const utm = sig?.utm ?? {};
  const refHost = hostOf(sig?.ref);
  const refFull = clean(sig?.ref, 300);
  const uSource = clean(utm.source);
  const uMedium = clean(utm.medium);
  const campaign = clean(utm.campaign) || null;
  const clid = sig?.clid && PAID_CLICK_IDS[sig.clid] ? sig.clid : undefined;
  const referrer = refFull || null;
  const landing = sig?.land ? sig.land.slice(0, 300) : null;

  const source = uSource || (refHost ? friendlySource(refHost) : clid ? clickIdSource(clid) : "(direct)");
  const s = uSource ? friendlySource(uSource) : source;
  const probe = uSource || refHost;
  const either = (f: (x: string) => boolean) => f(probe) || f(s);
  let medium = uMedium;
  let channel: Channel;

  if (either((x) => isAi(x, refFull)) || uMedium === "ai" || uMedium === "llm") {
    channel = "AI assistants";
    medium ||= "ai";
  } else if (uMedium && PAID_MEDIUM.test(uMedium)) {
    channel = either(isSearch) ? "Paid search" : either(isSocial) ? "Paid social" : "Paid other";
  } else if (!uMedium && clid && PAID_CLICK_IDS[clid] === "search") {
    channel = "Paid search";
    medium = "cpc";
  } else if (!uMedium && clid && clid !== "fbclid" && PAID_CLICK_IDS[clid] === "social") {
    channel = "Paid social";
    medium = "paid";
  } else if (!uMedium && clid === "dclid") {
    channel = "Display";
    medium = "display";
  } else if (["display", "banner", "expandable", "interstitial", "cpm"].includes(uMedium)) {
    channel = "Display";
  } else if (uMedium === "affiliate" || uMedium === "affiliates") {
    channel = "Affiliates";
  } else if (["email", "e-mail", "e_mail", "e mail", "newsletter"].includes(uMedium) || ["email", "e-mail", "newsletter"].includes(uSource) || (!uMedium && either(isMail))) {
    channel = "Email";
    medium ||= "email";
  } else if (uMedium === "organic" || (!uMedium && either(isSearch))) {
    channel = "Organic search";
    medium ||= "organic";
  } else if (["social", "social-network", "social-media", "sm", "social network", "social media"].includes(uMedium) || (!uMedium && either(isSocial))) {
    channel = "Organic social";
    medium ||= "social";
  } else if (uMedium === "referral" || (!uMedium && !uSource && refHost)) {
    channel = "Referral";
    medium ||= "referral";
  } else if (!uSource && !uMedium && !refHost && !campaign) {
    channel = "Direct";
    medium = "(none)";
  } else {
    channel = "Unassigned";
    medium ||= "(not set)";
  }

  return { channel, source: s, medium, campaign, referrer, landing };
}

function clickIdSource(clid: string) {
  if (["gclid", "gbraid", "wbraid", "dclid"].includes(clid)) return "google";
  if (clid === "msclkid") return "bing";
  if (clid === "fbclid") return "facebook";
  if (clid === "ttclid") return "tiktok";
  if (clid === "li_fat_id") return "linkedin";
  if (clid === "twclid") return "x";
  if (clid === "scclid") return "snapchat";
  if (clid === "epik") return "pinterest";
  return "(direct)";
}

/** First touch, as remembered per browser (channel-level only; no identifiers). */
export interface Touch {
  channel: Channel;
  source: string;
  medium: string;
  campaign: string | null;
}

export const touchOf = (a: Attribution): Touch => ({ channel: a.channel, source: a.source, medium: a.medium, campaign: a.campaign });
