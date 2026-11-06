import { Navbar } from "@/components/ui/navbar";
import { Footer } from "@/components/ui/footer";
import { InvoicePayment } from "@/components/booking/invoice-payment";

export default async function InvoicePaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FA] text-[#212529]">
      <Navbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-12 pt-[126px] sm:px-6">
        <InvoicePayment key={id} invoiceId={id} />
      </main>
      <Footer />
    </div>
  );
}
