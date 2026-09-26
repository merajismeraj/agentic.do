import clsx, { type ClassValue } from "clsx";

export const cn = (...v: ClassValue[]) => clsx(v);

export const uid = () => Math.random().toString(36).slice(2, 10);

export function ago(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function clock(minute: number) {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
