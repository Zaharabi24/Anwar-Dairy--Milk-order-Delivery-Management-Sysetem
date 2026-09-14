/** Only same-site paths are honoured, so a crafted sign-in link can't bounce users elsewhere. */
export const safeRedirect = (value: unknown) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : undefined;
