// Every auth call goes through this module. Each method resolves to an AuthResult;
// nothing is faked — a failure always comes back as ok:false with a message.
import {
  acceptInvitationFn,
  accountActionFn,
  createAccountFn,
  copyInvitationLinkFn,
  createInvitationFn,
  forgotPasswordFn,
  listAccountsFn,
  listAuthAuditFn,
  listDeletedAccountsFn,
  myProfileFn,
  updateProfileFn,
  changePasswordFn,
  mySessionsFn,
  revokeMySessionFn,
  revokeMyOtherSessionsFn,
  myActivityFn,
  listPasswordResetsFn,
  sendTestEmailFn,
  listTeamFn,
  previewInvitationFn,
  resendInvitationFn,
  revokeInvitationFn,
  setPasswordFn,
  signInFn,
  signInFromDirectoryFn,
  signOutFn,
  staffForgotPasswordFn,
  staffSignInFn,
  switchRoleFn,
  validatePasswordTokenFn,
} from "@/functions/auth.functions";
import type { RoleValue } from "@/lib/auth-constants";
import type { AuthResult } from "@/lib/auth-types";
import type {
  DirectorySignInInput,
  AcceptInvitationInput,
  AccountActionInput,
  AccountAuditFilter,
  CreateAccountInput,
  ChangePasswordInput,
  CreateInvitationInput,
  ForgotPasswordInput,
  UpdateProfileInput,
} from "@/lib/auth.schemas";

export type { AuthResult, FieldErrors } from "@/lib/auth-types";

async function call<T>(fn: () => Promise<AuthResult<T>>): Promise<AuthResult<T>> {
  try {
    return await fn();
  } catch (error) {
    console.error(error);
    const message =
      error instanceof Error && error.message && !error.message.startsWith("[")
        ? error.message
        : "Something went wrong. Please try again.";
    return { ok: false, message };
  }
}

export const authService = {
  // Employee portal
  signIn: (p: { employee_id: string; password: string }) => call(() => signInFn({ data: p })),
  signInFromDirectory: (p: DirectorySignInInput) => call(() => signInFromDirectoryFn({ data: p })),
  createAccount: (p: CreateAccountInput) => call(() => createAccountFn({ data: p })),
  verifyResetIdentity: (p: ForgotPasswordInput) => call(() => forgotPasswordFn({ data: p })),

  // Staff portal
  staffSignIn: (p: { email: string; password: string }) => call(() => staffSignInFn({ data: p })),
  staffForgotPassword: (email: string) => call(() => staffForgotPasswordFn({ data: { email } })),

  // Either portal
  signOut: () => call(() => signOutFn()),
  switchRole: (role: RoleValue) => call(() => switchRoleFn({ data: { role } })),
  validatePasswordToken: (token: string) =>
    call(() => validatePasswordTokenFn({ data: { token } })),
  setPassword: (token: string, password: string) =>
    call(() => setPasswordFn({ data: { token, password } })),

  // Admin: employee accounts
  listAccounts: () => call(() => listAccountsFn()),
  accountAction: (p: AccountActionInput) => call(() => accountActionFn({ data: p })),
  listDeletedAccounts: () => call(() => listDeletedAccountsFn()),

  // Everyone: their own profile and security
  myProfile: () => call(() => myProfileFn()),
  updateProfile: (p: UpdateProfileInput) => call(() => updateProfileFn({ data: p })),
  changePassword: (p: ChangePasswordInput) => call(() => changePasswordFn({ data: p })),
  mySessions: () => call(() => mySessionsFn()),
  revokeMySession: (sessionId: string) =>
    call(() => revokeMySessionFn({ data: { session_id: sessionId } })),
  revokeMyOtherSessions: () => call(() => revokeMyOtherSessionsFn()),
  myActivity: () => call(() => myActivityFn()),
  listPasswordResets: () => call(() => listPasswordResetsFn()),
  sendTestEmail: () => call(() => sendTestEmailFn()),
  listAuthAudit: (f: Partial<AccountAuditFilter>) =>
    call(() => listAuthAuditFn({ data: { page: 1, ...f } })),

  // Super Admin: staff invitations
  listTeam: () => call(() => listTeamFn()),
  createInvitation: (p: CreateInvitationInput) => call(() => createInvitationFn({ data: p })),
  resendInvitation: (invitation_id: string) =>
    call(() => resendInvitationFn({ data: { invitation_id } })),
  copyInvitationLink: (invitation_id: string) =>
    call(() => copyInvitationLinkFn({ data: { invitation_id } })),
  revokeInvitation: (invitation_id: string) =>
    call(() => revokeInvitationFn({ data: { invitation_id } })),

  // Invitee
  previewInvitation: (token: string) => call(() => previewInvitationFn({ data: { token } })),
  acceptInvitation: (p: AcceptInvitationInput) => call(() => acceptInvitationFn({ data: p })),
};
