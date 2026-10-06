import { isCategoriesMergedEnabled } from "@/lib/categories/flag";

export async function GET() {
  return Response.json({
    enabled: isCategoriesMergedEnabled(),
  });
}
