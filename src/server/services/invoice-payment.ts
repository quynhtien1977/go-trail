import "server-only";
import type { InvoicePayment } from "@/schemas/invoice";

type PaymentSource = { status: string; expires_at: Date; total_amount: string; payment_code: string };

// Build only a URL; do not send bank/customer data to a third party from the server.
// https://docs.sepay.vn/tao-qr-code-vietqr-dong.html
export function invoicePayment(invoice: PaymentSource, now: Date): InvoicePayment {
  if (invoice.status === "Expired") return { status: "Expired" };
  if (invoice.status !== "Pending") return { status: "NotPayable" };
  if (invoice.expires_at.getTime() <= now.getTime()) return { status: "Expired" };

  // Lazy, allowlisted configuration: invoice history remains readable before setup.
  const bank_id = process.env.BANK_ID?.trim() ?? "";
  const account_number = process.env.BANK_ACCOUNT_NUMBER?.trim() ?? "";
  const account_name = process.env.BANK_ACCOUNT_NAME?.trim().toUpperCase() ?? "";
  if (!/^[A-Za-z0-9]{2,40}$/.test(bank_id) || !/^[A-Za-z0-9]{1,19}$/.test(account_number)
    || !/^[\x20-\x7e]{1,80}$/.test(account_name)
    // VietQR transfer amounts have at most 13 digits; never round/truncate money.
    || !/^[1-9]\d{0,12}$/.test(invoice.total_amount) || !/^[A-Za-z0-9]{1,50}$/.test(invoice.payment_code)) {
    return { status: "Unavailable" };
  }
  const query = new URLSearchParams({ acc: account_number, bank: bank_id, amount: invoice.total_amount,
    des: invoice.payment_code, holder: account_name, template: "compact" });
  return { status: "Ready", bank_id, account_number, account_name, amount: invoice.total_amount,
    transfer_content: invoice.payment_code, qr_url: `https://vietqr.app/img?${query}` };
}
