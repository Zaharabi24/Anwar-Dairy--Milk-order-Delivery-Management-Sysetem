// Server functions for Publish Records (Factory Operator) and Email Records (System Admin).
// Read-only: each one checks its own permission inside the server module.
import { createServerFn } from "@tanstack/react-start";
import { emailRecordQuery, resendEmailsInput, resumePublicationInput } from "@/lib/records.schemas";

const server = () => import("@/server/publish-records.server");

export const listPublishRecordsFn = createServerFn({ method: "GET" }).handler(async () =>
  (await server()).listPublishRecords(),
);

export const listEmailRecordsFn = createServerFn({ method: "POST" })
  .validator(emailRecordQuery)
  .handler(async ({ data }) => (await server()).listEmailRecords(data));

/** The same list, for the Factory Operator reading the delivery of a batch they published. */
export const listBatchEmailsFn = createServerFn({ method: "POST" })
  .validator(emailRecordQuery)
  .handler(async ({ data }) => (await server()).listBatchEmails(data));

export const listPublishedBatchNumbersFn = createServerFn({ method: "GET" }).handler(async () =>
  (await server()).listPublishedBatchNumbers(),
);

export const resumePublicationMailFn = createServerFn({ method: "POST" })
  .validator(resumePublicationInput)
  .handler(async ({ data }) => (await server()).resumePublicationMail(data));

export const resendFailedBatchMailFn = createServerFn({ method: "POST" })
  .validator(resumePublicationInput)
  .handler(async ({ data }) => (await server()).resendFailedBatchMail(data));

/** The outstanding failures, for the Resend tab. */
export const listFailedEmailsFn = createServerFn({ method: "POST" })
  .validator(emailRecordQuery)
  .handler(async ({ data }) => (await server()).listFailedEmails(data));

/** Resends the chosen failures, each as a new attempt. System Admin and Super Admin. */
export const resendEmailsFn = createServerFn({ method: "POST" })
  .validator(resendEmailsInput)
  .handler(async ({ data }) => (await server()).resendEmails(data));
