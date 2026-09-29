import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  RemoveFormatting,
  Underline,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CONTROL_MULTI_LINE } from "@/components/ui/control-styles";
import { cn } from "@/lib/utils";

type Format = "bold" | "italic" | "underline" | "insertUnorderedList" | "insertOrderedList";

/** An empty editor is one paragraph with nothing in it, which is what the browser types into. */
const EMPTY = "<p><br></p>";

/**
 * The Mailbox's message box: formatting shows as you type, the way it does in a mail client.
 *
 * A contenteditable box driven by the browser's own editing commands, so bold is bold on screen
 * rather than asterisks. What it produces is only a draft of the markup: the server rebuilds the
 * message from a short list of tags before it is stored or sent (rich-text.server.ts), so this
 * never has to be trusted, only convenient.
 *
 * Uncontrolled: it reports its HTML through `onChange` ("" when there is nothing written) and
 * is cleared by remounting it with a new `key`.
 */
export function MailEditor({
  id,
  placeholder,
  describedBy,
  onChange,
  onDropFiles,
  initialHtml,
}: {
  id: string;
  placeholder: string;
  describedBy?: string;
  onChange: (html: string) => void;
  /**
   * What the box opens with, e.g. a saved draft. Only read on mount; it is markup the server
   * already cleaned (cleanMailHtml), and it is cleaned again when saved or sent.
   */
  initialHtml?: string | undefined;
  /** Files dropped on the box become attachments instead of pictures pasted into the text. */
  onDropFiles?: (files: File[]) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Record<Format, boolean>>({
    bold: false,
    italic: false,
    underline: false,
    insertUnorderedList: false,
    insertOrderedList: false,
  });
  const [inLink, setInLink] = useState(false);
  const [empty, setEmpty] = useState(true);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const savedRange = useRef<Range | null>(null);
  // Read once, on mount: after that the box is the source of truth, not the prop.
  const initial = useRef(initialHtml);

  const selectionInBox = () => {
    const sel = document.getSelection();
    return sel && sel.rangeCount > 0 && box.current?.contains(sel.anchorNode) ? sel : null;
  };

  const refresh = useCallback(() => {
    if (!selectionInBox()) return;
    setActive({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      insertUnorderedList: document.queryCommandState("insertUnorderedList"),
      insertOrderedList: document.queryCommandState("insertOrderedList"),
    });
    const node = document.getSelection()?.anchorNode;
    const el = node instanceof Element ? node : node?.parentElement;
    setInLink(Boolean(el?.closest("a") && box.current?.contains(el)));
  }, []);

  const emit = useCallback(() => {
    const el = box.current;
    if (!el) return;
    // Backspacing everything away can leave the box with no paragraph at all; put one back so
    // the next thing typed is still inside a <p>.
    if (!el.firstChild) el.innerHTML = EMPTY;
    const blank = !el.textContent?.trim() && !el.querySelector("li");
    setEmpty(blank);
    onChange(blank ? "" : el.innerHTML);
  }, [onChange]);

  useEffect(() => {
    if (box.current && !box.current.innerHTML) {
      box.current.innerHTML = initial.current || EMPTY;
      if (initial.current) setEmpty(false);
    }
    // New lines as <p> rather than <div>, and bold as <b> rather than <span style>: closer to
    // what the server keeps, so the box and the sent email look the same.
    document.execCommand("defaultParagraphSeparator", false, "p");
    document.execCommand("styleWithCSS", false, "false");
    document.addEventListener("selectionchange", refresh);
    return () => document.removeEventListener("selectionchange", refresh);
  }, [refresh]);

  function run(command: string, value?: string) {
    box.current?.focus();
    document.execCommand(command, false, value);
    emit();
    refresh();
  }

  function openLink() {
    const sel = selectionInBox();
    savedRange.current = sel ? sel.getRangeAt(0).cloneRange() : null;
    setLinkUrl("");
    setLinkOpen(true);
  }

  function applyLink() {
    let url = linkUrl.trim();
    if (!url) return;
    if (!/^(https?:\/\/|mailto:)/i.test(url)) {
      url = url.includes("@") && !url.includes("/") ? `mailto:${url}` : `https://${url}`;
    }
    setLinkOpen(false);
    box.current?.focus();
    const sel = document.getSelection();
    if (sel && savedRange.current) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    if (!savedRange.current || savedRange.current.collapsed) {
      // Nothing selected: the address itself becomes the link text.
      const a = document.createElement("a");
      a.href = url;
      a.textContent = url.replace(/^mailto:/i, "");
      run("insertHTML", a.outerHTML);
    } else {
      run("createLink", url);
    }
  }

  const tools: { format: Format; label: string; keys?: string; icon: typeof Bold }[] = [
    { format: "bold", label: "Bold", keys: "Ctrl+B", icon: Bold },
    { format: "italic", label: "Italic", keys: "Ctrl+I", icon: Italic },
    { format: "underline", label: "Underline", keys: "Ctrl+U", icon: Underline },
    { format: "insertUnorderedList", label: "Bulleted list", icon: List },
    { format: "insertOrderedList", label: "Numbered list", icon: ListOrdered },
  ];

  // Keeps the text selection where it is when a toolbar button is pressed.
  const keepSelection = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap items-center gap-1"
        role="toolbar"
        aria-label="Formatting"
        aria-controls={id}
      >
        {tools.map(({ format, label, keys, icon: Icon }) => (
          <Button
            key={format}
            type="button"
            size="sm"
            variant={active[format] ? "secondary" : "ghost"}
            aria-pressed={active[format]}
            aria-label={label}
            title={keys ? `${label} (${keys})` : label}
            onMouseDown={keepSelection}
            onClick={() => run(format)}
          >
            <Icon className="size-4" aria-hidden="true" />
          </Button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Add link"
          title="Add link"
          onMouseDown={keepSelection}
          onClick={openLink}
        >
          <Link2 className="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Remove link"
          title="Remove link"
          disabled={!inLink}
          onMouseDown={keepSelection}
          onClick={() => run("unlink")}
        >
          <Link2Off className="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Clear formatting"
          title="Clear formatting"
          onMouseDown={keepSelection}
          onClick={() => run("removeFormat")}
        >
          <RemoveFormatting className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="relative">
        {empty ? (
          <p className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">
            {placeholder}
          </p>
        ) : null}
        <div
          id={id}
          ref={box}
          role="textbox"
          aria-multiline="true"
          aria-describedby={describedBy}
          contentEditable
          suppressContentEditableWarning
          className={cn(
            CONTROL_MULTI_LINE,
            "block min-h-64 overflow-y-auto text-sm leading-6",
            "[&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-3 [&_ol]:list-decimal",
            "[&_ol]:pl-6 [&_a]:text-primary [&_a]:underline",
          )}
          onInput={emit}
          onKeyUp={refresh}
          onMouseUp={refresh}
          onPaste={(e) => {
            // Pasted as plain text: a paste from Word or a web page brings fonts and colours the
            // email would not keep, so the box would show something the recipient never sees.
            e.preventDefault();
            document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
            emit();
          }}
          onDrop={(e) => {
            if (!e.dataTransfer.files.length) return;
            e.preventDefault();
            onDropFiles?.([...e.dataTransfer.files]);
          }}
        />
      </div>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add link</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              applyLink();
            }}
          >
            <Input
              autoFocus
              value={linkUrl}
              placeholder="https://… or name@anwargroup.net"
              onChange={(e) => setLinkUrl(e.target.value)}
            />
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!linkUrl.trim()}>
                Add link
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
