// Server functions for the System Admin's mailbox. Each one checks `mailbox.send` inside the
// server module, so the permission is enforced on the call and not just on the menu.
import { createServerFn } from "@tanstack/react-start";
import { campaignIdInput, composeInput, previewInput } from "@/lib/mailbox.schemas";

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
