// Server functions for the System Admin's mailbox. Each one checks `mailbox.send` inside the
// server module, so the permission is enforced on the call and not just on the menu.
import { createServerFn } from "@tanstack/react-start";
import {
  batchDraftInput,
  campaignIdInput,
  composeInput,
  draftIdInput,
  draftInput,
  previewInput,
  sentMailInput,
} from "@/lib/mailbox.schemas";

const server = () => import("@/server/mailbox.server");

export const previewCampaignFn = createServerFn({ method: "POST" })
  .validator(previewInput)
  .handler(async ({ data }) => (await server()).previewCampaign(data));

export const countAllRecipientsFn = createServerFn({ method: "GET" }).handler(async () =>
  (await server()).countAllRecipients(),
);

export const sendCampaignFn = createServerFn({ method: "POST" })
  .validator(composeInput)
  .handler(async ({ data }) => (await server()).sendCampaign(data));

export const listCampaignsFn = createServerFn({ method: "GET" }).handler(async () =>
  (await server()).listCampaigns(),
);

export const listCampaignRecipientsFn = createServerFn({ method: "POST" })
  .validator(campaignIdInput)
  .handler(async ({ data }) => (await server()).listCampaignRecipients(data));

export const resumeCampaignFn = createServerFn({ method: "POST" })
  .validator(campaignIdInput)
  .handler(async ({ data }) => (await server()).resumeCampaign(data));

export const resendFailedMailFn = createServerFn({ method: "POST" })
  .validator(campaignIdInput)
  .handler(async ({ data }) => (await server()).resendFailedMail(data));

/** Every sent email, one row per recipient, for the flat history. */
export const listCampaignEmailsFn = createServerFn({ method: "GET" }).handler(async () =>
  (await server()).listCampaignEmails(),
);

export const listDraftsFn = createServerFn({ method: "GET" }).handler(async () =>
  (await server()).listDrafts(),
);

export const saveDraftFn = createServerFn({ method: "POST" })
  .validator(draftInput)
  .handler(async ({ data }) => (await server()).saveDraft(data));

export const deleteDraftFn = createServerFn({ method: "POST" })
  .validator(draftIdInput)
  .handler(async ({ data }) => (await server()).deleteDraft(data));

/** Which draft publishing a batch sends, or null for the standard booking email. */
export const setBatchDraftFn = createServerFn({ method: "POST" })
  .validator(batchDraftInput)
  .handler(async ({ data }) => (await server()).setBatchDraft(data));

export const previewDraftAsBatchFn = createServerFn({ method: "POST" })
  .validator(draftInput)
  .handler(async ({ data }) => (await server()).previewDraftAsBatch(data));

/** The messages sent to employees, one row per message: Mailbox sends and batch emails. */
export const listSentMailFn = createServerFn({ method: "GET" }).handler(async () =>
  (await server()).listSentMail(),
);

export const previewSentMailFn = createServerFn({ method: "POST" })
  .validator(sentMailInput)
  .handler(async ({ data }) => (await server()).previewSentMail(data));
