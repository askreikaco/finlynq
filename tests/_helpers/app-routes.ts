import * as fs from "fs";
import * as path from "path";
import { routeFromPageFile } from "@/components/mobile/fab-registry";

export const APP_DIR = "src/app/(app)";

/** Route pattern of every page.tsx under src/app/(app), e.g. "/transactions/[id]/edit". */
export function pageRoutesOnDisk(): string[] {
  const files = fs.readdirSync(APP_DIR, { recursive: true }) as string[];
  return files
    .map((f) => f.split(path.sep).join("/"))
    // exact basename: "_components/link-page.tsx" is a component, not a route
    .filter((f) => path.posix.basename(f) === "page.tsx")
    .map((f) => routeFromPageFile(`${APP_DIR}/${f}`));
}
