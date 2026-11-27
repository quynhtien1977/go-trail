import { BackOfficeShell } from "@/components/accounts/back-office-shell";
import { AdminPaymentReview } from "@/components/payments/admin-payment-review";

export default function AdminReconciliationPage() {
  return <BackOfficeShell active="reconciliation" title="Đối soát thanh toán"><AdminPaymentReview /></BackOfficeShell>;
}
