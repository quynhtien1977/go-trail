"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Navbar } from "@/components/ui/navbar";
import { Footer } from "@/components/ui/footer";
import { TrailbusCarousel } from "@/components/catalog/trailbus-carousel";
import { getLegacyMediaUrl } from "@/lib/legacy-media";

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
  const [selectedCity, setSelectedCity] = useState<string | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const handleRegionClick = (city: string) => {
    setSelectedCity(city);
    const el = document.getElementById("system-trailbus");
    if (el) el.scrollIntoView({ behavior: "smooth" });
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
          <Image
            src={getLegacyMediaUrl("home-hero")}
            alt="Go Trail - Your Weekend Trail"
            width={1600}
            height={900}
            priority
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
                  <Image
                    src={getLegacyMediaUrl("shared-bus-background")}
                    alt="Go Trail Bus Community"
                    width={1600}
                    height={900}
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
                      <button
                        type="button"
                        onClick={() => handleRegionClick("Đồng Nai")}
                        className="w-[178px] text-center font-semibold text-[18px] py-2.5 px-4 rounded-[5px] bg-[#186734] text-white hover:opacity-85 transition-opacity cursor-pointer"
                      >
                        Chứa Chan
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRegionClick("Đồng Nai")}
                        className="w-[178px] text-center font-semibold text-[18px] py-2.5 px-4 rounded-[5px] bg-[#186734] text-white hover:opacity-85 transition-opacity cursor-pointer"
                      >
                        Cát Tiên
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRegionClick("Bà Rịa - Vũng Tàu")}
                        className="w-[178px] text-center font-semibold text-[18px] py-2.5 px-4 rounded-[5px] bg-[#186734] text-white hover:opacity-85 transition-opacity cursor-pointer"
                      >
                        Núi Dinh
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRegionClick("Tây Ninh")}
                        className="w-[178px] text-center font-semibold text-[18px] py-2.5 px-4 rounded-[5px] bg-[#186734] text-white hover:opacity-85 transition-opacity cursor-pointer"
                      >
                        Bà Đen
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRegionClick("Lâm Đồng")}
                        className="w-[178px] text-center font-semibold text-[18px] py-2.5 px-4 rounded-[5px] bg-[#186734] text-white hover:opacity-85 transition-opacity cursor-pointer"
                      >
                        Lang Biang
                      </button>
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
                      <button
                        type="button"
                        onClick={() => handleRegionClick("Hà Nội")}
                        className="w-[178px] text-center font-semibold text-[18px] py-2.5 px-4 rounded-[5px] bg-[#186734] text-white hover:opacity-85 transition-opacity cursor-pointer"
                      >
                        Ba Vì
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRegionClick("Thái Nguyên")}
                        className="w-[178px] text-center font-semibold text-[18px] py-2.5 px-4 rounded-[5px] bg-[#186734] text-white hover:opacity-85 transition-opacity cursor-pointer"
                      >
                        Suối Cửa Tử
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRegionClick("Vĩnh Phúc")}
                        className="w-[178px] text-center font-semibold text-[18px] py-2.5 px-4 rounded-[5px] bg-[#186734] text-white hover:opacity-85 transition-opacity cursor-pointer"
                      >
                        Tam Đảo
                      </button>
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
            <TrailbusCarousel initialCity={selectedCity} onCitySelect={setSelectedCity} />
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
          <Image
            src={getLegacyMediaUrl("about-collage-desktop")}
            alt="Go Trail Gallery"
            width={1440}
            height={488}
            className="w-full h-auto hidden lg:block"
          />
          <Image
            src={getLegacyMediaUrl("about-collage-mobile")}
            alt="Go Trail Gallery Mobile"
            width={339}
            height={462}
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
          10. FOOTER & FLOATING BUTTONS (TÁI SỬ DỤNG SHARED FOOTER COMPONENT)
          ========================================================================= */}
      <Footer />
    </div>
  );
}
