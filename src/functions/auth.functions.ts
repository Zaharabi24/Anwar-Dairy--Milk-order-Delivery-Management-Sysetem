// Auth server functions (RPC endpoints). Client code calls these through
// src/services/auth-service.ts; the logic lives in src/server/auth/.
import { createServerFn } from "@tanstack/react-start";
import * as schema from "@/lib/auth.schemas";

const auth = () => import("@/server/auth/auth.server");
const invitations = () => import("@/server/auth/invitations.server");
const profile = () => import("@/server/auth/profile.server");
const bookingLinks = () => import("@/server/auth/booking-links.server");

export const getAuthStateFn = createServerFn({ method: "GET" }).handler(async () =>
  (await auth()).getAuthState(),
);

// Employee portal
export const signInFn = createServerFn({ method: "POST" })
  .validator(schema.signInInput)
  .handler(async ({ data }) => (await auth()).signIn(data));

export const createAccountFn = createServerFn({ method: "POST" })
  .validator(schema.createAccountInput)
  .handler(async ({ data }) => (await auth()).createAccount(data));

export const forgotPasswordFn = createServerFn({ method: "POST" })
  .validator(schema.forgotPasswordInput)
  .handler(async ({ data }) => (await auth()).verifyResetIdentity(data));

// Staff portal
export const staffSignInFn = createServerFn({ method: "POST" })
  .validator(schema.staffSignInInput)
  .handler(async ({ data }) => (await auth()).staffSignIn(data));

export const staffForgotPasswordFn = createServerFn({ method: "POST" })
  .validator(schema.staffForgotPasswordInput)
  .handler(async ({ data }) => (await auth()).staffForgotPassword(data));

// Either portal
export const signOutFn = createServerFn({ method: "POST" }).handler(async () =>
  (await auth()).signOut(),
);

export const switchRoleFn = createServerFn({ method: "POST" })
  .validator(schema.switchRoleInput)
  .handler(async ({ data }) => (await auth()).switchRole(data.role));

export const validatePasswordTokenFn = createServerFn({ method: "POST" })
  .validator(schema.tokenInput)
  .handler(async ({ data }) => (await auth()).validatePasswordToken(data.token));

export const setPasswordFn = createServerFn({ method: "POST" })
  .validator(schema.setPasswordInput)
  .handler(async ({ data }) => (await auth()).setPassword(data));

// Admin: employee accounts
export const listAccountsFn = createServerFn({ method: "GET" }).handler(async () =>
  (await auth()).listAccounts(),
);

export const listDeletedAccountsFn = createServerFn({ method: "GET" }).handler(async () =>
  (await auth()).listDeletedAccounts(),
);

export const accountActionFn = createServerFn({ method: "POST" })
  .validator(schema.accountActionInput)
  .handler(async ({ data }) => (await auth()).accountAction(data));

export const listPasswordResetsFn = createServerFn({ method: "GET" }).handler(async () =>
  (await auth()).listPasswordResets(),
);

export const sendTestEmailFn = createServerFn({ method: "POST" }).handler(async () =>
  (await auth()).sendTestEmail(),
);

export const listAuthAuditFn = createServerFn({ method: "POST" })
  .validator(schema.accountAuditFilter)
  .handler(async ({ data }) => (await auth()).listAuthAudit(data));

// Any signed-in person: their own profile and security
export const myProfileFn = createServerFn({ method: "GET" }).handler(async () =>
  (await profile()).getMyProfile(),
);

export const updateProfileFn = createServerFn({ method: "POST" })
  .validator(schema.updateProfileInput)
  .handler(async ({ data }) => (await profile()).updateMyProfile(data));

export const changePasswordFn = createServerFn({ method: "POST" })
  .validator(schema.changePasswordInput)
  .handler(async ({ data }) => (await profile()).changeMyPassword(data));

export const mySessionsFn = createServerFn({ method: "GET" }).handler(async () =>
  (await profile()).listMySessions(),
);

export const revokeMySessionFn = createServerFn({ method: "POST" })
  .validator(schema.sessionIdInput)
  .handler(async ({ data }) => (await profile()).revokeMySession(data.session_id));

export const revokeMyOtherSessionsFn = createServerFn({ method: "POST" }).handler(async () =>
  (await profile()).revokeMyOtherSessions(),
);

export const myActivityFn = createServerFn({ method: "GET" }).handler(async () =>
  (await profile()).listMyActivity(),
);

// Super Admin: staff invitations
export const listTeamFn = createServerFn({ method: "GET" }).handler(async () =>
  (await invitations()).listTeam(),
);

export const createInvitationFn = createServerFn({ method: "POST" })
  .validator(schema.createInvitationInput)
  .handler(async ({ data }) => (await invitations()).createInvitation(data));

export const resendInvitationFn = createServerFn({ method: "POST" })
  .validator(schema.invitationIdInput)
  .handler(async ({ data }) => (await invitations()).resendInvitation(data.invitation_id));

export const copyInvitationLinkFn = createServerFn({ method: "POST" })
  .validator(schema.invitationIdInput)
  .handler(async ({ data }) => (await invitations()).copyInvitationLink(data.invitation_id));

export const revokeInvitationFn = createServerFn({ method: "POST" })
  .validator(schema.invitationIdInput)
  .handler(async ({ data }) => (await invitations()).revokeInvitation(data.invitation_id));

// Invitee (no session needed; the token is the credential)
export const previewInvitationFn = createServerFn({ method: "POST" })
  .validator(schema.tokenInput)
  .handler(async ({ data }) => (await invitations()).previewInvitation(data.token));

export const acceptInvitationFn = createServerFn({ method: "POST" })
  .validator(schema.acceptInvitationInput)
  .handler(async ({ data }) => (await invitations()).acceptInvitation(data));

// Booking link (no session needed; the token is the credential)
export const openBookingLinkFn = createServerFn({ method: "POST" })
  .validator(schema.tokenInput)
  .handler(async ({ data }) => (await bookingLinks()).openBookingLink(data.token));
