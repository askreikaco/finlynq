import { getDisplayLocale } from "@/lib/locale";
export const formatLocaleQty = (n: number) => n.toLocaleString(getDisplayLocale(), { maximumFractionDigits: 4 });
