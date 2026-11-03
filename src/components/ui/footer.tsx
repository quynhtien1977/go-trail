"use client";

import Link from "next/link";

export function Footer() {
  return (
    <>
      {/* =========================================================================
          FOOTER CHUẨN GO-TRAIL (TÁI SỬ DỤNG DUY NHẤT TOÀN HỆ THỐNG)
          ========================================================================= */}
      <footer className="footer bg-[#111111] text-white py-12 border-t border-neutral-800 font-sans pb-24 md:pb-12">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Column 1: Logo & Company Info của team */}
            <div className="lg:col-span-4 space-y-6">
              <Link href="/" className="inline-block">
                <img
                  src="/ref/logo.png"
                  alt="Go Trail Logo"
                  width={170}
                  height={80}
                  className="h-14 w-auto object-contain"
                />
              </Link>
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
                    <Link href="/trips/pal-sol" className="hover:text-[#FEBB02] transition-colors">
                      Trail Bus – Pal Sol
                    </Link>
                  </li>
                  <li>
                    <Link href="/trips/ba-den" className="hover:text-[#FEBB02] transition-colors">
                      Trail Bus – Bà Đen
                    </Link>
                  </li>
                  <li>
                    <Link href="/trips/2" className="hover:text-[#FEBB02] transition-colors">
                      Trail Bus – Chứa Chan
                    </Link>
                  </li>
                  <li>
                    <Link href="/trips/nui-dinh" className="hover:text-[#FEBB02] transition-colors">
                      Trail Bus – Núi Dinh
                    </Link>
                  </li>
                  <li>
                    <Link href="/trips/thi-vai" className="hover:text-[#FEBB02] transition-colors">
                      Trail Bus – Thị Vải
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Miền Bắc */}
              <div className="space-y-3">
                <h4 className="font-extrabold text-white text-sm">Trail miền Bắc</h4>
                <ul className="space-y-2">
                  <li>
                    <Link href="/trips/suoi-cua-tu" className="hover:text-[#FEBB02] transition-colors">
                      Trail Bus – Suối Cửa Tử
                    </Link>
                  </li>
                  <li>
                    <Link href="/trips/tam-dao" className="hover:text-[#FEBB02] transition-colors">
                      Trail Bus – Tam Đảo
                    </Link>
                  </li>
                  <li>
                    <Link href="/trips/ba-vi" className="hover:text-[#FEBB02] transition-colors">
                      Trail Bus – Ba Vì
                    </Link>
                  </li>
                  <li>
                    <Link href="/trips/ham-lon" className="hover:text-[#FEBB02] transition-colors">
                      Trail Bus – Hàm Lợn
                    </Link>
                  </li>
                  <li>
                    <Link href="/trips/cuc-phuong" className="hover:text-[#FEBB02] transition-colors">
                      Trail Bus – Cúc Phương
                    </Link>
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
          NÚT NỔI ZALO & MESSENGER (BOTTOM 92px VÀ 20px, RIGHT 20px, 60x60)
          ========================================================================= */}
      <div className="fixed z-50 right-5 bottom-[92px] w-[50px] md:w-[60px] h-[50px] md:h-[60px] transition-transform hover:scale-110">
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

      <div className="fixed z-50 right-5 bottom-5 w-[50px] md:w-[60px] h-[50px] md:h-[60px] transition-transform hover:scale-110">
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
    </>
  );
}
