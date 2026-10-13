"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Navbar } from "@/components/ui/navbar";
import { GOTRAIL_TOURS } from "@/lib/fixtures/tours";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
  const carouselRef = useRef<HTMLDivElement>(null);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const scrollCarousel = (direction: "left" | "right") => {
    if (carouselRef.current) {
      const scrollAmount = 400;
      carouselRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
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
            3. SECTION INSPIRE (LOGO TRAILBUS, 3 PARAGRAPHS CENTERED, IMAGE KVBUS-3.jpg BELOW)
            ========================================================================= */}
        <section
          className="section-inspire py-[95px] relative bg-cover bg-top"
          style={{
            backgroundImage: "url('/ref/topo-gotrail-2.svg'), url('/ref/topo2.svg')",
            backgroundColor: "#FFFFFF",
          }}
        >
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
            {/* Logo gotrail / trailbus centered */}
            <div className="text-center mb-8">
              <h1 className="flex justify-center">
                <img
                  src="/ref/logo-trailbus.svg"
                  alt="Go Trail"
                  className="h-[72px] w-auto object-contain mx-auto"
                />
              </h1>
            </div>

            {/* Box Info: Text centered at top, Image centered below (bám sát cấu trúc gotrail gốc) */}
            <div className="flex flex-col items-center">
              {/* 3 Paragraphs (Verbatim) - Centered */}
              <div className="max-w-[960px] text-center space-y-6 text-[#212529] text-[18px] leading-[1.8] font-normal">
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

              {/* KVBUS-3.jpg image: centered below the 3 paragraphs */}
              <div className="mt-12 w-full max-w-[1146px]">
                <div className="relative rounded-[8px] overflow-hidden shadow-xl border border-neutral-200">
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
            4. SECTION REGION (#YourWeekendtrail, mapvn.svg, Tags by Region matching fe-styles.css)
            ========================================================================= */}
        <section
          className="section-region py-[95px] relative bg-cover bg-top"
          style={{
            backgroundImage: "url('/ref/topo2.svg')",
            backgroundColor: "#FFFFFF",
          }}
        >
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Left Column: Heading, Description, Region Container */}
              <div className="lg:col-span-7 order-2 lg:order-1 space-y-6">
                <div>
                  <h2 className="text-4xl sm:text-5xl lg:text-[70px] font-tharon leading-none text-[#121212] mb-5 tracking-tight">
                    <span className="text-[#FFC107]">#</span>YourWeekend
                    <span className="text-[#FFC107]">trail</span>
                  </h2>
                  <p className="text-[18px] text-[#212529] leading-relaxed mb-10 max-w-2xl">
                    Cách trung tâm Hà Nội và TP.HCM không quá 5 tiếng di chuyển, những chuyến trail bus
                    của chúng tôi sẽ đưa và đón bạn về trong vòng 24 giờ, phù hợp với bất cứ nhu cầu di
                    chuyển và khám phá cho cuối tuần của bạn.
                  </p>
                </div>

                <div className="flex flex-col gap-6">
                  {/* Row 1: Miền Nam */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                    {/* Region Label: Width 178px, Bold, Yellow #fbbf24 */}
                    <div className="w-[178px] shrink-0 text-center uppercase font-bold text-[18px] py-2.5 px-3 rounded-[5px] bg-[#fbbf24] text-white shadow-sm">
                      MIỀN NAM
                    </div>
                    {/* Region List */}
                    <div className="flex flex-wrap gap-4 sm:gap-6">
                      <a
                        href="#system-trailbus"
                        className="w-[178px] text-center font-semibold text-[18px] py-2.5 px-4 rounded-[5px] bg-[#186734] text-white hover:opacity-85 transition-opacity"
                      >
                        Chứa Chan
                      </a>
                      <a
                        href="#system-trailbus"
                        className="w-[178px] text-center font-semibold text-[18px] py-2.5 px-4 rounded-[5px] bg-[#186734] text-white hover:opacity-85 transition-opacity"
                      >
                        Cát Tiên
                      </a>
                      <a
                        href="#system-trailbus"
                        className="w-[178px] text-center font-semibold text-[18px] py-2.5 px-4 rounded-[5px] bg-[#186734] text-white hover:opacity-85 transition-opacity"
                      >
                        Núi Dinh
                      </a>
                      <a
                        href="#system-trailbus"
                        className="w-[178px] text-center font-semibold text-[18px] py-2.5 px-4 rounded-[5px] bg-[#186734] text-white hover:opacity-85 transition-opacity"
                      >
                        Ngũ Long
                      </a>
                      <a
                        href="#system-trailbus"
                        className="w-[178px] text-center font-semibold text-[18px] py-2.5 px-4 rounded-[5px] bg-[#186734] text-white hover:opacity-85 transition-opacity"
                      >
                        Đá Vách
                      </a>
                      <span className="w-[178px] text-center font-semibold text-[18px] py-2.5 px-4 rounded-[5px] bg-[#cbd5e1] text-[#555] cursor-not-allowed">
                        XX/2025
                      </span>
                    </div>
                  </div>

                  {/* Row 2: Miền Bắc */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                    {/* Region Label: Width 178px, Bold, Yellow #fbbf24 */}
                    <div className="w-[178px] shrink-0 text-center uppercase font-bold text-[18px] py-2.5 px-3 rounded-[5px] bg-[#fbbf24] text-white shadow-sm">
                      MIỀN BẮC
                    </div>
                    {/* Region List */}
                    <div className="flex flex-wrap gap-4 sm:gap-6">
                      <a
                        href="#system-trailbus"
                        className="w-[178px] text-center font-semibold text-[18px] py-2.5 px-4 rounded-[5px] bg-[#186734] text-white hover:opacity-85 transition-opacity"
                      >
                        Cúc Phương
                      </a>
                      <a
                        href="#system-trailbus"
                        className="w-[178px] text-center font-semibold text-[18px] py-2.5 px-4 rounded-[5px] bg-[#186734] text-white hover:opacity-85 transition-opacity"
                      >
                        Đà Bắc
                      </a>
                      <span className="w-[178px] text-center font-semibold text-[18px] py-2.5 px-4 rounded-[5px] bg-[#cbd5e1] text-[#555] cursor-not-allowed">
                        XX/2025
                      </span>
                      <span className="w-[178px] text-center font-semibold text-[18px] py-2.5 px-4 rounded-[5px] bg-[#cbd5e1] text-[#555] cursor-not-allowed">
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
                  className="w-full max-w-[464px] h-auto object-contain drop-shadow-md"
                />
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            5. SECTION TRAILBUS (HỆ THỐNG TRAIL BUS CHO BẠN - HORIZONTAL CAROUSEL 100% GỐC)
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
            {/* Header: Title on Left, Carousel Navigation Arrows on Right */}
            <div className="flex items-center justify-between mb-12">
              <h2 className="text-2xl sm:text-3xl lg:text-[35px] font-extrabold text-black uppercase tracking-tight">
                HỆ THỐNG TRAIL BUS CHO BẠN
              </h2>

              {/* Flickity-style 50px circular navigation buttons */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => scrollCarousel("left")}
                  aria-label="Previous Slide"
                  className="w-[50px] h-[50px] rounded-full border-[3px] border-black bg-transparent flex items-center justify-center hover:bg-black hover:text-white transition-all shadow-sm active:scale-95"
                >
                  <ChevronLeft className="w-6 h-6 stroke-[3]" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollCarousel("right")}
                  aria-label="Next Slide"
                  className="w-[50px] h-[50px] rounded-full border-[3px] border-black bg-transparent flex items-center justify-center hover:bg-black hover:text-white transition-all shadow-sm active:scale-95"
                >
                  <ChevronRight className="w-6 h-6 stroke-[3]" />
                </button>
              </div>
            </div>

            {/* Horizontal Scrollable Carousel Container */}
            <div
              ref={carouselRef}
              className="flex gap-[30px] overflow-x-auto scroll-smooth pb-6 select-none"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {GOTRAIL_TOURS.map((tour) => (
                <div
                  key={tour.slug}
                  className="tour-card carousel-cell w-[370px] min-h-[730px] shrink-0 bg-white rounded-[5px] overflow-hidden shadow-[0px_4px_8px_rgba(0,0,0,0.1)] hover:shadow-[0px_6px_12px_rgba(0,0,0,0.2)] hover:-translate-y-1 transition-all duration-300 flex flex-col group"
                >
                  {/* Tour Image */}
                  <div className="relative h-[245px] w-full overflow-hidden bg-neutral-200">
                    <img
                      src={tour.img}
                      alt={tour.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>

                  {/* Tour Content: Padding 30px */}
                  <div className="p-[30px] flex-1 flex flex-col justify-between">
                    <div>
                      {/* Tour Title: 25px, Bold, Uppercase, min-height 60px */}
                      <h3 className="text-[25px] font-bold text-black uppercase min-h-[60px] leading-tight mb-2.5">
                        {tour.title}
                      </h3>

                      {/* Tour Tags: Background #e6eaf0, font-size 14px */}
                      {tour.tags && tour.tags.length > 0 && (
                        <div className="flex flex-wrap gap-[7px] mb-5">
                          {tour.tags.map((tag, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-[7px] px-2.5 py-1 rounded-[5px] bg-[#E6EAF0] text-black text-[14px] font-bold"
                            >
                              <img src="/ref/i-check.svg" alt="check" className="w-4 h-4" />
                              <span>{tag}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Tour Info: 15px, font-weight 500, border-bottom 1px solid #ccc */}
                      <div className="space-y-2 text-[15px] font-medium text-black pb-5 border-b border-[#ccc]">
                        <p className="flex items-center gap-2">
                          <img src="/ref/i-clock.svg" alt="clock" className="w-[18px] h-[17px]" />
                          <span>
                            <strong>Thời Gian: </strong>
                            {tour.time}
                          </span>
                        </p>
                        <p className="flex items-center gap-2">
                          <img src="/ref/i-car.svg" alt="distance" className="w-[21px] h-[15px]" />
                          <span>
                            <strong>Độ Dài: </strong>
                            {tour.length}
                          </span>
                        </p>
                        <p className="flex items-center gap-2">
                          <img src="/ref/i-do-kho.svg" alt="difficulty" className="w-[21px] h-[14px]" />
                          <span className="flex items-center gap-2">
                            <strong>Độ khó: </strong>
                            <img
                              src={tour.difficultyIcon}
                              alt="dokho"
                              className="h-[14px] w-auto inline-block"
                            />
                          </span>
                        </p>
                        <p className="flex items-center gap-2">
                          <img src="/ref/i-do-cao-dinh.svg" alt="elevation" className="w-[21px] h-[20px]" />
                          <span>
                            <strong>Độ cao đỉnh: </strong>
                            {tour.height}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Price Section */}
                    <div className="pt-4 space-y-1">
                      {tour.oldPrice && tour.oldPrice !== tour.newPrice && (
                        <div className="text-[16px] text-[#888] line-through">
                          {tour.oldPrice}
                        </div>
                      )}
                      <div className="flex items-baseline justify-between">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[16px] font-bold text-black">Giá vé:</span>
                          <span className="text-[24px] font-bold text-black">
                            {tour.newPrice}
                          </span>
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
        <section className="section-gallery w-full overflow-hidden">
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
            8. SECTION FAQ (NHỮNG CÂU HỎI THƯỜNG GẶP - HOTLINE CỦA TEAM)
            ========================================================================= */}
        <section className="section-faq bg-[#EEEEEE] py-16 px-4 sm:px-8">
          <div className="max-w-[1280px] mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              {/* Left Column: Title and Hotline của team */}
              <div className="lg:col-span-4 space-y-4">
                <h2 className="text-3xl font-extrabold text-black uppercase leading-tight">
                  NHỮNG CÂU HỎI
                  <br />
                  THƯỜNG GẶP
                </h2>
                <p className="text-neutral-700 text-sm">
                  Tư vấn chi tiết liên hệ hotline
                  <br />
                  <a
                    href="tel:0972699242"
                    className="font-bold text-lg text-black hover:text-[#186734] transition-colors"
                  >
                    0972699242
                  </a>
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
          10. FOOTER (ĐẦY ĐỦ THÔNG TIN CÁ NHÂN CỦA TEAM & PHÁP LÝ)
          ========================================================================= */}
      <footer className="footer bg-[#111111] text-white py-12 border-t border-neutral-800">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Column 1: Logo & Company Info của team */}
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

              <div className="space-y-2.5 text-xs text-neutral-300">
                <div className="flex items-start gap-2.5">
                  <img src="/ref/i-location.svg" alt="address" className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Trường Đại học Sài Gòn - SGU</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <img src="/ref/i-email.svg" alt="email" className="w-4 h-4 shrink-0" />
                  <a
                    href="mailto:quynhtien123123@gmail.com"
                    className="hover:text-[#FEBB02] transition-colors"
                  >
                    quynhtien123123@gmail.com
                  </a>
                </div>
                <div className="flex items-center gap-2.5">
                  <img src="/ref/i-phone.svg" alt="phone" className="w-4 h-4 shrink-0" />
                  <a
                    href="tel:0972699242"
                    className="hover:text-[#FEBB02] transition-colors"
                  >
                    0972699242
                  </a>
                </div>
              </div>

              {/* Social icons của team */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                  Kết nối với Go Trail
                </h4>
                <div className="flex items-center gap-3">
                  <a
                    href="https://www.facebook.com/tienan.nguyen.33821/"
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Facebook"
                    className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center hover:bg-[#FEBB02] hover:text-black transition-colors"
                  >
                    <img src="/ref/i-fb.svg" alt="Facebook" className="w-4 h-4" />
                  </a>
                  <a
                    href="https://www.instagram.com/_tienann_/"
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Instagram"
                    className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center hover:bg-[#FEBB02] hover:text-black transition-colors"
                  >
                    <img src="/ref/i-ins.svg" alt="Instagram" className="w-4 h-4" />
                  </a>
                  <a
                    href="https://zalo.me/0972699242"
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Zalo"
                    className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center hover:bg-[#FEBB02] hover:text-black transition-colors"
                  >
                    <img src="/ref/i-zalo.svg" alt="Zalo" className="w-4 h-4" />
                  </a>
                  <a
                    href="#"
                    title="Strava"
                    className="w-16 h-8 rounded-full bg-neutral-800 flex items-center justify-center hover:bg-[#FEBB02] hover:text-black transition-colors"
                  >
                    <img src="/ref/i-strava.svg" alt="Strava" className="h-4 w-auto" />
                  </a>
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
                Đồ án học phần — không phải trang chính thức của Go Trail.
              </p>
            </div>
          </div>
        </div>
      </footer>

      {/* =========================================================================
          11. NÚT NỔI ZALO & MESSENGER (BOTTOM 92px VÀ 20px, RIGHT 20px, 60x60 - DẪN TRỰC TIẾP TỚI TEAM)
          ========================================================================= */}
      <div className="fixed z-50 right-5 bottom-[92px] w-[60px] h-[60px] transition-transform hover:scale-110">
        <a
          href="https://zalo.me/0972699242"
          target="_blank"
          rel="noopener noreferrer"
          title="Tư vấn qua Zalo: 0972699242"
          className="block w-full h-full drop-shadow-xl"
        >
          <img src="/ref/ist-zalo.svg" alt="Zalo" className="w-full h-full" />
        </a>
      </div>

      <div className="fixed z-50 right-5 bottom-5 w-[60px] h-[60px] transition-transform hover:scale-110">
        <a
          href="https://www.facebook.com/tienan.nguyen.33821/"
          target="_blank"
          rel="noopener noreferrer"
          title="Tư vấn qua Facebook Messenger"
          className="block w-full h-full drop-shadow-xl"
        >
          <img src="/ref/ist-messenger.svg" alt="Messenger" className="w-full h-full" />
        </a>
      </div>
    </div>
  );
}
