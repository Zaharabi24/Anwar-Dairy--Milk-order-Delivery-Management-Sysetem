// Unauthenticated calls from the public pages: the landing page, the guest order form and
// employee self-registration.
import { createServerFn } from "@tanstack/react-start";
import type { GuestOrderInput } from "@/lib/guest-order.schemas";
import type { RegistrationInput } from "@/lib/registration.schemas";

export const publicBatchStatusFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getPublicBatchStatus } = await import("@/server/public-batch.server");
  return getPublicBatchStatus();
});

/** The batch a guest (no company email or Employee ID) can order from, or null. */
export const guestBookingInfoFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getGuestBookingInfo } = await import("@/server/guest-orders.server");
  return getGuestBookingInfo();
});

/** A guest's order request. Validated and rate-limited in the server module. */
export const placeGuestOrderFn = createServerFn({ method: "POST" })
  .validator((data: GuestOrderInput) => data)
  .handler(async ({ data }) => {
    const { placeGuestOrder } = await import("@/server/guest-orders.server");
    return placeGuestOrder(data);
  });

/** What the employee registration form offers: business units and suggestions. */
export const registrationOptionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getRegistrationOptions } = await import("@/server/auth/registration.server");
  return getRegistrationOptions();
});

/** An employee adding themselves to the Employee Database. Checked in the server module. */
export const registerEmployeeFn = createServerFn({ method: "POST" })
  .validator((data: RegistrationInput) => data)
  .handler(async ({ data }) => {
    const { registerEmployee } = await import("@/server/auth/registration.server");
    return registerEmployee(data);
  });

/** Following the emailed confirmation link. */
export const verifyRegistrationFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => ({ token: String(data?.token ?? "").slice(0, 200) }))
  .handler(async ({ data }) => {
    const { verifyRegistration } = await import("@/server/auth/registration.server");
    return verifyRegistration(data.token);
  });
