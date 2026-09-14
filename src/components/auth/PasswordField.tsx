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
        {required && <span className="ml-0.5 text-destructive">*</span>}
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
          className={cn("pr-10", error && "border-destructive")}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
