import { TransactionEntryScreen } from "@/components/transactions/entry/transaction-entry-screen";

export default function MobileTransactionPage() {
  return <TransactionEntryScreen mode={{ kind: "create" }} />;
}
