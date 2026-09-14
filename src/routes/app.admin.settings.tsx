import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { useAppData } from "@/context/app-data";

export const Route = createFileRoute("/app/admin/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Anwar Fresh" },
      { name: "description", content: "Default rate, booking cutoff, caps and notification rules." },
      { property: "og:title", content: "Settings — Anwar Fresh" },
      { property: "og:description", content: "Default rate, booking cutoff, caps and notification rules." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { settings, saveSettings } = useAppData();
  const [rate, setRate] = useState(settings.ratePerLitre);
  const [cutoff, setCutoff] = useState(settings.bookingCutoff);
  const [cap, setCap] = useState(settings.employeeCap);
  const [minOrder, setMinOrder] = useState(settings.minOrder);
  const [window, setWindow] = useState(settings.deliveryWindow);
  const [emailAlerts, setEmailAlerts] = useState(settings.emailAlerts);
  const [smsAlerts, setSmsAlerts] = useState(settings.smsAlerts);
  const [autoClose, setAutoClose] = useState(settings.autoClose);
  const [terms, setTerms] = useState(settings.terms);

  async function save() {
    const saved = await saveSettings({
      ratePerLitre: rate,
      bookingCutoff: cutoff,
      employeeCap: cap,
      minOrder,
      deliveryWindow: window,
      emailAlerts,
      smsAlerts,
      autoClose,
      terms,
    });
    if (saved) toast.success("Settings saved");
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="Settings" description="Defaults applied to every new batch." />

      <div className="space-y-6">
        <Section title="Batch defaults" hint="Operators can override these per batch.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Rate per litre (৳)">
              <Input type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
            </Field>
            <Field label="Booking cutoff">
              <Input type="time" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
            </Field>
            <Field label="Per-employee cap (L)">
              <Input type="number" value={cap} onChange={(e) => setCap(Number(e.target.value))} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Minimum order (L)">
              <Input type="number" value={minOrder} onChange={(e) => setMinOrder(Number(e.target.value))} />
            </Field>
            <Field label="Default delivery window">
              <Input value={window} onChange={(e) => setWindow(e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Notifications" hint="How employees hear about the daily batch.">
          <Toggle
            label="Email employees when a batch is published"
            checked={emailAlerts}
            onChange={setEmailAlerts}
          />
          <Toggle label="Send SMS reminders before cutoff" checked={smsAlerts} onChange={setSmsAlerts} />
          <Toggle
            label="Close bookings automatically at cutoff"
            checked={autoClose}
            onChange={setAutoClose}
          />
        </Section>

        <Section title="Terms shown at checkout">
          <Textarea rows={4} value={terms} onChange={(e) => setTerms(e.target.value)} />
        </Section>

        <div className="flex justify-end">
          <Button onClick={save}>Save settings</Button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div>
        <h2 className="font-display text-lg font-bold">{title}</h2>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-lg border border-border p-3 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
