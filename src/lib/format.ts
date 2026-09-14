export const taka = (n: number) =>
  `৳${Math.round(n).toLocaleString("en-BD")}`;

export const litres = (n: number) => `${n} L`;

export const dateShort = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export const timeShort = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export const dateTime = (iso: string) => `${dateShort(iso)}, ${timeShort(iso)}`;

export function countdown(target: string) {
  const ms = new Date(target).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return { h, m, s, label: `${h}h ${m}m ${s.toString().padStart(2, "0")}s` };
}
