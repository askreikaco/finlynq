export const FAMILY_SHARE_PATH = "/family/share";

/**
 * Legacy deep link: /family?tab=sharing (the Sharing tab before it became /family/share) ->
 * /family/share with the other params kept. Never redirects an invite link (?token=...): that one
 * is handled on /family by InviteLinkHandler.
 */
export function legacySharingRedirect(search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.get("tab") !== "sharing" || params.has("token")) return null;
  params.delete("tab");
  const rest = params.toString();
  return rest ? `${FAMILY_SHARE_PATH}?${rest}` : FAMILY_SHARE_PATH;
}
