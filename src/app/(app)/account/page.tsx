import { redirect } from "next/navigation";

/**
 * /account — redirect to /account/info
 */
export default function AccountPage() {
  redirect("/account/info");
}
