import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/page-header";
import { useAppData } from "@/context/app-data";
import { dateTime } from "@/lib/format";

export const Route = createFileRoute("/app/admin/audit-log")({
  head: () => ({
    meta: [
      { title: "Audit log — Anwar Fresh" },
      { name: "description", content: "Every change to batches, orders, payments and people." },
      { property: "og:title", content: "Audit log — Anwar Fresh" },
      { property: "og:description", content: "Every change to batches, orders, payments and people." },
    ],
  }),
  component: AuditLogPage,
});

function AuditLogPage() {
  const { auditLogs } = useAppData();
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return auditLogs;
    return auditLogs.filter(
      (l) =>
        l.user.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.record.toLowerCase().includes(q),
    );
  }, [auditLogs, query]);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title="Audit log" description="A permanent trail of who changed what, and when." />

      <Input
        className="max-w-sm"
        placeholder="Search user, action or record"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No entries match" hint="Try a different search." />
        </div>
      ) : (
        <ol className="mt-6 space-y-3 border-l border-border pl-6">
          {rows.map((l, i) => (
            <motion.li
              key={l.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3) }}
              className="relative rounded-xl border border-border bg-card p-4"
            >
              <span className="absolute -left-[31px] top-6 h-2.5 w-2.5 rounded-full bg-primary" />
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{l.action}</p>
                <p className="text-xs text-muted-foreground">{dateTime(l.timestamp)}</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {l.user} · {l.record}
              </p>
              <p className="mt-2 text-sm">
                <span className="text-muted-foreground line-through">{l.oldValue}</span>
                <span className="mx-2 text-muted-foreground">→</span>
                <span className="font-medium">{l.newValue}</span>
              </p>
            </motion.li>
          ))}
        </ol>
      )}
    </div>
  );
}
