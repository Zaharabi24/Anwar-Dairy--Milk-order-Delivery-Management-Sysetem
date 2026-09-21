import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { passwordStrength } from "@/lib/auth-validation";

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string | null | undefined;
  showStrength?: boolean;
  required?: boolean;
  autoComplete?: string;
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  error,
  showStrength,
  required,
  autoComplete,
}: Props) {
  const [visible, setVisible] = useState(false);
  const { score, label: strengthLabel } = passwordStrength(value);

  const barColour = (i: number) => {
    if (score === 0 || i >= score) return "bg-muted";
    if (score === 1) return "bg-destructive";
    if (score === 2) return "bg-accent";
    return "bg-primary";
  };
  const textColour =
    score === 1 ? "text-destructive" : score === 2 ? "text-accent-foreground" : "text-primary";

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          className={cn("pr-11", error && "border-destructive")}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          // The icon says what the field is doing, not what the click will do: an open eye while
          // the password is on screen, an eye with a line through it while it is hidden. The
          // label and aria-pressed carry the action and the state for a screen reader.
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          // A 32px square inside the 40px field: a real target, centred, and clear of the
          // rounded corner. `secondary` rather than `accent`, which is the brand gold here and
          // lit the corner of the field up like a warning.
          className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
        >
          {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </button>
      </div>

      {showStrength && (
        <div className="flex items-center gap-2 pt-0.5">
          <div className="flex flex-1 gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={cn("h-1.5 flex-1 rounded-full transition-colors", barColour(i))}
              />
            ))}
          </div>
          {value && (
            <span className={cn("w-12 text-right text-xs font-medium", textColour)}>
              {strengthLabel}
            </span>
          )}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
