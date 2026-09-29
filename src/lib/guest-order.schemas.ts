// The guest order form: people who collect from a pickup point but have no company email or
// Employee ID. Shared by the page and the server; the server checks everything again.
import { z } from "zod";
import { ALLOWED_EMAIL_DOMAIN } from "./auth-constants";

/** Bangladeshi mobile numbers: 01XXXXXXXXX, optionally written with +88 / 88 in front. */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/[\s()-]/g, "");
  const local = digits.replace(/^\+?88(?=01)/, "");
  return local;
}
const BD_MOBILE = /^01[3-9]\d{8}$/;

export const guestOrderInput = z.object({
  batchNo: z.string().trim().min(1).max(60),
  name: z.string().trim().min(2, "Enter your full name.").max(120, "Keep the name shorter."),
  phone: z
    .string()
    .trim()
    .max(20)
    .transform(normalisePhone)
    .refine((v) => BD_MOBILE.test(v), "Enter a mobile number like 01712345678."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .email("Enter a valid email address.")
    // Someone with a company address has an Employee ID too, and books through Book Milk.
    .refine(
      (v) => !v.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`),
      "This is a company address. Use Book Milk and sign in with your company account instead.",
    ),
  address: z
    .string()
    .trim()
    .min(5, "Enter your address.")
    .max(300, "Keep the address under 300 characters."),
  deliveryPointId: z.string().trim().min(1, "Choose a pickup point.").max(60),
  litres: z.number().int().positive().max(1000),
  // Guests aren't on payroll, so they pay at collection.
  paymentMethod: z.enum(["Cash", "bKash"]),
});

export type GuestOrderInput = z.input<typeof guestOrderInput>;

/** What the guest page needs to know about the batch open right now. */
export interface GuestBookingInfo {
  batchNo: string;
  ratePerLitre: number;
  minLitres: number;
  maxLitres: number;
  remainingLitres: number;
  bookingCutoff: string;
  deliveryDate: string;
  deliveryWindow: string;
  points: { id: string; name: string; address: string }[];
}

export interface GuestOrderResult {
  orderNo: string;
  litres: number;
  amount: number;
  pointName: string;
  deliveryDate: string;
  deliveryWindow: string;
}
