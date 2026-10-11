"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/ui/navbar";
import { GOTRAIL_TOURS } from "@/lib/fixtures/tours";
import { ChevronDown, ChevronUp } from "lucide-react";

interface FaqItem {
  q: string;
  a: string;
}

const FAQS: FaqItem[] = [
  {
    q: "Có người hướng dẫn hoặc leader dẫn đoàn không?",
    a: "Tùy vào tuyến trail bạn đăng ký, chúng tôi sẽ cung cấp người hướng dẫn để đảm bảo an toàn và chia sẻ kinh nghiệm cho bạn về thiên nhiên và đặc điểm của từng nơi khác nhau.",
  },
  {
    q: "Có thể đổi hoặc hủy vé sau khi đặt chỗ không?",
    a: "Chính sách hoàn vé và đổi vé phụ thuộc vào điều kiện của từng tuyến trail. Vui lòng liên hệ hotline để biết thêm chi tiết.",
  },
  {
    q: "Trail bus này phù hợp cho người mới không? Có khó không?",
    a: "Chúng tôi thiết kế các tuyến trail phù hợp cho cả người mới và người có kinh nghiệm. Bạn có thể chọn level phù hợp với bản thân.",
  },
  {
    q: "Xe bus đón khách ở đâu? Có nhiều điểm đón không?",
    a: "Chúng tôi có nhiều điểm đón khách khác nhau, giúp bạn dễ dàng chọn vị trí phù hợp nhất.",
  },
];

export default function Home() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="min-h-screen flex flex-col bg-white text-[#212529] font-sans antialiased selection:bg-[#FEBB02] selection:text-black">
      {/* 1. HEADER (Fixed, 102px, Black, Authentic Logo, Mega Menu, Auth) */}
      <Navbar />

      <main className="flex-1">
        {/* =========================================================================
            2. SECTION BANNER (KEY VISUAL KVBUS.png 1:1, NO BUS SEARCH WIDGET)
            ========================================================================= */}
        <section className="section-banner pt-[102px] bg-black w-full overflow-hidden">
          <img
            src="https://anqtlegcsrqzqenytrjo.supabase.co/storage/v1/object/public/gotrail-media/KVBUS.png"
            alt="Go Trail - Your Weekend Trail"
            className="w-full h-auto block object-cover"
          />
        </section>

        {/* =========================================================================
            3. SECTION INSPIRE (LOGO TRAILBUS, 3 PARAGRAPHS, KVBUS-3.jpg)
            ========================================================================= */}
        <section
          className="section-inspire py-[95px] relative bg-cover bg-center"
          style={{
            backgroundImage: "url('/ref/topo-gotrail-2.svg')",
            backgroundColor: "#FFFFFF",
          }}
        >
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h1 className="flex justify-center">
                <img
                  src="/ref/logo-trailbus.svg"
                  alt="Trail Bus Logo"
                  className="h-16 sm:h-20 w-auto object-contain"
                />
              </h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              {/* Left Column: 3 Paragraphs (Verbatim) */}
              <div className="lg:col-span-6 space-y-6 text-neutral-800 text-[16px] leading-[1.75]">
                <p>
                  Bạn có tin vào những cung trails giữa thiên nhiên mang lại khả năng tái tạo năng
                  lượng? Bạn tìm kiếm một ngày để bước lên những cung trails, được hồi phục sau
                  những nhịp đập hối hả của công việc và được thấy nguồn cảm hứng mới?
                </p>
                <p>
                  Go Trail ra đời để mang đến những chuyến xe kết nối bạn với những cung đường xanh –
                  nơi bạn có thể hít thở không khí trong lành, vận động cơ thể và tận hưởng sự tự do
                  giữa thiên nhiên.
                </p>
                <p>
                  Không chỉ là một hành trình di chuyển, Go Trail mong muốn xây dựng một thói quen
                  mới cho cộng đồng – nơi cuối tuần không còn bó hẹp trong những quán cà phê hay màn
                  hình điện thoại. Mà là những bước chân trên những con đường mòn, những cuộc trò
                  chuyện bên rừng cây, và những khoảnh khắc thực sự thuộc về chính mình.
                </p>
              </div>

              {/* Right Column: KVBUS-3.jpg image */}
              <div className="lg:col-span-6">
                <div className="relative rounded-2xl overflow-hidden shadow-xl border border-neutral-200">
                  <img
                    src="https://anqtlegcsrqzqenytrjo.supabase.co/storage/v1/object/public/gotrail-media/KVBUS-3.jpg"
                    alt="Go Trail Bus Community"
                    className="w-full h-auto object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            4. SECTION REGION (#YourWeekendtrail, mapvn.svg, Tags by Region)
            ========================================================================= */}
        <section
          className="section-region py-[95px] relative bg-cover bg-center"
          style={{
            backgroundImage: "url('/ref/topo2.svg')",
            backgroundColor: "#FFFFFF",
          }}
        >
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              {/* Left Column: Title, Description, Region Tags */}
              <div className="lg:col-span-7 order-2 lg:order-1 space-y-8">
                <div>
                  <h2 className="text-4xl sm:text-5xl lg:text-[70px] font-tharon leading-none text-[#121212] mb-4 tracking-tight">
                    <span className="text-[#FEBB02]">#</span>YourWeekend
                    <span className="text-[#4CA62F]">trail</span>
                  </h2>
                  <p className="text-base sm:text-lg text-neutral-700 leading-relaxed max-w-2xl">
                    Cách trung tâm Hà Nội và TP.HCM không quá 5 tiếng di chuyển, những chuyến trail bus
                    của chúng tôi sẽ đưa và đón bạn về trong vòng 24 giờ, phù hợp với bất cứ nhu cầu di
                    chuyển và khám phá cho cuối tuần của bạn.
                  </p>
                </div>

                <div className="space-y-6">
                  {/* Miền Nam */}
                  <div className="space-y-3">
                    <div className="inline-block px-4 py-1.5 rounded-full bg-[#186734] text-white font-extrabold text-sm uppercase tracking-wider">
                      MIỀN NAM
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      <a
                        href="#system-trailbus"
                        className="px-4 py-2 rounded-full border border-neutral-300 bg-white hover:bg-[#FEBB02] hover:border-[#FEBB02] hover:text-black font-semibold text-sm transition-all"
                      >
                        Chứa Chan
                      </a>
                      <a
                        href="#system-trailbus"
                        className="px-4 py-2 rounded-full border border-neutral-300 bg-white hover:bg-[#FEBB02] hover:border-[#FEBB02] hover:text-black font-semibold text-sm transition-all"
                      >
                        Cát Tiên
                      </a>
                      <a
                        href="#system-trailbus"
                        className="px-4 py-2 rounded-full border border-neutral-300 bg-white hover:bg-[#FEBB02] hover:border-[#FEBB02] hover:text-black font-semibold text-sm transition-all"
                      >
                        Núi Dinh
                      </a>
                      <a
                        href="#system-trailbus"
                        className="px-4 py-2 rounded-full border border-neutral-300 bg-white hover:bg-[#FEBB02] hover:border-[#FEBB02] hover:text-black font-semibold text-sm transition-all"
                      >
                        Ngũ Long
                      </a>
                      <a
                        href="#system-trailbus"
                        className="px-4 py-2 rounded-full border border-neutral-300 bg-white hover:bg-[#FEBB02] hover:border-[#FEBB02] hover:text-black font-semibold text-sm transition-all"
                      >
                        Đá Vách
                      </a>
                      <span className="px-4 py-2 rounded-full border border-dashed border-neutral-300 text-neutral-400 text-sm">
                        XX/2025
                      </span>
                    </div>
                  </div>

                  {/* Miền Bắc */}
                  <div className="space-y-3">
                    <div className="inline-block px-4 py-1.5 rounded-full bg-neutral-800 text-white font-extrabold text-sm uppercase tracking-wider">
                      MIỀN BẮC
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      <a
                        href="#system-trailbus"
                        className="px-4 py-2 rounded-full border border-neutral-300 bg-white hover:bg-[#FEBB02] hover:border-[#FEBB02] hover:text-black font-semibold text-sm transition-all"
                      >
                        Cúc Phương
                      </a>
                      <a
                        href="#system-trailbus"
                        className="px-4 py-2 rounded-full border border-neutral-300 bg-white hover:bg-[#FEBB02] hover:border-[#FEBB02] hover:text-black font-semibold text-sm transition-all"
                      >
                        Đà Bắc
                      </a>
                      <span className="px-4 py-2 rounded-full border border-dashed border-neutral-300 text-neutral-400 text-sm">
                        XX/2025
                      </span>
                      <span className="px-4 py-2 rounded-full border border-dashed border-neutral-300 text-neutral-400 text-sm">
                        XX/2025
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Map Image */}
              <div className="lg:col-span-5 order-1 lg:order-2 flex justify-center">
                <img
                  src="/ref/mapvn.svg"
                  alt="Bản đồ các tuyến Go Trail"
                  className="w-full max-w-[440px] h-auto object-contain drop-shadow-md"
                />
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            5. SECTION TRAILBUS (HỆ THỐNG TRAIL BUS CHO BẠN - SINGLE GRID 100% GỐC)
            ========================================================================= */}
        <section
          id="system-trailbus"
          className="section-trailbus py-[95px] relative"
          style={{
            backgroundColor: "#9ACE7D",
            backgroundImage: "url('/ref/topo-2.svg')",
            backgroundRepeat: "repeat",
          }}
        >
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl lg:text-[35px] font-extrabold text-black uppercase tracking-tight">
                HỆ THỐNG TRAIL BUS CHO BẠN
              </h2>
            </div>

            {/* Single Grid of Tours (Authentic gotrail.vn) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {GOTRAIL_TOURS.map((tour) => (
                <div
                  key={tour.slug}
                  className="tour-card bg-white rounded-[16px] overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-col group border border-neutral-100"
                >
                  {/* Tour Image */}
                  <div className="relative h-[245px] w-full overflow-hidden bg-neutral-200">
                    <img
                      src={tour.img}
                      alt={tour.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>

                  {/* Tour Content */}
                  <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      <h3 className="text-xl font-bold text-neutral-900 group-hover:text-[#4CA62F] transition-colors mb-2">
                        {tour.title}
                      </h3>

                      {/* Tags */}
                      {tour.tags && tour.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {tour.tags.map((tag, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EBF5E7] text-[#186734] text-xs font-semibold"
                            >
                              <img src="/ref/i-check.svg" alt="check" className="w-3.5 h-3.5" />
                              <span>{tag}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* 4 Rows Specs */}
                      <div className="space-y-2 text-sm text-neutral-700 pt-2 border-t border-neutral-100">
                        <div className="flex items-center gap-2.5">
                          <img src="/ref/i-clock.svg" alt="clock" className="w-[18px] h-[17px]" />
                          <span>
                            <strong className="text-neutral-900">Thời Gian: </strong>
                            {tour.time}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <img src="/ref/i-car.svg" alt="distance" className="w-[21px] h-[15px]" />
                          <span>
                            <strong className="text-neutral-900">Độ Dài: </strong>
                            {tour.length}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <img src="/ref/i-do-kho.svg" alt="difficulty" className="w-[21px] h-[14px]" />
                          <span className="flex items-center gap-2">
                            <strong className="text-neutral-900">Độ khó: </strong>
                            <img
                              src={tour.difficultyIcon}
                              alt="dokho"
                              className="h-[14px] w-auto inline-block"
                            />
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <img src="/ref/i-do-cao-dinh.svg" alt="elevation" className="w-[21px] h-[20px]" />
                          <span>
                            <strong className="text-neutral-900">Độ cao đỉnh: </strong>
                            {tour.height}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Price and Action */}
                    <div className="pt-4 border-t border-neutral-100 flex items-end justify-between">
                      <div>
                        {tour.oldPrice && tour.oldPrice !== tour.newPrice && (
                          <div className="text-xs text-neutral-400 line-through mb-0.5">
                            {tour.oldPrice}
                          </div>
                        )}
                        <div className="text-xs text-neutral-500 font-bold">
                          Giá vé:{" "}
                          <span className="text-lg font-black text-red-600 block sm:inline">
                            {tour.newPrice}
                          </span>
                        </div>
                      </div>

                      <a
                        href={`https://gotrail.vn/bus/${tour.slug}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 rounded-full bg-[#FEBB02] hover:bg-[#E5A800] text-black font-extrabold text-xs uppercase tracking-wider transition-transform hover:scale-105"
                      >
                        Đặt vé
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* =========================================================================
            6. SECTION WHY CHOOSE (TẠI SAO NÊN CHỌN GO TRAIL - 4 ICONS)
            ========================================================================= */}
        <section className="section-whychoose py-[95px] bg-white">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-2xl sm:text-3xl lg:text-[35px] font-extrabold text-black uppercase tracking-tight">
                TẠI SAO NÊN CHỌN GO TRAIL
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 text-center">
              {/* Feature 1 */}
              <div className="space-y-4 flex flex-col items-center">
                <div className="w-20 h-20 rounded-full flex items-center justify-center">
                  <img
                    src="/ref/i-lichtrinh.svg"
                    alt="Không lo lịch trình"
                    className="w-16 h-16 object-contain"
                  />
                </div>
                <h3 className="text-xl font-bold text-neutral-900">Không lo lịch trình</h3>
                <p className="text-sm text-neutral-600 leading-relaxed max-w-xs">
                  Chỉ cần đặt vé, lên xe và tận hưởng chuyến đi, bạn không cần tự lái hay lo tìm
                  đường, chuẩn bị quá nhiều.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="space-y-4 flex flex-col items-center">
                <div className="w-20 h-20 rounded-full flex items-center justify-center">
                  <img
                    src="/ref/i-cauchuyen.svg"
                    alt="Mỗi tuần, một câu chuyện"
                    className="w-16 h-16 object-contain"
                  />
                </div>
                <h3 className="text-xl font-bold text-neutral-900">Mỗi tuần, một câu chuyện</h3>
                <p className="text-sm text-neutral-600 leading-relaxed max-w-xs">
                  Mỗi tuyến trail là một trải nghiệm riêng, với những cảnh sắc khác biệt và những
                  người bạn mới.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="space-y-4 flex flex-col items-center">
                <div className="w-20 h-20 rounded-full flex items-center justify-center">
                  <img
                    src="/ref/i-thechinhphuc.svg"
                    alt="Thẻ Chinh Phục"
                    className="w-16 h-16 object-contain"
                  />
                </div>
                <h3 className="text-xl font-bold text-neutral-900">Thẻ Chinh Phục</h3>
                <p className="text-sm text-neutral-600 leading-relaxed max-w-xs">
                  Thẻ chinh phục thiết kế riêng cho từng cung đường, kèm in tên riêng của bạn để ghi
                  dấu kỷ niệm.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="space-y-4 flex flex-col items-center">
                <div className="w-20 h-20 rounded-full flex items-center justify-center">
                  <img
                    src="/ref/i-thoiquensong.svg"
                    alt="Thói quen sống xanh"
                    className="w-16 h-16 object-contain"
                  />
                </div>
                <h3 className="text-xl font-bold text-neutral-900">Thói quen sống xanh</h3>
                <p className="text-sm text-neutral-600 leading-relaxed max-w-xs">
                  Cuối tuần không còn loanh quanh thành phố, mà còn là cơ hội để khám phá, vận động và
                  làm mới bản thân.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            7. SECTION GALLERY (PANORAMA DÃ NGOẠI)
            ========================================================================= */}
        <section className="section-gallery w-full pb-[95px] overflow-hidden">
          <img
            src="https://anqtlegcsrqzqenytrjo.supabase.co/storage/v1/object/public/gotrail-media/gallery-pc.jpg"
            alt="Go Trail Gallery"
            className="w-full h-auto hidden lg:block"
          />
          <img
            src="https://anqtlegcsrqzqenytrjo.supabase.co/storage/v1/object/public/gotrail-media/gallery-sp.png"
            alt="Go Trail Gallery Mobile"
            className="w-full h-auto block lg:hidden"
          />
        </section>

        {/* =========================================================================
            8. SECTION FAQ (NHỮNG CÂU HỎI THƯỜNG GẶP - ACCORDION GỐC)
            ========================================================================= */}
        <section className="section-faq bg-[#EEEEEE] py-16 px-4 sm:px-8">
          <div className="max-w-[1280px] mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              {/* Left Column: Title and Hotline */}
              <div className="lg:col-span-4 space-y-4">
                <h2 className="text-3xl font-extrabold text-black uppercase leading-tight">
                  NHỮNG CÂU HỎI
                  <br />
                  THƯỜNG GẶP
                </h2>
                <p className="text-neutral-700 text-sm">
                  Tư vấn chi tiết liên hệ hotline
                  <br />
                  <span className="font-bold text-lg text-black">
                    0933 22 78 78 (Nhánh 3)
                  </span>
                </p>
              </div>

              {/* Right Column: Accordion */}
              <div className="lg:col-span-8 space-y-3">
                {FAQS.map((faq, idx) => {
                  const isOpen = openFaq === idx;
                  return (
                    <div
                      key={idx}
                      className="bg-white rounded-xl overflow-hidden border border-neutral-200 transition-all"
                    >
                      <button
                        type="button"
                        onClick={() => toggleFaq(idx)}
                        className="w-full p-5 text-left flex items-center justify-between font-bold text-base sm:text-lg text-neutral-900 hover:text-[#4CA62F] transition-colors"
                      >
                        <span>{faq.q}</span>
                        <span className="text-xl font-bold ml-4 text-neutral-500">
                          {isOpen ? "−" : "+"}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="px-5 pb-5 text-neutral-600 text-sm leading-relaxed border-t border-neutral-100 pt-3">
                          {faq.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            9. SECTION TEXT (SLOGAN TRUYỀN CẢM HỨNG)
            ========================================================================= */}
        <section className="section-text py-[95px] bg-white text-center">
          <div className="max-w-[1000px] mx-auto px-4">
            <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-neutral-800 leading-relaxed">
              Hãy để <strong className="text-black font-extrabold">GO TRAIL</strong> trở thành một
              phần trong cuộc sống của bạn – một tấm vé cho hành trình xanh, một thói quen cuối tuần
              đầy cảm hứng!🚍🌿
            </p>
          </div>
        </section>
      </main>

      {/* =========================================================================
          10. FOOTER (ĐẦY ĐỦ THÔNG TIN, PHÁP LÝ & DISCLAIMER ĐỒ ÁN)
          ========================================================================= */}
      <footer className="footer bg-[#111111] text-white py-12 border-t border-neutral-800">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Column 1: Logo & Company Info */}
            <div className="lg:col-span-4 space-y-6">
              <img
                src="/ref/logo.png"
                alt="Go Trail Logo"
                width={170}
                height={80}
                className="h-14 w-auto object-contain"
              />
              <p className="text-sm text-neutral-400 leading-relaxed">
                Cuối tuần này, bạn đã có vé chưa? Giữ chỗ ngay để không bỏ lỡ hành trình xanh khám
                phá cuối tuần này nhé!
              </p>

              <div className="space-y-2.5 text-xs text-neutral-400">
                <div className="flex items-start gap-2.5">
                  <img src="/ref/i-location.svg" alt="address" className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>53 Đường 2, KĐT Vạn Phúc, P. Hiệp Bình Phước, TP. Thủ Đức, TP. HCM</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <img src="/ref/i-email.svg" alt="email" className="w-4 h-4 shrink-0" />
                  <span>hello@gotrail.vn (Placeholder đồ án)</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <img src="/ref/i-phone.svg" alt="phone" className="w-4 h-4 shrink-0" />
                  <span>0933 22 78 78 (Nhánh 3)</span>
                </div>
              </div>

              {/* Social icons */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                  Kết nối với Go Trail
                </h4>
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center hover:bg-[#FEBB02] hover:text-black transition-colors cursor-pointer">
                    <img src="/ref/i-fb.svg" alt="Facebook" className="w-4 h-4" />
                  </span>
                  <span className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center hover:bg-[#FEBB02] hover:text-black transition-colors cursor-pointer">
                    <img src="/ref/i-ins.svg" alt="Instagram" className="w-4 h-4" />
                  </span>
                  <span className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center hover:bg-[#FEBB02] hover:text-black transition-colors cursor-pointer">
                    <img src="/ref/i-zalo.svg" alt="Zalo" className="w-4 h-4" />
                  </span>
                  <span className="w-16 h-8 rounded-full bg-neutral-800 flex items-center justify-center hover:bg-[#FEBB02] hover:text-black transition-colors cursor-pointer">
                    <img src="/ref/i-strava.svg" alt="Strava" className="h-4 w-auto" />
                  </span>
                </div>
              </div>
            </div>

            {/* Column 2: 4 Sub-Columns of Links */}
            <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-6 text-xs text-neutral-400">
              {/* Về Go Trail */}
              <div className="space-y-3">
                <h4 className="font-extrabold text-white text-sm">Về Go Trail</h4>
                <ul className="space-y-2">
                  <li>
                    <Link href="/about-us" className="hover:text-[#FEBB02] transition-colors">
                      Giới thiệu Go Trail
                    </Link>
                  </li>
                  <li>
                    <a href="#cong-tac-vien" className="hover:text-[#FEBB02] transition-colors">
                      Cộng tác viên
                    </a>
                  </li>
                </ul>
              </div>

              {/* Chính sách */}
              <div className="space-y-3">
                <h4 className="font-extrabold text-white text-sm">Chính sách đặt chỗ</h4>
                <ul className="space-y-2">
                  <li>
                    <a href="#" className="hover:text-[#FEBB02] transition-colors">
                      Chính sách bảo mật
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-[#FEBB02] transition-colors">
                      Điều kiện sử dụng Website
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-[#FEBB02] transition-colors">
                      Chính sách hoàn hủy
                    </a>
                  </li>
                </ul>
              </div>

              {/* Miền Nam */}
              <div className="space-y-3">
                <h4 className="font-extrabold text-white text-sm">Trail miền Nam</h4>
                <ul className="space-y-2">
                  <li>
                    <a href="#system-trailbus" className="hover:text-[#FEBB02] transition-colors">
                      Trail Bus – Pal Sol
                    </a>
                  </li>
                  <li>
                    <a href="#system-trailbus" className="hover:text-[#FEBB02] transition-colors">
                      Trail Bus – Bà Đen
                    </a>
                  </li>
                  <li>
                    <a href="#system-trailbus" className="hover:text-[#FEBB02] transition-colors">
                      Trail Bus – Chứa Chan
                    </a>
                  </li>
                  <li>
                    <a href="#system-trailbus" className="hover:text-[#FEBB02] transition-colors">
                      Trail Bus – Núi Dinh
                    </a>
                  </li>
                  <li>
                    <a href="#system-trailbus" className="hover:text-[#FEBB02] transition-colors">
                      Trail Bus – Thị Vải
                    </a>
                  </li>
                </ul>
              </div>

              {/* Miền Bắc */}
              <div className="space-y-3">
                <h4 className="font-extrabold text-white text-sm">Trail miền Bắc</h4>
                <ul className="space-y-2">
                  <li>
                    <a href="#system-trailbus" className="hover:text-[#FEBB02] transition-colors">
                      Trail Bus – Suối Cửa Tử
                    </a>
                  </li>
                  <li>
                    <a href="#system-trailbus" className="hover:text-[#FEBB02] transition-colors">
                      Trail Bus – Tam Đảo
                    </a>
                  </li>
                  <li>
                    <a href="#system-trailbus" className="hover:text-[#FEBB02] transition-colors">
                      Trail Bus – Ba Vì
                    </a>
                  </li>
                  <li>
                    <a href="#system-trailbus" className="hover:text-[#FEBB02] transition-colors">
                      Trail Bus – Hàm Lợn
                    </a>
                  </li>
                  <li>
                    <a href="#system-trailbus" className="hover:text-[#FEBB02] transition-colors">
                      Trail Bus – Cúc Phương
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Footer Bottom / Legal & Academic Disclaimer */}
          <div className="mt-12 pt-8 border-t border-neutral-800 text-xs text-neutral-500 space-y-2 text-center sm:text-left sm:flex sm:items-center sm:justify-between">
            <div className="flex items-center justify-center sm:justify-start gap-2 text-neutral-300">
              <img
                src="/ref/logo-toong.svg"
                alt="Tổ Ong Adventure"
                width={36}
                height={34}
                className="h-8 w-auto"
              />
              <span className="font-semibold">Thành viên của Tổ Ong Adventure</span>
            </div>

            <div className="space-y-1">
              <p>Copyright © 2026 Go Trail. Công ty TNHH Khám Phá Trải Nghiệm Tổ Ong.</p>
              <p className="text-[#FEBB02] font-semibold">
                ⚠️ Đồ án học phần — không phải trang chính thức của Go Trail.
              </p>
            </div>
          </div>
        </div>
      </footer>

      {/* =========================================================================
          11. NÚT NỔI ZALO & MESSENGER (BOTTOM 92px VÀ 20px, RIGHT 20px, 60x60)
          ========================================================================= */}
      <div className="fixed z-50 right-5 bottom-[92px] w-[60px] h-[60px] transition-transform hover:scale-110">
        <a
          href="#zalo-placeholder"
          title="Tư vấn Zalo (Đồ án placeholder)"
          className="block w-full h-full drop-shadow-xl"
        >
          <img src="/ref/ist-zalo.svg" alt="Zalo" className="w-full h-full" />
        </a>
      </div>

      <div className="fixed z-50 right-5 bottom-5 w-[60px] h-[60px] transition-transform hover:scale-110">
        <a
          href="#messenger-placeholder"
          title="Tư vấn Messenger (Đồ án placeholder)"
          className="block w-full h-full drop-shadow-xl"
        >
          <img src="/ref/ist-messenger.svg" alt="Messenger" className="w-full h-full" />
        </a>
      </div>
    </div>
  );
}
