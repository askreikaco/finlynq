/**
 * Feedback-attachment storage path (SERVER-ONLY: node `path`). The pure policy (denylist, size cap,
 * validator) lives in ./attachment-policy so client components can import it without pulling node
 * built-ins into the browser bundle; it is re-exported here so server callers keep one import.
 */

import path from "path";
import { getUploadsBaseDir } from "@/lib/uploads-dir";

export * from "./attachment-policy";

/**
 * Resolve the on-disk storage path for a feedback attachment under the DURABLE
 * uploads root (getUploadsBaseDir — OUTSIDE `.next`, so it survives a deploy):
 * `<base>/feedback/<userId>/<uuid>.<ext>`. The directory is keyed on the thread
 * OWNER's userId for ALL messages (seed + user + admin replies), so a wipe can
 * find every file by owner; authorship is tracked in the DB row, not the path.
 */
export function feedbackAttachmentPath(
  userId: string,
  id: string,
  ext: string,
): { dir: string; file: string } {
  const dir = path.join(getUploadsBaseDir(), "feedback", userId);
  return { dir, file: path.join(dir, `${id}.${ext}`) };
}
