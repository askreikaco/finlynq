import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";

const SETTING_KEY = "confirm_csv_mapping";

/** Read the per-user default. Defaults to true (confirm ON) when unset. */
export async function getConfirmCsvMappingDefault(userId: string): Promise<boolean> {
  const row = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(
      and(
        eq(schema.settings.key, SETTING_KEY),
        eq(schema.settings.userId, userId),
      ),
    )
    .get();
  // Unset → default ON (the new safe behavior). Only an explicit "false"
  // opts out.
  return row?.value !== "false";
}
