import { isCategoriesMergedEnabled } from "@/lib/categories/flag";
import CategoriesPageContent from "./_page-content";

export default function CategoriesPage() {
  const isMerged = isCategoriesMergedEnabled();
  return <CategoriesPageContent isMerged={isMerged} />;
}
