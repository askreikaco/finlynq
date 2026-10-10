import * as fs from "fs";
import * as path from "path";
import { routeFromPageFile } from "@/components/mobile/fab-registry";

export const APP_DIR = "src/app/(app)";

/** Route pattern of every page.tsx under src/app/(app), e.g. "/transactions/[id]/edit". */
export function pageRoutesOnDisk(): string[] {
  const files = fs.readdirSync(APP_DIR, { recursive: true }) as string[];
  return files
    .map((f) => f.split(path.sep).join("/"))
    .filter((f) => f.endsWith("page.tsx"))
    .map((f) => routeFromPageFile(`${APP_DIR}/${f}`));
}
