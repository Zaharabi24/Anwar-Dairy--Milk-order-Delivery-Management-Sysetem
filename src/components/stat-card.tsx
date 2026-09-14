import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

export function StatCard({
  label,
  value,
  format = (v: number) => v.toLocaleString("en-BD"),
  hint,
  emphasis,
}: {
  label: string;
  value: number;
  format?: (v: number) => string;
  hint?: string;
  emphasis?: boolean;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 1.1,
      ease: "easeOut",
      onUpdate: (v) => setShown(v),
    });
    return () => controls.stop();
  }, [value, reduce]);

  return (
    <div
      className={`rounded-xl border border-border p-5 ${
        emphasis ? "bg-primary text-primary-foreground" : "bg-card"
      }`}
    >
      <p className={`text-sm ${emphasis ? "opacity-80" : "text-muted-foreground"}`}>{label}</p>
      <p className="mt-2 font-display text-3xl font-extrabold">{format(Math.round(shown))}</p>
      {hint ? (
        <p className={`mt-1 text-xs ${emphasis ? "opacity-80" : "text-muted-foreground"}`}>{hint}</p>
      ) : null}
    </div>
  );
}
