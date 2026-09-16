// Auth server functions (RPC endpoints). Client code calls these through
// src/services/auth-service.ts; the logic lives in src/server/auth/.
import { createServerFn } from "@tanstack/react-start";
import * as schema from "@/lib/auth.schemas";

const auth = () => import("@/server/auth/auth.server");
const invitations = () => import("@/server/auth/invitations.server");

export const getAuthStateFn = createServerFn({ method: "GET" }).handler(async () =>
  (await auth()).getAuthState(),
);

// Employee portal
export const signInFn = createServerFn({ method: "POST" })
  .validator(schema.signInInput)
  .handler(async ({ data }) => (await auth()).signIn(data));

export const accountRequestFn = createServerFn({ method: "POST" })
  .validator(schema.accountRequestInput)
  .handler(async ({ data }) => (await auth()).submitAccountRequest(data));

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
export const listAccountRequestsFn = createServerFn({ method: "GET" }).handler(async () =>
  (await auth()).listAccountRequests(),
);

export const reviewAccountRequestFn = createServerFn({ method: "POST" })
  .validator(schema.reviewRequestInput)
  .handler(async ({ data }) => (await auth()).reviewAccountRequest(data));

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
