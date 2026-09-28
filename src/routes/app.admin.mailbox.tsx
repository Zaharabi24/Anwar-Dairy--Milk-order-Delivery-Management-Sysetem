import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2, Mail, Paperclip, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MailEditor } from "@/components/mail-editor";
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
  listCampaignEmailsFn,
  previewCampaignFn,
  resendFailedMailFn,
  sendCampaignFn,
} from "@/functions/mailbox.functions";
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
import type { CampaignEmail, MailboxAudience, RecipientStatus } from "@/lib/mailbox-types";
import { isBlockedFile, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from "@/lib/mailbox.schemas";
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
        emails: await listCampaignEmailsFn(),
        allRecipients: await countAllRecipientsFn(),
      };
    } catch {
      return {
        emails: [] as CampaignEmail[],
        allRecipients: { total: 0 },
      };
    }
  },
  component: Mailbox,
});

/** How many rows the history draws at once. A directory-wide send is a few hundred on its own. */
const HISTORY_PAGE = 300;

/** The statuses that mean the message left the building. */
const DELIVERED = new Set<RecipientStatus>(["sent", "captured", "logged"]);

const RECIPIENT_TONE: Record<RecipientStatus, string> = {
  queued: "bg-secondary text-muted-foreground",
  sending: "bg-secondary text-muted-foreground",
  sent: "bg-primary/10 text-primary-deep",
  captured: "bg-accent/15 text-accent-foreground",
  failed: "bg-destructive/10 text-destructive",
  logged: "bg-secondary text-muted-foreground",
  skipped: "bg-secondary text-muted-foreground",
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
          <History initial={initial.emails} />
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
  // The editor's HTML, or "" when nothing is written. The server cleans it before it is kept.
  const [body, setBody] = useState("");
  // Remounting the editor is how it is emptied after a send.
  const [editorKey, setEditorKey] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const filesBytes = files.reduce((sum, f) => sum + f.size, 0);

  /**
   * Adds files, turning away the ones that could never be sent: a kind mail servers block, one too
   * many, or more than the size limit all together. The server checks all of this again.
   */
  function addFiles(incoming: File[]) {
    let next = [...files];
    let bytes = filesBytes;
    for (const file of incoming) {
      if (isBlockedFile(file.name)) {
        toast.error(`${file.name} can't be attached: mail servers block that kind of file.`);
      } else if (next.length >= MAX_ATTACHMENTS) {
        toast.error(`Attach at most ${MAX_ATTACHMENTS} files.`);
        break;
      } else if (bytes + file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(
          `${file.name} would take the attachments over ${megabytes(MAX_ATTACHMENT_BYTES)}.`,
        );
      } else if (!next.some((f) => f.name === file.name && f.size === file.size)) {
        next = [...next, file];
        bytes += file.size;
      }
    }
    setFiles(next);
  }
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
  const canSend = subject.trim().length > 0 && body.length > 0 && recipientCount > 0;

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
        data: {
          subject: subject.trim() || "(no subject)",
          body,
          bodyFormat: "html",
          sampleName: "Employee name",
        },
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
          body,
          bodyFormat: "html",
          attachments: await Promise.all(
            files.map(async (file) => ({
              filename: file.name,
              contentType: file.type || "application/octet-stream",
              data: await toBase64(file),
            })),
          ),
          audience,
          employeeIds: audience === "selected" ? [...chosen] : [],
        },
      });
      setConfirming(false);
      setConfirmWord("");
      setSent({ recipients: result.recipients, durable: result.durable });
      setSubject("");
      setBody("");
      setEditorKey((k) => k + 1);
      setFiles([]);
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
            hint="Format it like any email: bold, italic, underline, lists and links. Sent on the official Anwar Organic template, addressed to each person by name."
          >
            <MailEditor
              key={editorKey}
              id="mail-body"
              // Field attaches this to whatever single child it is given, which is the editor's
              // wrapper, not the box itself. Named here so the hint stays tied to the box a
              // screen reader lands in.
              describedBy="mail-body-description"
              placeholder="Write your message here."
              onChange={setBody}
              onDropFiles={addFiles}
            />
          </Field>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                <Paperclip className="size-4" />
                Attach files
              </Button>
              <p className="text-xs text-muted-foreground">
                Up to {MAX_ATTACHMENTS} files, {megabytes(MAX_ATTACHMENT_BYTES)} in all. Every
                recipient gets them. You can also drop files on the message.
              </p>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  addFiles([...(e.target.files ?? [])]);
                  e.target.value = "";
                }}
              />
            </div>
            {files.length ? (
              <ul className="flex flex-wrap gap-2">
                {files.map((file) => (
                  <li
                    key={`${file.name}-${file.size}`}
                    className="flex items-center gap-2 rounded-md border border-border bg-secondary px-2 py-1 text-xs"
                  >
                    <Paperclip className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <span className="max-w-56 truncate font-medium">{file.name}</span>
                    <span className="text-muted-foreground">{megabytes(file.size)}</span>
                    <button
                      type="button"
                      className="rounded text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => setFiles(files.filter((f) => f !== file))}
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => void openPreview()} disabled={!body}>
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
            <Ready done={body.length > 0}>Message written</Ready>
            <Ready done={recipientCount > 0}>
              {audience === "all" ? "Everyone in the directory" : "Recipients chosen"}
            </Ready>
          </ul>
          {files.length ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Paperclip className="size-4" aria-hidden="true" />
              {files.length} {files.length === 1 ? "attachment" : "attachments"} ·{" "}
              {megabytes(filesBytes)}
            </p>
          ) : null}
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
        attachments={files.map((f) => f.name)}
        onCancel={() => {
          setConfirming(false);
          setConfirmWord("");
        }}
        onSend={() => void send()}
      />
    </div>
  );
}

/** A size the way people say it: "240 KB", "1.4 MB". */
function megabytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

/** A file's contents as base64, for the JSON the server function takes. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error(`Couldn't read ${file.name}.`));
    reader.readAsDataURL(file);
  });
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
  attachments,
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
  attachments: string[];
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
            {attachments.length ? (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Paperclip className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {attachments.join(", ")}
              </p>
            ) : null}
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

/**
 * Every email the Mailbox has sent, one row per person.
 *
 * It was a list of sends: one row for a message to three hundred people, with the individuals
 * behind a Recipients dialog. That answers "what have we sent" and turns "did this reach her" into
 * a hunt — open a send, scan it, close it, open the next. The unit here is the email that arrived,
 * or didn't, because that is what somebody comes to this screen holding a name to check.
 *
 * Two filters, which are the two questions asked of an email: when, and did it get there. Batch
 * No. was here and has gone — a composed email has no batch of its own, so it could only be
 * matched against whatever the subject happened to mention.
 */
function History({ initial }: { initial: CampaignEmail[] }) {
  const [emails, setEmails] = useState(initial);
  const [open, setOpen] = useState<CampaignEmail | null>(null);
  const [busy, setBusy] = useState(false);

  const [period, setPeriod] = useState<PeriodFilter>(EMPTY_PERIOD);
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");

  const years = useMemo(() => yearsIn(emails.map((e) => e.createdAt)), [emails]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return emails
      .filter((e) => periodMatches(period, e.createdAt))
      .filter((e) => (status === "all" ? true : e.status === status))
      .filter((e) =>
        !q
          ? true
          : e.employeeName.toLowerCase().includes(q) ||
            e.employeeRef.toLowerCase().includes(q) ||
            e.toAddress.toLowerCase().includes(q) ||
            e.subject.toLowerCase().includes(q),
      );
  }, [emails, period, status, query]);

  const delivered = shown.filter((e) => DELIVERED.has(e.status)).length;
  const failed = shown.filter((e) => e.status === "failed").length;
  const filtered = shown.length !== emails.length;

  // The sends behind the failures on screen, so one button can put them all back on the queue.
  // Retrying is still per send, which is what the queue understands; nobody has to know which
  // sends those were.
  const failedCampaigns = useMemo(
    () => [...new Set(shown.filter((e) => e.status === "failed").map((e) => e.campaignId))],
    [shown],
  );

  async function reload() {
    setEmails(await listCampaignEmailsFn());
  }

  async function retryFailed() {
    setBusy(true);
    try {
      const results = await Promise.all(
        failedCampaigns.map((campaignId) => resendFailedMailFn({ data: { campaignId } })),
      );
      const queued = results.reduce((n, r) => n + r.queued, 0);
      toast.success(
        queued > 0
          ? `${queued} failed message${queued === 1 ? "" : "s"} back on the queue.`
          : "Those were already dealt with.",
      );
      await reload();
    } catch {
      toast.error("Couldn't retry those just now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Emails shown" value={shown.length} />
        <StatCard label="Delivered" value={delivered} emphasis />
        <StatCard label="Failed" value={failed} />
      </div>

      <FilterBar columns={4}>
        <PeriodFilterFields value={period} onChange={setPeriod} years={years} idPrefix="mailbox" />
        <Field label="Delivery status" htmlFor="mailbox-status">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="mailbox-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {(Object.keys(RECIPIENT_LABEL) as RecipientStatus[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {RECIPIENT_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Search" htmlFor="mailbox-search">
          <Input
            id="mailbox-search"
            placeholder="Name, Employee ID, email or subject"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 sm:col-span-2 lg:col-span-4">
          <p className="text-xs text-muted-foreground">
            {periodLabel(period)}
            {status === "all" ? "" : ` · ${RECIPIENT_LABEL[status as RecipientStatus]}`} ·{" "}
            {shown.length} of {emails.length} email{emails.length === 1 ? "" : "s"}
          </p>
          {filtered ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPeriod(EMPTY_PERIOD);
                setStatus("all");
                setQuery("");
              }}
            >
              Clear filters
            </Button>
          ) : null}
          {failed > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              disabled={busy}
              onClick={() => void retryFailed()}
            >
              {busy ? "Queueing…" : `Resend ${failed} failed`}
            </Button>
          ) : null}
        </div>
      </FilterBar>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        {shown.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title={emails.length === 0 ? "Nothing sent yet" : "No emails match"}
              hint={
                emails.length === 0
                  ? "Emails you send from the Compose tab are recorded here, one row per person."
                  : "Try a wider date filter, or set the status back to Any."
              }
            />
          </div>
        ) : (
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <Th>Employee</Th>
                <Th>Employee ID</Th>
                <Th>Email</Th>
                <Th>Business unit</Th>
                <Th>Subject</Th>
                <Th>Sent</Th>
                <Th>Delivery status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, HISTORY_PAGE).map((e, i) => (
                <motion.tr
                  key={e.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: Math.min(i * 0.006, 0.2) }}
                  className="border-b border-border/60 last:border-0"
                >
                  <Td className="font-medium">{e.employeeName || "—"}</Td>
                  <Td>{e.employeeRef || "—"}</Td>
                  <Td>{e.toAddress || "—"}</Td>
                  <Td>{e.businessUnit || "—"}</Td>
                  <Td className="max-w-xs">
                    <span className="block truncate">{e.subject}</span>
                  </Td>
                  <Td>
                    {dateShort(e.sentAt ?? e.createdAt)}
                    <span className="block text-xs text-muted-foreground">
                      {timeShort(e.sentAt ?? e.createdAt)} · {e.sentBy}
                    </span>
                  </Td>
                  <Td>
                    <span
                      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${RECIPIENT_TONE[e.status]}`}
                    >
                      {RECIPIENT_LABEL[e.status]}
                    </span>
                    {e.error ? (
                      <span className="mt-1 block max-w-[16rem] text-xs text-muted-foreground">
                        {e.error}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <Button variant="outline" size="sm" onClick={() => setOpen(e)}>
                      Read
                    </Button>
                  </Td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {shown.length > HISTORY_PAGE ? (
        <p className="text-xs text-muted-foreground">
          Showing the first {HISTORY_PAGE} of {shown.length}. Narrow the date or the search to reach
          the rest.
        </p>
      ) : null}

      {/* The message as that person received it, opened from their own row rather than from the
          send it belonged to. */}
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="truncate">{open?.subject}</DialogTitle>
          </DialogHeader>
          {open ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">To</dt>
              <dd>
                {open.employeeName || "—"}
                {open.toAddress ? ` · ${open.toAddress}` : ""}
              </dd>
              <dt className="text-muted-foreground">Employee ID</dt>
              <dd>{open.employeeRef || "—"}</dd>
              <dt className="text-muted-foreground">Sent</dt>
              <dd>
                {dateShort(open.sentAt ?? open.createdAt)},{" "}
                {timeShort(open.sentAt ?? open.createdAt)} by {open.sentBy}
              </dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                {RECIPIENT_LABEL[open.status]}
                {open.error ? ` — ${open.error}` : ""}
              </dd>
            </dl>
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
