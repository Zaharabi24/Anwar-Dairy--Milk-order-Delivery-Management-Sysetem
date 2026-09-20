// Server functions for Publish Records (Factory Operator) and Email Records (System Admin).
// Read-only: each one checks its own permission inside the server module.
import { createServerFn } from "@tanstack/react-start";
import { emailRecordQuery, resumePublicationInput } from "@/lib/records.schemas";

const server = () => import("@/server/publish-records.server");

export const listPublishRecordsFn = createServerFn({ method: "GET" }).handler(async () =>
  (await server()).listPublishRecords(),
);

export const listEmailRecordsFn = createServerFn({ method: "POST" })
  .validator(emailRecordQuery)
  .handler(async ({ data }) => (await server()).listEmailRecords(data));

export const listPublishedBatchNumbersFn = createServerFn({ method: "GET" }).handler(async () =>
  (await server()).listPublishedBatchNumbers(),
);

export const resumePublicationMailFn = createServerFn({ method: "POST" })
  .validator(resumePublicationInput)
  .handler(async ({ data }) => (await server()).resumePublicationMail(data));
