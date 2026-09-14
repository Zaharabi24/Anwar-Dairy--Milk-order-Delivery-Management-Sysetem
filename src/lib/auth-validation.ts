import { ALLOWED_EMAIL_DOMAIN } from "./auth-constants";

export function validateCompanyEmail(v: string): string | null {
  if (!v.trim()) return "Company mail is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return "Enter a valid email address.";
  if (
    !v
      .trim()
      .toLowerCase()
      .endsWith("@" + ALLOWED_EMAIL_DOMAIN)
  )
    return "The mail domain doesn't match.";
  return null;
}

export function validateEmployeeId(v: string): string | null {
  if (!v.trim()) return "Employee ID is required.";
  if (!/^[A-Za-z0-9\-/]{3,20}$/.test(v.trim())) return "Enter a valid Employee ID.";
  return null;
}

export function validateDob(iso: string): string | null {
  if (!iso) return "Date of birth is required.";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Enter a valid date.";
  if (d > new Date()) return "Date of birth cannot be in the future.";
  const age = (Date.now() - d.getTime()) / 3.15576e10;
  if (age < 16 || age > 80) return "Enter a valid date of birth.";
  return null;
}

export type Strength = "Weak" | "Fair" | "Strong";

export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3; label: Strength } {
  if (!pw) return { score: 0, label: "Weak" };
  if (pw.length < 8) return { score: 1, label: "Weak" };
  let s = 0;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { score: 1, label: "Weak" };
  if (s <= 2) return { score: 2, label: "Fair" };
  return { score: 3, label: "Strong" };
}

export function validatePassword(pw: string): string | null {
  if (!pw) return "Password is required.";
  if (pw.length < 8) return "Min 8 characters";
  return null;
}

export function validateConfirm(pw: string, confirm: string): string | null {
  if (!confirm) return "Confirm your password.";
  if (pw !== confirm) return "Don't Match the password";
  return null;
}
