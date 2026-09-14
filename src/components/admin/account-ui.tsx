// Small building blocks shared by the System Admin account console pages.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AuthResult } from "@/lib/auth-types";

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <th className={cn("px-4 py-3 font-medium", className)}>{children}</th>;
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-top", className)}>{children}</td>;
}

export function TableShell({
  children,
  minWidth = 900,
}: {
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

type Tone = "pending" | "success" | "danger" | "muted" | "info";

const toneClass: Record<Tone, string> = {
  pending: "",
  success: "border-transparent bg-primary text-primary-foreground",
  danger: "",
  muted: "border-border bg-muted text-muted-foreground",
  info: "border-transparent bg-info text-info-foreground",
};

const toneVariant: Record<Tone, "secondary" | "default" | "destructive" | "outline"> = {
  pending: "secondary",
  success: "default",
  danger: "destructive",
  muted: "outline",
  info: "default",
};

export function ToneBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <Badge
      variant={toneVariant[tone]}
      className={cn("whitespace-nowrap font-medium", toneClass[tone])}
    >
      {children}
    </Badge>
  );
}

export const humanize = (value: string) =>
  value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Loads an admin list through the auth service and exposes reload + error state. */
export function useAdminList<T>(load: () => Promise<AuthResult<T>>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await load();
    if (result.ok && result.data !== undefined) {
      setData(result.data);
      setError(null);
    } else {
      setError(result.message ?? "Couldn't load this list.");
    }
    setLoading(false);
  }, [load]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}

/** Working days (Mon–Fri) between two instants. */
export function workingDaysBetween(fromIso: string, to = new Date()): number {
  const start = new Date(fromIso);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  let days = 0;
  for (const d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days++;
  }
  return days;
}

export function downloadCsv(filename: string, rows: Array<Array<string | number | null>>) {
  const escape = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob([rows.map((r) => r.map(escape).join(",")).join("\n")], {
    type: "text/csv",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
