// The landing page's only server call. Unauthenticated by design; see public-batch.server.ts.
import { createServerFn } from "@tanstack/react-start";

export const publicBatchStatusFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getPublicBatchStatus } = await import("@/server/public-batch.server");
  return getPublicBatchStatus();
});
