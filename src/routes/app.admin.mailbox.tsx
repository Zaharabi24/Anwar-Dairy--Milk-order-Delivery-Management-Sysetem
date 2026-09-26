import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2, Mail, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { FILTER_SEARCH } from "@/components/ui/control-styles";
import { useAppData } from "@/context/app-data";
import {
  countAllRecipientsFn,
  listCampaignRecipientsFn,
  listCampaignsFn,
  previewCampaignFn,
  resendFailedMailFn,
  resumeCampaignFn,
  sendCampaignFn,
} from "@/functions/mailbox.functions";
import { listPublishedBatchNumbersFn } from "@/functions/records.functions";
import {
  EMPTY_PERIOD,
  periodLabel,
  periodMatches,
  yearsIn,
  type PeriodFilter,
} from "@/lib/date-filter";
import { PeriodFilterFields } from "@/components/period-filter";
import { Field, FilterBar } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dateShort, timeShort } from "@/lib/format";
import type {
  CampaignRecipient,
  CampaignStatus,
  CampaignSummary,
  MailboxAudience,
  RecipientStatus,
} from "@/lib/mailbox-types";
import type { Employee } from "@/lib/types";

export const Route = createFileRoute("/app/admin/mailbox")({
  head: () => ({
    meta: [
      { title: "Mailbox — Anwar Organic" },
      {
        name: "description",
        content:
          "Write to the Employee Database: everyone, or the people you choose, on the official template.",
      },
      { property: "og:title", content: "Mailbox — Anwar Organic" },
      {
        property: "og:description",
        content: "Compose, preview and send email to employees, with a record of every send.",
      },
    ],
  }),
  // The loader runs before the shell can decide whether this role may be here, so a coordinator
  // who types the address would otherwise get a 500 from the permission check rather than the
  // "not available for your role" screen every other page shows them. The permission still holds
  // -- nothing is returned -- it just fails as an empty page instead of as an error.
  loader: async () => {
    try {
      return {
        campaigns: await listCampaignsFn(),
        allRecipients: await countAllRecipientsFn(),
        batches: await listPublishedBatchNumbersFn(),
      };
    } catch {
      return {
        campaigns: [] as CampaignSummary[],
        allRecipients: { total: 0 },
        batches: [] as string[],
      };
    }
  },
  component: Mailbox,
});

const STATUS_LABEL: Record<CampaignStatus, string> = {
  sending: "Sending",
  sent: "All sent",
  partial: "Partly sent",
  failed: "Send failed",
  no_recipients: "No recipients",
};

const STATUS_TONE: Record<CampaignStatus, string> = {
  sending: "bg-secondary text-muted-foreground",
  sent: "bg-primary/10 text-primary-deep",
  partial: "bg-accent/15 text-accent-foreground",
  failed: "bg-destructive/10 text-destructive",
  no_recipients: "bg-secondary text-muted-foreground",
};

const RECIPIENT_LABEL: Record<RecipientStatus, string> = {
  queued: "Queued",
  sending: "Sending",
  sent: "Sent",
  captured: "Captured locally",
  failed: "Failed",
  logged: "Logged only",
  skipped: "No address",
};

/** Typing this is what unlocks a send to the whole directory. */
const CONFIRM_WORD = "SEND";

function Mailbox() {
  const initial = Route.useLoaderData();
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Mailbox"
        description="Write to the Employee Database on the official Anwar Organic template — everyone, or just the people you choose."
      />
      <Tabs defaultValue="compose">
        <TabsList>
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="history">Email history</TabsTrigger>
        </TabsList>
        <TabsContent value="compose" className="mt-6">
          <Compose allRecipients={initial.allRecipients.total} />
        </TabsContent>
        <TabsContent value="history" className="mt-6">
          <History initial={initial.campaigns} batches={initial.batches} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compose

function Compose({ allRecipients }: { allRecipients: number }) {
  const { employees } = useAppData();
  const [audience, setAudience] = useState<MailboxAudience>("selected");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmWord, setConfirmWord] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ recipients: number; durable: boolean } | null>(null);

  // Only people who can actually be written to. Someone switched off, or with no address on file,
  // is not a recipient, and offering them as one would promise a delivery that can't happen.
  const reachable = useMemo(
    () => employees.filter((e) => e.active && e.companyEmail.trim()),
    [employees],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return reachable;
    return reachable.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.companyEmail.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q) ||
        e.designation.toLowerCase().includes(q),
    );
  }, [reachable, query]);

  const recipientCount = audience === "all" ? allRecipients : chosen.size;
  const canSend = subject.trim().length > 0 && body.trim().length > 0 && recipientCount > 0;

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const openPreview = useCallback(async () => {
    try {
      const { html } = await previewCampaignFn({
        data: { subject: subject.trim() || "(no subject)", body, sampleName: "Employee name" },
      });
      setPreviewHtml(html);
    } catch {
      toast.error("Couldn't build the preview.");
    }
  }, [subject, body]);

  async function send() {
    setSending(true);
    try {
      const result = await sendCampaignFn({
        data: {
          subject: subject.trim(),
          body: body.trim(),
          audience,
          employeeIds: audience === "selected" ? [...chosen] : [],
        },
      });
      setConfirming(false);
      setConfirmWord("");
      setSent({ recipients: result.recipients, durable: result.durable });
      setSubject("");
      setBody("");
      setChosen(new Set());
      setAudience("selected");
      toast.success(`Queued for ${result.recipients} recipients.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The email couldn't be sent.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Check className="size-6" />
        </div>
        <h2 className="mt-4 font-display text-xl font-bold">On its way</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {sent.recipients} {sent.recipients === 1 ? "message is" : "messages are"} queued. They go
          out at the rate the mail server accepts, so a message to everyone takes about a quarter of
          an hour. Email history shows how far it has got.
          {sent.durable ? "" : " Redis isn't configured, so a restart will pause the send."}
        </p>
        <Button className="mt-6" onClick={() => setSent(null)}>
          Write another
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <section className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-bold">Message</h2>
          <Field label="Subject" htmlFor="mail-subject" required>
            <Input
              id="mail-subject"
              value={subject}
              maxLength={200}
              placeholder="e.g. Milk collection moves to the ground floor"
              onChange={(e) => setSubject(e.target.value)}
            />
          </Field>
          <Field
            label="Message"
            htmlFor="mail-body"
            required
            hint="Plain text. Leave a blank line between paragraphs. It is sent on the official Anwar Organic template, addressed to each person by name."
          >
            <Textarea
              id="mail-body"
              rows={12}
              value={body}
              maxLength={20_000}
              placeholder={
                "Write your message here.\n\nLeave a blank line to start a new paragraph."
              }
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => void openPreview()} disabled={!body.trim()}>
              <Mail className="size-4" />
              Preview
            </Button>
            <p className="text-xs text-muted-foreground">
              See it exactly as a recipient will before anything is sent.
            </p>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-border bg-card p-6">
          <div>
            <h2 className="font-display text-lg font-bold">Recipients</h2>
            <p className="text-sm text-muted-foreground">
              Only employees who are active and have an address on file can be written to.
            </p>
          </div>

          {/* The two audiences are a deliberate choice, not a checkbox that happens to be ticked:
              "everyone" and "these people" are different acts and are chosen as such. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <AudienceCard
              chosen={audience === "selected"}
              onChoose={() => setAudience("selected")}
              title="Selected employees"
              detail="Search the directory and pick who this goes to."
              count={chosen.size}
            />
            <AudienceCard
              chosen={audience === "all"}
              onChoose={() => setAudience("all")}
              title="All employees"
              detail="Everyone active in the Employee Database."
              count={allRecipients}
              emphatic
            />
          </div>

          {audience === "selected" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  className={FILTER_SEARCH}
                  placeholder="Search name, ID, email, department"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChosen(new Set(matches.map((e) => e.id)))}
                  disabled={matches.length === 0}
                >
                  Select all {query.trim() ? "matching" : ""} ({matches.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChosen(new Set())}
                  disabled={chosen.size === 0}
                >
                  Clear
                </Button>
              </div>

              <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
                {matches.length === 0 ? (
                  <div className="p-6">
                    <EmptyState title="Nobody matches" hint="Try a different search." />
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {matches.slice(0, 400).map((e) => (
                      <PersonRow
                        key={e.id}
                        person={e}
                        checked={chosen.has(e.id)}
                        onToggle={() => toggle(e.id)}
                      />
                    ))}
                  </ul>
                )}
              </div>
              {matches.length > 400 ? (
                <p className="text-xs text-muted-foreground">
                  Showing the first 400 of {matches.length}. Narrow the search to reach the rest —
                  &quot;Select all matching&quot; still takes every one of them.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-accent/40 bg-accent/10 p-4">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-accent-foreground" />
              <div className="text-sm">
                <p className="font-medium">This goes to every active employee.</p>
                <p className="mt-1 text-muted-foreground">
                  {allRecipients} people will receive it. You will be asked to type{" "}
                  <span className="font-mono font-semibold">{CONFIRM_WORD}</span> before it is sent.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* The summary follows you down the page, so the recipient count is in view at the moment
          you press send rather than scrolled off above it. */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-bold">Before you send</h2>
          <div className="rounded-lg bg-secondary p-4 text-center">
            <p className="font-display text-3xl font-extrabold">{recipientCount}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {recipientCount === 1 ? "recipient" : "recipients"}
            </p>
          </div>
          <ul className="space-y-2 text-sm">
            <Ready done={subject.trim().length > 0}>Subject written</Ready>
            <Ready done={body.trim().length > 0}>Message written</Ready>
            <Ready done={recipientCount > 0}>
              {audience === "all" ? "Everyone in the directory" : "Recipients chosen"}
            </Ready>
          </ul>
          <Button className="w-full" disabled={!canSend} onClick={() => setConfirming(true)}>
            Send email
          </Button>
          <p className="text-xs text-muted-foreground">
            Nothing is sent until you confirm on the next step.
          </p>
        </div>
      </aside>

      <PreviewDialog html={previewHtml} onClose={() => setPreviewHtml(null)} />

      <ConfirmDialog
        open={confirming}
        audience={audience}
        count={recipientCount}
        subject={subject}
        confirmWord={confirmWord}
        onConfirmWord={setConfirmWord}
        sending={sending}
        recipients={audience === "selected" ? reachable.filter((e) => chosen.has(e.id)) : []}
        onCancel={() => {
          setConfirming(false);
          setConfirmWord("");
        }}
        onSend={() => void send()}
      />
    </div>
  );
}

function AudienceCard({
  chosen,
  onChoose,
  title,
  detail,
  count,
  emphatic,
}: {
  chosen: boolean;
  onChoose: () => void;
  title: string;
  detail: string;
  count: number;
  emphatic?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      aria-pressed={chosen}
      className={`rounded-lg border p-4 text-left transition-colors ${
        chosen
          ? emphatic
            ? "border-accent bg-accent/10"
            : "border-primary bg-primary/5"
          : "border-border hover:bg-secondary"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{title}</span>
        <span className="flex items-center gap-1 text-sm text-muted-foreground">
          <Users className="size-4" />
          {count}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </button>
  );
}

function PersonRow({
  person,
  checked,
  onToggle,
}: {
  person: Employee;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary">
        <Checkbox checked={checked} onCheckedChange={onToggle} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{person.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {person.id} · {person.companyEmail}
          </span>
        </span>
        <span className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
          <span className="block">{person.department || "—"}</span>
          <span className="block">{person.designation || "—"}</span>
        </span>
      </label>
    </li>
  );
}

function Ready({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded-full ${
          done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {done ? <Check className="size-3" /> : null}
      </span>
      <span className={done ? "" : "text-muted-foreground"}>{children}</span>
    </li>
  );
}

/** The message in an iframe, so the page's own styles can't make it look like something it isn't. */
function PreviewDialog({ html, onClose }: { html: string | null; onClose: () => void }) {
  return (
    <Dialog open={!!html} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Preview</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This is the email as a recipient receives it. Each person is greeted by their own name.
        </p>
        <iframe
          title="Email preview"
          sandbox=""
          srcDoc={html ?? ""}
          className="h-[28rem] w-full rounded-lg border border-border bg-white"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDialog({
  open,
  audience,
  count,
  subject,
  confirmWord,
  onConfirmWord,
  sending,
  recipients,
  onCancel,
  onSend,
}: {
  open: boolean;
  audience: MailboxAudience;
  count: number;
  subject: string;
  confirmWord: string;
  onConfirmWord: (v: string) => void;
  sending: boolean;
  recipients: Employee[];
  onCancel: () => void;
  onSend: () => void;
}) {
  const toAll = audience === "all";
  // Sending to the whole company is the one action here that can't be taken back, so it asks for
  // something a misplaced click cannot produce.
  const unlocked = !toAll || confirmWord.trim().toUpperCase() === CONFIRM_WORD;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            You are about to send this email to {count} {count === 1 ? "employee" : "employees"}.
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Subject</p>
            <p className="mt-0.5 font-medium">{subject}</p>
          </div>

          {toAll ? (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div>
                <p className="font-medium text-destructive">This reaches the whole company.</p>
                <p className="mt-1 text-muted-foreground">
                  Every active employee in the Employee Database receives it. It cannot be recalled
                  once it starts going out.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-2 text-xs text-muted-foreground">Going to</p>
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-3">
                {recipients.map((r) => (
                  <li key={r.id} className="truncate">
                    {r.name}{" "}
                    <span className="text-muted-foreground">
                      · {r.id} · {r.companyEmail}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {toAll ? (
            <Field
              label={`Type ${CONFIRM_WORD} to confirm`}
              htmlFor="confirm-word"
              hint="A deliberate step, so this can't happen by accident."
            >
              <Input
                id="confirm-word"
                value={confirmWord}
                autoComplete="off"
                placeholder={CONFIRM_WORD}
                onChange={(e) => onConfirmWord(e.target.value)}
              />
            </Field>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={onSend} disabled={!unlocked || sending}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : null}
            {sending ? "Sending…" : `Send to ${count}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// History

function History({ initial, batches }: { initial: CampaignSummary[]; batches: string[] }) {
  const [campaigns, setCampaigns] = useState(initial);
  const [open, setOpen] = useState<CampaignSummary | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipient[] | null>(null);
  const [busy, setBusy] = useState(false);

  const [period, setPeriod] = useState<PeriodFilter>(EMPTY_PERIOD);
  const [batchNo, setBatchNo] = useState("all");
  const [status, setStatus] = useState("all");

  const years = useMemo(() => yearsIn(campaigns.map((c) => c.createdAt)), [campaigns]);

  // Filtered here rather than in a query: the history is the last two hundred messages, already
  // loaded, so narrowing it is a matter of reading what is on the client.
  const shown = useMemo(
    () =>
      campaigns
        .filter((c) => periodMatches(period, c.createdAt))
        .filter((c) => (status === "all" ? true : c.status === status))
        .filter((c) => {
          if (batchNo === "all") return true;
          // A composed email has no batch of its own -- it is written by hand, not raised by a
          // publish -- so what ties one to a batch is the batch it talks about. Matched against
          // the subject and the body, which is where a batch number is written.
          const needle = batchNo.toLowerCase();
          return c.subject.toLowerCase().includes(needle) || c.body.toLowerCase().includes(needle);
        }),
    [campaigns, period, status, batchNo],
  );

  const totalSent = shown.reduce((n, c) => n + c.sentCount, 0);
  const totalFailed = shown.reduce((n, c) => n + c.failedCount, 0);
  const filtered = shown.length !== campaigns.length;

  async function openCampaign(c: CampaignSummary) {
    setOpen(c);
    setRecipients(null);
    try {
      setRecipients(await listCampaignRecipientsFn({ data: { campaignId: c.id } }));
    } catch {
      toast.error("Couldn't load the recipients.");
    }
  }

  async function retryFailed(c: CampaignSummary) {
    setBusy(true);
    try {
      const r = await resendFailedMailFn({ data: { campaignId: c.id } });
      toast.success(
        r.queued > 0
          ? `${r.queued} failed message${r.queued === 1 ? "" : "s"} back on the queue.`
          : "Nothing failed on this send.",
      );
      setCampaigns(await listCampaignsFn());
    } catch {
      toast.error("Couldn't retry those just now.");
    } finally {
      setBusy(false);
    }
  }

  async function resume(c: CampaignSummary) {
    setBusy(true);
    try {
      const r = await resumeCampaignFn({ data: { campaignId: c.id } });
      toast.success(
        r.queued > 0 ? `${r.queued} message(s) back on the queue.` : "Nothing left to send.",
      );
      setCampaigns(await listCampaignsFn());
    } catch {
      toast.error("Couldn't resume the send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Emails composed" value={shown.length} />
        <StatCard label="Total sent" value={totalSent} emphasis />
        <StatCard label="Total failed" value={totalFailed} />
      </div>

      <FilterBar columns={4}>
        {/* Batch No. first and set to All, so the history opens showing everything. */}
        <Field
          label="Batch No."
          htmlFor="mailbox-batch"
          hint="Emails that name the batch in their subject or message."
        >
          <Select value={batchNo} onValueChange={setBatchNo}>
            <SelectTrigger id="mailbox-batch">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All batches</SelectItem>
              {batches.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <PeriodFilterFields value={period} onChange={setPeriod} years={years} idPrefix="mailbox" />
        <Field label="Delivery status" htmlFor="mailbox-status">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="mailbox-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {(Object.keys(STATUS_LABEL) as CampaignStatus[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {STATUS_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex items-end sm:col-span-2 lg:col-span-4">
          <p className="text-xs text-muted-foreground">
            {periodLabel(period)}
            {batchNo === "all" ? "" : ` · ${batchNo}`}
            {status === "all" ? "" : ` · ${STATUS_LABEL[status as CampaignStatus]}`}
            {" · "}
            {shown.length} of {campaigns.length} email{campaigns.length === 1 ? "" : "s"}
          </p>
          {filtered ? (
            <Button
              variant="outline"
              size="sm"
              className="ml-3"
              onClick={() => {
                setPeriod(EMPTY_PERIOD);
                setBatchNo("all");
                setStatus("all");
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </FilterBar>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        {shown.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title={campaigns.length === 0 ? "Nothing sent yet" : "No emails match"}
              hint={
                campaigns.length === 0
                  ? "Emails you send from the Compose tab are recorded here, with who received them."
                  : "Try a wider date filter, or set Batch No. back to All."
              }
            />
          </div>
        ) : (
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                {/* "Sent by" and "Actions" had no headings. The sender was a grey sub-line
                    under the date, and the buttons sat under a blank cell, so two of the six
                    columns were things a reader had to work out from their contents. */}
                <Th>Sent</Th>
                <Th>Sent by</Th>
                <Th>Subject</Th>
                <Th>Audience</Th>
                <Th>Recipients</Th>
                <Th>Delivery status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c, i) => (
                <motion.tr
                  key={c.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.2) }}
                  className="border-b border-border/60 last:border-0"
                >
                  <Td>
                    {dateShort(c.createdAt)}
                    <span className="block text-xs text-muted-foreground">
                      {timeShort(c.createdAt)}
                    </span>
                  </Td>
                  <Td>{c.sentBy}</Td>
                  <Td className="max-w-xs">
                    <span className="block truncate font-medium">{c.subject}</span>
                  </Td>
                  <Td>{c.audience === "all" ? "All employees" : "Selected"}</Td>
                  <Td>{c.recipients}</Td>
                  <Td>
                    <span
                      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[c.status]}`}
                    >
                      {STATUS_LABEL[c.status]}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {c.sentCount} sent
                      {c.failedCount ? `, ${c.failedCount} failed` : ""}
                      {c.pendingCount ? `, ${c.pendingCount} to go` : ""}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => void openCampaign(c)}>
                        Recipients
                      </Button>
                      {c.pendingCount ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => void resume(c)}
                        >
                          Send the rest
                        </Button>
                      ) : null}
                      {c.failedCount ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => void retryFailed(c)}
                        >
                          Resend {c.failedCount} failed
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="truncate">{open?.subject}</DialogTitle>
          </DialogHeader>
          {open ? (
            <div className="space-y-4">
              <div className="whitespace-pre-wrap rounded-lg border border-border bg-secondary/40 p-4 text-sm">
                {open.body}
              </div>
              {recipients === null ? (
                <p className="text-sm text-muted-foreground">Loading recipients…</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="border-b border-border text-left text-muted-foreground">
                      <tr>
                        <Th>Employee</Th>
                        <Th>Employee ID</Th>
                        <Th>Business unit</Th>
                        <Th>Email</Th>
                        <Th>Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipients.map((r) => (
                        <tr key={r.id} className="border-b border-border/60 last:border-0">
                          <Td className="font-medium">{r.employeeName || "—"}</Td>
                          <Td>{r.employeeRef || "—"}</Td>
                          <Td>{r.businessUnit || "—"}</Td>
                          <Td>{r.toAddress || "—"}</Td>
                          <Td>
                            {RECIPIENT_LABEL[r.status]}
                            {r.error ? (
                              <span className="mt-1 block max-w-[18rem] text-xs text-muted-foreground">
                                {r.error}
                              </span>
                            ) : null}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
