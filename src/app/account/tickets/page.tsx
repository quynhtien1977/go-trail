import { Navbar } from "@/components/ui/navbar";
import { Footer } from "@/components/ui/footer";
import { CustomerTickets } from "@/components/payments/customer-tickets";

export default function CustomerTicketsPage() {
  return <div className="flex min-h-screen flex-col bg-[#F8F9FA] text-[#212529]"><Navbar /><main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-12 pt-[126px] sm:px-6"><CustomerTickets /></main><Footer /></div>;
}
