/**
 * Events the browser SDK sends. Deliberately content-free: no keystroke values,
 * no form contents, no text — only timings, positions and counts.
 */
export type AaEvent =
  /** Page view: words on the page and viewport size. */
  | { t: "pv"; ts: number; path: string; words: number; vw: number; vh: number }
  /** Pointer position sample (mouse/pen only). */
  | { t: "mv"; ts: number; x: number; y: number }
  /**
   * Click. moved = pointer travelled to the target in the preceding 1.5s; hov = pointer
   * entered the target before clicking; vis = target was in the viewport; tr = isTrusted;
   * d = distance travelled in the approach; w = target width; mt = approach movement time.
   */
  | { t: "ck"; ts: number; x: number; y: number; pt: string; moved: boolean; hov: boolean; vis: boolean; tr: boolean; d: number; w: number; mt: number }
  | { t: "sc"; ts: number; y: number }
  /** Keydown timing only (never the key). */
  | { t: "kd"; ts: number }
  /** Input value changed; kd = a keydown/paste preceded it (false = programmatic fill or autofill). */
  | { t: "in"; ts: number; kd: boolean }
  | { t: "vis"; ts: number; hidden: boolean }
  | { t: "lv"; ts: number }
  | { t: "task"; ts: number; name: string; state: "start" | "complete" | "fail" }
  | { t: "env"; ts: number; wd: boolean; hl: boolean; touch: boolean };

export interface CollectBatch {
  site: string;
  sid: string;
  seq: number;
  vt?: string;
  ua?: string;
  events: AaEvent[];
}

export const MAX_BATCH_EVENTS = 1500;
export const MAX_BATCH_BYTES = 128 * 1024;
