import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldRow, SwitchField } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { useAppData } from "@/context/app-data";

export const Route = createFileRoute("/app/admin/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Anwar Organic" },
      {
        name: "description",
        content: "Default rate, booking cutoff, caps and notification rules.",
      },
      { property: "og:title", content: "Settings — Anwar Organic" },
      {
        property: "og:description",
        content: "Default rate, booking cutoff, caps and notification rules.",
      },
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
          <FieldRow columns={3}>
            <Field label="Rate per litre (৳)" htmlFor="settings-rate">
              <Input
                id="settings-rate"
                type="number"
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
              />
            </Field>
            <Field label="Booking cutoff" htmlFor="settings-cutoff">
              <Input
                id="settings-cutoff"
                type="time"
                value={cutoff}
                onChange={(e) => setCutoff(e.target.value)}
              />
            </Field>
            <Field label="Per-employee cap (L)" htmlFor="settings-cap">
              <Input
                id="settings-cap"
                type="number"
                value={cap}
                onChange={(e) => setCap(Number(e.target.value))}
              />
            </Field>
          </FieldRow>
          <FieldRow columns={2}>
            <Field label="Minimum order (L)" htmlFor="settings-min">
              <Input
                id="settings-min"
                type="number"
                value={minOrder}
                onChange={(e) => setMinOrder(Number(e.target.value))}
              />
            </Field>
            <Field label="Default delivery window" htmlFor="settings-window">
              <Input
                id="settings-window"
                value={window}
                onChange={(e) => setWindow(e.target.value)}
              />
            </Field>
          </FieldRow>
        </Section>

        <Section title="Notifications" hint="How employees hear about the daily batch.">
          <Toggle
            id="alerts-email"
            label="Email employees when a batch is published"
            checked={emailAlerts}
            onChange={setEmailAlerts}
          />
          <Toggle
            id="alerts-sms"
            label="Send SMS reminders before cutoff"
            checked={smsAlerts}
            onChange={setSmsAlerts}
          />
          <Toggle
            id="alerts-auto-close"
            label="Close bookings automatically at cutoff"
            checked={autoClose}
            onChange={setAutoClose}
          />
        </Section>

        <Section title="Terms shown at checkout">
          <Textarea
            rows={4}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            aria-label="Terms shown at checkout"
          />
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

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <SwitchField label={label} htmlFor={id}>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </SwitchField>
  );
}
