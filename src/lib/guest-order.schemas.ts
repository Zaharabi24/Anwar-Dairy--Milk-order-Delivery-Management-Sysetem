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
  // Optional: without one there is simply no emailed receipt.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => !v || z.string().email().safeParse(v).success, "Enter a valid email address.")
    // Someone with a company address has an Employee ID too, and books through Book Milk.
    .refine(
      (v) => !v?.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`),
      "This is a company address. Use Book Milk and sign in with your company account instead.",
    ),
  // Guests collect from a pickup point, so the form asks where they sit and who they are rather
  // than for an address.
  floor: z.string().trim().min(1, "Enter your floor.").max(40, "Keep the floor under 40 characters."),
  profile: z
    .string()
    .trim()
    .min(1, "Enter a short description of yourself.")
    .max(200, "Keep the description under 200 characters."),
  deliveryPointId: z.string().trim().min(1, "Choose a pickup point.").max(60),
  litres: z.number().int().positive().max(1000),
  // Guests aren't on payroll, so they pay cash at collection.
  paymentMethod: z.literal("Cash"),
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
