// Employees registering themselves in the Employee Database from the landing page. The same
// fields the System Admin's Add employee form keeps. Shared by the page and the server; the
// server checks everything again.
import { z } from "zod";
import { ALLOWED_EMAIL_DOMAIN } from "./auth-constants";

export const registrationInput = z.object({
  employeeId: z
    .string()
    .trim()
    .min(1, "Enter your Employee ID.")
    .max(32, "That Employee ID is too long.")
    .regex(/^[A-Za-z0-9._/-]+$/, "Use letters, digits and . _ - / only, with no spaces."),
  name: z.string().trim().min(2, "Enter your full name.").max(120, "Keep the name shorter."),
  companyEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .email("Enter a valid email address.")
    .refine((v) => v.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`), {
      message: `Use your company address, ending @${ALLOWED_EMAIL_DOMAIN}.`,
    }),
  phone: z.string().trim().min(6, "Enter your phone number.").max(40),
  department: z.string().trim().min(1, "Enter your department.").max(120),
  designation: z.string().trim().max(120),
  site: z.string().trim().min(1, "Enter your location.").max(120),
  floorNo: z.string().trim().max(20),
  businessUnitCode: z.string().trim().min(1, "Choose your business unit.").max(20),
});

export type RegistrationInput = z.input<typeof registrationInput>;

/** What the form offers: the business units, and the values already in use as suggestions. */
export interface RegistrationOptions {
  businessUnits: { code: string; name: string }[];
  departments: string[];
  designations: string[];
  locations: string[];
}

export type VerifyRegistrationResult =
  | { status: "verified"; name: string }
  | { status: "already" }
  | { status: "invalid" }
  | { status: "expired" };
