import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { loadPaymentLedger } from "@/lib/services/paymentLedgerService";
import { PaymentLedger } from "@/components/payments/payment-ledger";

export default async function PaymentsPage({ searchParams }: {
  searchParams: Promise<{ month?: string; view?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { month, view } = await searchParams;
  // Preserve existing month links. Free-text searches are POST-only, never URL parameters.
  const validMonth = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : "all";
  const initial = await loadPaymentLedger(user, { month: validMonth, unassigned: view === "unassigned", category: view === "chargebacks" ? "CHARGEBACK" : "all" });
  return <PaymentLedger initial={initial} role={user.role} />;
}
