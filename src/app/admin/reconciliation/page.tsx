import { AdminPaymentShell } from "@/components/payments/admin-payment-shell";
import { AdminPaymentReview } from "@/components/payments/admin-payment-review";

export default function AdminReconciliationPage() {
  return <AdminPaymentShell><AdminPaymentReview /></AdminPaymentShell>;
}
