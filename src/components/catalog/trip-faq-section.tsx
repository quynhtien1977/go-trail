"use client";

import { useState } from "react";

export function TripFaqSection() {
  const [faqOpenIndex, setFaqOpenIndex] = useState<number | null>(0);

  const faqs = [
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
      a: "Chúng tôi có nhiều điểm đón khách khác nhau (177 Phan Chu Trinh Bình Thạnh, KĐT Sala Thủ Đức...), giúp bạn dễ dàng chọn vị trí phù hợp nhất.",
    },
  ];

  return (
    <section className="section-faq py-[60px] bg-[#EEEEEE]">
      <div className="max-w-[1240px] mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          <div className="md:col-span-4 space-y-3">
            <h2 className="faq-title text-[26px] sm:text-[30px] font-bold text-black uppercase leading-tight tracking-tight mt-4">
              NHỮNG CÂU HỎI
              <br />
              THƯỜNG GẶP
            </h2>
            <p className="faq-subtitle text-[16px] sm:text-[18px] text-neutral-700 leading-relaxed">
              Tư vấn chi tiết liên hệ hotline
              <br />
              <a
                href="tel:0972699242"
                className="font-bold text-black underline hover:text-emerald-800 transition-colors"
              >
                0972 699 242
              </a>
            </p>
          </div>

          <div className="md:col-span-8 space-y-3">
            {faqs.map((faq, idx) => {
              const isOpen = faqOpenIndex === idx;
              return (
                <div
                  key={idx}
                  className="border border-neutral-300 rounded-[6px] overflow-hidden bg-white shadow-2xs"
                >
                  <button
                    type="button"
                    onClick={() => setFaqOpenIndex(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between p-4 px-6 bg-white hover:bg-neutral-50 text-left font-bold text-[16px] sm:text-[18px] text-black transition-colors"
                  >
                    <span>{faq.q}</span>
                    <span className="text-[22px] text-black font-mono ml-4 shrink-0">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="p-4 px-6 pt-1 text-[15px] sm:text-[16px] text-neutral-700 leading-relaxed border-t border-neutral-100 animate-in fade-in duration-200">
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
  );
}
