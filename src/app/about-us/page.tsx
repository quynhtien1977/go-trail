import Link from "next/link";
import { Navbar } from "@/components/ui/navbar";

export const metadata = {
  title: "Giới thiệu Go Trail — Về Chúng Tôi",
  description: "Khám phá sứ mệnh và hành trình của Go Trail kết nối cộng đồng yêu thiên nhiên qua các chuyến bus trekking cuối tuần.",
};

export default function AboutUsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white text-[#212529] font-sans antialiased">
      <Navbar />

      <main className="flex-1 pt-[102px]">
        {/* Banner Header */}
        <section className="bg-black text-white py-20 px-4 text-center relative overflow-hidden">
          <div className="max-w-[1000px] mx-auto space-y-4">
            <span className="inline-block px-4 py-1 rounded-full bg-[#FEBB02] text-black text-xs font-black uppercase tracking-wider">
              About Go Trail
            </span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight">
              KẾT NỐI BẠN VỚI NHỮNG HÀNH TRÌNH XANH
            </h1>
            <p className="text-neutral-400 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
              Go Trail ra đời để mang đến những chuyến xe bus kết nối bạn với những cung đường dã ngoại – nơi bạn có thể hít thở không khí trong lành, vận động cơ thể và tìm lại năng lượng tái tạo.
            </p>
          </div>
        </section>

        {/* Story Section */}
        <section className="py-[95px] max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6 space-y-6 text-neutral-700 text-base leading-relaxed">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-black">
                Câu chuyện Go Trail
              </h2>
              <p>
                Bạn có tin vào những cung trails giữa thiên nhiên mang lại khả năng tái tạo năng lượng? Bạn tìm kiếm một ngày để bước lên những cung trails, được hồi phục sau những nhịp đập hối hả của công việc và được thấy nguồn cảm hứng mới?
              </p>
              <p>
                Go Trail không chỉ là một hành trình di chuyển bằng xe bus thông thường. Chúng tôi mong muốn xây dựng một thói quen mới cho cộng đồng – nơi cuối tuần không còn bó hẹp trong những quán cà phê hay màn hình điện thoại.
              </p>
              <p>
                Mà là những bước chân trên những con đường mòn, những cuộc trò chuyện bên rừng cây, và những khoảnh khắc thực sự thuộc về chính mình với sự đồng hành an toàn từ Leader 1:15.
              </p>
            </div>

            <div className="lg:col-span-6">
              <div className="rounded-2xl overflow-hidden shadow-xl border border-neutral-200">
                <img
                  src="https://anqtlegcsrqzqenytrjo.supabase.co/storage/v1/object/public/gotrail-media/KVBUS-3.jpg"
                  alt="Go Trail Community"
                  className="w-full h-auto object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Why Choose Section (Reusing tokens & icons) */}
        <section className="py-[95px] bg-[#EEEEEE]">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-black uppercase tracking-tight">
                TẠI SAO NÊN CHỌN GO TRAIL
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 text-center">
              <div className="bg-white p-6 rounded-2xl shadow-sm space-y-3 flex flex-col items-center">
                <img src="/ref/i-lichtrinh.svg" alt="Lịch trình" className="w-16 h-16" />
                <h3 className="font-bold text-lg text-black">Không lo lịch trình</h3>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  Chỉ cần đặt vé, lên xe và tận hưởng chuyến đi, không cần tự lái hay lo tìm đường.
                </p>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm space-y-3 flex flex-col items-center">
                <img src="/ref/i-cauchuyen.svg" alt="Câu chuyện" className="w-16 h-16" />
                <h3 className="font-bold text-lg text-black">Mỗi tuần một câu chuyện</h3>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  Mỗi tuyến trail là một trải nghiệm riêng biệt với cảnh sắc và những người bạn mới.
                </p>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm space-y-3 flex flex-col items-center">
                <img src="/ref/i-thechinhphuc.svg" alt="Thẻ Chinh Phục" className="w-16 h-16" />
                <h3 className="font-bold text-lg text-black">Thẻ Chinh Phục</h3>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  Thiết kế riêng cho từng cung đường, kèm in tên bạn để ghi dấu kỷ niệm độc bản.
                </p>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm space-y-3 flex flex-col items-center">
                <img src="/ref/i-thoiquensong.svg" alt="Thói quen" className="w-16 h-16" />
                <h3 className="font-bold text-lg text-black">Thói quen sống xanh</h3>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  Cuối tuần kết nối thiên nhiên, vận động cơ thể và làm mới tinh thần tích cực.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 text-center bg-white">
          <div className="max-w-[800px] mx-auto px-4 space-y-6">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-black">
              Sẵn sàng cho chuyến dã ngoại cuối tuần này?
            </h2>
            <p className="text-neutral-600 text-base">
              Đặt vé ngay để giữ chỗ trên chuyến xe bus gần nhất cùng Go Trail.
            </p>
            <div className="pt-2">
              <Link
                href="/#system-trailbus"
                className="inline-block px-8 py-3.5 rounded-full bg-[#FEBB02] hover:bg-[#E5A800] text-black font-extrabold text-sm uppercase tracking-wider transition-transform hover:scale-105 shadow-md"
              >
                Khám phá các tuyến xe
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="footer bg-[#111111] text-white py-12 border-t border-neutral-800">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 pb-8">
            <div className="lg:col-span-6 space-y-4">
              <img src="/ref/logo.png" alt="Go Trail" width={170} height={80} className="h-14 w-auto object-contain" />
              <div className="space-y-2 text-xs text-neutral-300">
                <div className="flex items-start gap-2">
                  <img src="/ref/i-location.svg" alt="address" className="w-4 h-4 mt-0.5" />
                  <span>Trường Đại học Sài Gòn - SGU</span>
                </div>
                <div className="flex items-center gap-2">
                  <img src="/ref/i-email.svg" alt="email" className="w-4 h-4" />
                  <a href="mailto:quynhtien123123@gmail.com" className="hover:text-[#FEBB02]">quynhtien123123@gmail.com</a>
                </div>
                <div className="flex items-center gap-2">
                  <img src="/ref/i-phone.svg" alt="phone" className="w-4 h-4" />
                  <a href="tel:0972699242" className="hover:text-[#FEBB02]">0972699242</a>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 flex flex-col justify-end items-start lg:items-end space-y-3">
              <span className="text-xs font-bold uppercase text-neutral-400">Kết nối với Go Trail</span>
              <div className="flex items-center gap-3">
                <a href="https://www.facebook.com/tienan.nguyen.33821/" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center hover:bg-[#FEBB02]">
                  <img src="/ref/i-fb.svg" alt="Facebook" className="w-4 h-4" />
                </a>
                <a href="https://www.instagram.com/_tienann_/" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center hover:bg-[#FEBB02]">
                  <img src="/ref/i-ins.svg" alt="Instagram" className="w-4 h-4" />
                </a>
                <a href="https://zalo.me/0972699242" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center hover:bg-[#FEBB02]">
                  <img src="/ref/i-zalo.svg" alt="Zalo" className="w-4 h-4" />
                </a>
                <a href="#" className="w-16 h-8 rounded-full bg-neutral-800 flex items-center justify-center hover:bg-[#FEBB02]">
                  <img src="/ref/i-strava.svg" alt="Strava" className="h-4 w-auto" />
                </a>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-neutral-800 text-center sm:text-left sm:flex sm:items-center sm:justify-between text-xs text-neutral-500">
            <div className="flex items-center justify-center sm:justify-start gap-2 text-neutral-300 mb-4 sm:mb-0">
              <img src="/ref/logo-toong.svg" alt="Tổ Ong Adventure" width={36} height={34} className="h-8 w-auto" />
              <span className="font-semibold">Thành viên của Tổ Ong Adventure</span>
            </div>
            <div>
              <p>Copyright © 2026 Go Trail. Công ty TNHH Khám Phá Trải Nghiệm Tổ Ong.</p>
              <p className="text-[#FEBB02] font-semibold mt-1">
                Đồ án học phần — không phải trang chính thức của Go Trail.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
