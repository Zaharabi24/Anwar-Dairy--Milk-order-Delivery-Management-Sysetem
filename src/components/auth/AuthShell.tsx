import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import logoAsset from "@/assets/anwar-organic-logo.png.asset.json";

/** Centred auth card with the Anwar Organic logo above it. */
export function AuthShell({
  children,
  width = "narrow",
}: {
  children: ReactNode;
  width?: "narrow" | "wide";
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5 py-12">
      <Link to="/" className="mb-6 flex items-center gap-2">
        <img
          src={logoAsset.url}
          alt="Anwar Organic"
          width={56}
          height={56}
          className="h-14 w-auto"
        />
        <span className="font-display text-xl font-extrabold">Anwar Fresh</span>
      </Link>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={cn(
          "w-full rounded-xl border border-border bg-card p-6 sm:p-8",
          width === "wide" ? "max-w-[720px]" : "max-w-[440px]",
        )}
      >
        {children}
      </motion.div>
    </div>
  );
}

export function AuthHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function FieldError({ message }: { message?: string | null | undefined }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}
