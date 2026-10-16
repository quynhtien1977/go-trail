# Hệ Thống Thiết Kế Go-Trail (Go-Trail Design System)

> **Tài liệu tham chiếu chuẩn hóa giao diện**  
> Phiên bản: `1.1.0` | Cập nhật: `14/10/2026`  
> Nguồn số đo: Đo đạc trực tiếp bằng computed styles từ `https://gotrail.vn/` và bản clone local tại các breakpoint 1440px (Desktop), 768px (Tablet), 360px (Mobile).  
> Quy ước: Các mục có tiền tố **[Đo đạc]** là số liệu thực tế kèm phần tử nguồn từ gotrail.vn; các mục có tiền tố **[Đề xuất]** là quy chuẩn áp dụng cho phân hệ trang trong (Back-office, Bảng, Form, Sơ đồ ghế, Portal Leader/Staff) được tối ưu theo tiêu chuẩn trợ năng WCAG AA.

---

## 1. Quy Tắc Cốt Lõi Bắt Buộc (Hard Rules)

Mọi màn hình (cả trang công khai lẫn portal nội bộ) phải tuân thủ nghiêm ngặt 6 quy tắc sau:

1. **Bộ màu nhận diện & Quy tắc nút vàng**:
   - **Vàng (`#FEBB02`)**: 
     - **Phạm vi Portal nội bộ & Luồng đặt vé/thanh toán**: Mỗi màn hình chỉ có **duy nhất 1 nút vàng nổi bật** làm CTA chính (ví dụ: *"Đặt vé ngay"*, *"Xác nhận thanh toán"*, *"Lưu thay đổi"* trong modal) để dẫn dắt hành động duy nhất của người dùng, tránh gây phân tâm.
     - **Phạm vi Trang công khai (Public Web / Trang chủ / Danh mục)**: Giữ nguyên theo bản gốc gotrail.vn: Nút *"Đăng ký"* trên Header và nút *"CHI TIẾT →"* trên từng thẻ tuyến trong danh mục đều sử dụng màu vàng `#FEBB02`.
   - **Xanh lá đậm (`#186734`)**: Màu nhãn thương hiệu Go-Trail, nút lọc vùng miền active, tag đặc trưng, huy hiệu xác thực.
   - **Màu ngữ nghĩa**: Chỉ dùng cho trạng thái nghiệp vụ, được kiểm định đạt chuẩn tương phản WCAG AA.
   - **TUYỆT ĐỐI CẤM**: Không sử dụng màu tím, chàm (indigo), ánh sáng neon (glow), hoặc hiệu ứng kính mờ (glassmorphism).
   - **Ngoại lệ duy nhất cho Gradient**: Cho phép lớp phủ một màu từ đen sang trong suốt (`linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0) 100%)`) đặt dưới chữ trên ảnh bìa / banner hero để bảo đảm độ tương phản đọc chữ khi nền ảnh thực tế phức tạp. **Mọi gradient khác (gradient nền trang, gradient nút bấm, gradient đa sắc, gradient chéo) vẫn tuyệt đối bị cấm**.
2. **Cấu trúc phẳng & một cấp Card**:
   - Thẻ card nội dung chỉ có 1 cấp phẳng. **Tuyệt đối không dùng card lồng card** (không đặt khung con có nền xám/viền bên trong một card lớn đã có nền và viền).
   - Bo góc đồng nhất: chuẩn `5px` theo bản gốc (hoặc tối đa `6px - 8px` cho modal/bảng trang trong). Không bo tròn quá mức (không dùng kiểu bo góc 24px - 32px tùy tiện).
   - Viền đồng nhất: độ dày cố định `1px solid` màu xám trung tính nhẹ. Không dùng viền đậm hoặc nhiều màu viền lộn xộn.
3. **Typography nhất quán & hỗ trợ tiếng Việt hoàn hảo**:
   - Tối đa 2 họ chữ trong toàn dự án: **`Livvic`** (Font chủ đạo chuẩn Google Fonts) và font hệ thống sans-serif/monospace bổ trợ.
   - Toàn bộ font phải hỗ trợ đầy đủ bộ ký tự tiếng Việt có dấu. Chuỗi nghiệm thu bắt buộc: `"Điều Quyền Hướng Nghề Ường Ẫ Ỡ Ổ Ự Ặ"`.
   - Cấm chữ nhỏ hơn `12px` ở mọi vị trí hiển thị.
4. **Quy tắc viết hoa chữ chuẩn mực**:
   - **Chữ hoa toàn bộ (UPPERCASE)**: Chỉ dùng cho tiêu đề tiếp thị chính ở trang công khai theo đúng bản gốc gotrail.vn (VD: `"HỆ THỐNG TRAIL BUS CHO BẠN"`).
   - **Chữ hoa đầu câu (Sentence case)**: Bắt buộc dùng cho toàn bộ Portal nội bộ, tiêu đề bảng, tên cột, mục menu, nhãn form, thông báo, nút bấm chức năng (VD: `"Quản lý tuyến đường"`, `"Thêm chuyến mới"`, `"Danh sách hành khách"`). Tuyệt đối không Viết Hoa Từng Từ theo kiểu tiếng Anh (Title Case).
5. **Giọng văn người dùng, sạch bóng thuật ngữ kỹ thuật**:
   - Giao diện người dùng tuyệt đối không chứa các từ ngữ nội bộ/kỹ thuật như: `PRD`, `CRUD`, `Phase`, `RBAC`, `API`, `Endpoint`, `Database`, `Seed`, `Payload`, `Null`.
   - Trạng thái rỗng (empty state) phải là thông điệp trung tính lịch sự, giải thích ngắn gọn và đưa ra 1 hành động kế tiếp, không dùng khung viền cảnh báo lỗi màu vàng/đỏ làm hoang mang người dùng.
6. **Shell giao diện & Tái sử dụng Component dùng chung (Single Source of Truth)**:
   - **Trang công khai (Public Web)**: Dùng chung Header đen (`#000000`, component `<Navbar />` từ `@/components/ui/navbar`) và Footer chuẩn Go-Trail (component `<Footer />` từ `@/components/ui/footer`).
   - **Nguyên tắc Tái sử dụng Tuyệt đối**: Bất kỳ thành phần nào đã clone về chuẩn và hoạt động tốt (như Header/Navbar, Footer, Nút nổi Zalo/Messenger, Tour Card) **bắt buộc phải đóng gói thành component dùng chung và tái sử dụng triệt để**, tuyệt đối không viết lại phân mảnh hoặc hardcode riêng ở từng trang.
   - **Portal Nội bộ (Back-office)**: Dùng **Sidebar màu đen đặc, không trong suốt (`#111111`)** bên trái (desktop) hoặc ngăn kéo (mobile). **Tuyệt đối không dùng lại thanh menu bán tour công khai** (Miền Nam, Miền Bắc, Thẻ Chinh Phục, About Us) bên trong cổng quản trị.
   - **Portal Leader**: Giao diện Mobile-first tối ưu màn hình ngoài trời với thanh điều hướng đáy (Bottom Navigation Tab), chữ to rõ, tương phản cao.
7. **Nguyên tắc Clone y đúc bản gốc & Thiết kế Sơ đồ ghế Full**:
   - **Đối với các trang bản gốc gotrail.vn CÓ hiển thị (Trang chủ, Danh mục tuyến, Chi tiết tuyến)**:
     - Bắt buộc **CLONE Y ĐÚC** cấu trúc, bố cục, phân chia section, màu sắc, font chữ và visual của bản gốc `gotrail.vn` (tái sử dụng trực tiếp HTML/CSS từ bản clone có sẵn trong `scratch/` và ảnh chụp tham chiếu trong `docs/ui-spec/ref/`).
     - Sau đó **bổ sung các tính năng của đồ án** vào đúng vị trí sidebar/bước đặt chỗ: hiển thị các ngày khởi hành thực tế, danh sách ghế trống theo thời gian thực, Leader phụ trách, và luồng dẫn tới sơ đồ ghế xe bus.
     - **Lược bỏ các phần ngoài phạm vi MVP**: Lược bỏ Thẻ Chinh Phục (tích điểm/huy chương), tập trung vào gói vé xe + Leader trọn gói.
   - **Sơ đồ chọn ghế xe (29/45 chỗ - Tiêu chuẩn Rạp chiếu phim)**:
     - Sơ đồ ghế xe trong form/sidebar đặt chỗ **bắt buộc phải hiển thị FULL toàn bộ các hàng ghế của chiếc xe** (từ hàng 1 đến hàng 11 của xe 45 chỗ).
     - **Tuyệt đối không dùng khung giới hạn chiều cao kèm thanh cuộn (`max-h + overflow-y-auto`)** gây che khuất và khó tìm ghế; phải hiển thị trực quan toàn cảnh đầu xe (vô lăng tài xế, cửa lên xe), lối đi giữa xe và đuôi xe như giao diện chọn ghế rạp chiếu phim (CGV/Lotte) hay app đặt xe cao cấp.
   - **Đối với các màn hình bản gốc KHÔNG CÓ (Staff Portal, sơ đồ chọn ghế chi tiết 29/45 chỗ, luồng thanh toán QR VietQR/SePay, kiểm tra check-in)**:
     - Đây là trường hợp DUY NHẤT cần dùng Stitch UI để sinh giao diện, duyệt trước với người dùng (Cổng B) rồi mới triển khai code (Cổng C). Không dùng Stitch để tự chế lại các trang mà bản gốc đã có.

---

## 2. Bảng Token Màu Sắc (Color Palette)

### 2.1. Màu Thương Hiệu & Bề Mặt

| Token Name | Giá trị HEX | Giá trị RGB | Phân loại & Nguồn gốc | Tỉ lệ tương phản WCAG | Ứng dụng thực tế |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `--color-header-bg` | `#000000` | `rgb(0, 0, 0)` | **[Đo đạc từ header & footer]** | N/A | Nền header fixed, nền footer |
| `--color-sidebar-bg` | `#111111` | `rgb(17, 17, 17)` | **[Đề xuất]** | N/A | Nền Sidebar back-office (đen đặc, không trong suốt) |
| `--color-primary-yellow` | `#FEBB02` | `rgb(254, 187, 2)` | **[Đo đạc từ header .logo & CTA cardButton]** | **12.32:1** (với chữ đen `#000000`, đạt AAA) | Nút CTA chính, logo highlight, viền mục đang chọn |
| `--color-primary-yellow-hover`| `#E5A800` | `rgb(229, 168, 0)` | **[Đề xuất]** | **9.95:1** (với chữ đen `#000000`, đạt AAA) | Hiệu ứng rê chuột (hover) trên nút CTA vàng |
| `--color-brand-green` | `#186734` | `rgb(24, 103, 52)` | **[Đo đạc từ .region-item active]** | **6.93:1** (với nền trắng `#FFFFFF`, đạt AA) | Nhãn thương hiệu, nút lọc khu vực active, badge tour |
| `--color-brand-green-hover` | `#125228` | `rgb(18, 82, 40)` | **[Đề xuất]** | **8.78:1** (với nền trắng `#FFFFFF`, đạt AAA) | Hiệu ứng hover nút xanh thương hiệu |
| `--color-section-green-bg` | `#9ACE7D` | `rgb(154, 206, 125)` | **[Đo đạc từ .section-trailbus]** | N/A | Nền Section Trailbus công khai (kèm họa tiết topo) |
| `--color-page-bg` | `#FFFFFF` | `rgb(255, 255, 255)` | **[Đo đạc từ body & .tour-card]** | N/A | Nền trang chính, nền thẻ card tour |
| `--color-page-bg-subtle` | `#F8F9FA` | `rgb(248, 249, 250)` | **[Đề xuất]** | N/A | Nền trang nội bộ, nền khu vực chi tiết, nền bảng |
| `--color-text-main` | `#000000` | `rgb(0, 0, 0)` | **[Đo đạc từ .tour-title & .new-price]** | **21.00:1** (với nền trắng `#FFFFFF`, đạt AAA) | Tiêu đề chính, tên tuyến, giá vé |
| `--color-text-body` | `#212529` | `rgb(33, 37, 41)` | **[Đo đạc từ body]** | **16.08:1** (với nền trắng `#FFFFFF`, đạt AAA) | Đoạn văn bản nội dung, thông số tour, form |
| `--color-text-muted` | `#5C636A` | `rgb(92, 99, 106)` | **[Đề xuất theo chuẩn WCAG AA]** | **5.78:1** (với nền `#F8F9FA`, đạt AA; thay thế `#6C757D` chỉ đạt 4.45:1) | Chữ phụ, nhãn thứ cấp, ngày giờ, placeholder |
| `--color-border-card-divider`| `#CCCCCC` | `rgb(204, 204, 204)` | **[Đo đạc từ .tour-info border-bottom]** | N/A | Đường viền gạch ngang phân cách trong thẻ tour |
| `--color-border-subtle` | `#E0E0E0` | `rgb(224, 224, 224)` | **[Đề xuất]** | N/A | Đường viền thẻ card, viền phân cách bảng |
| `--color-seat-border-available`| `#6B7280` | `rgb(107, 114, 128)` | **[Đề xuất theo chuẩn WCAG AA]** | **4.83:1** (với nền trắng `#FFFFFF`, đạt chuẩn UI non-text ≥ 3.0:1; thay thế `#9CA3AF` chỉ đạt 2.54:1) | Viền ghế trống xe bus, viền ô nhập liệu chuẩn |

### 2.2. Màu Ngữ Nghĩa Trạng Thái [Đề xuất chuẩn hóa WCAG AA]

| Trạng thái | Nền Badge (Bg) | Chữ / Viền | Tỉ lệ tương phản | Đánh giá WCAG 2.1 | Ý nghĩa nghiệp vụ |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Đang mở / Thành công** | `#E8F5E9` (Green 50) | `#186734` (Brand Green) | **6.16:1** | **Đạt AA & AAA** (chuẩn văn bản ≥ 4.5:1) | Tuyến đang mở, vé hợp lệ, thanh toán hoàn tất, đã check-in |
| **Chờ xử lý / Đang giữ** | `#FFF8E1` (Amber 50) | `#8A5A00` (Amber Dark) | **5.58:1** | **Đạt AA** (chuẩn văn bản ≥ 4.5:1; thay thế `#B78103` chỉ đạt 3.21:1) | Ghế đang giữ (hold), thanh toán cần đối soát (NeedsReview) |
| **Tạm ẩn / Đã đóng** | `#F5F5F5` (Gray 100) | `#616161` (Gray 700) | **5.68:1** | **Đạt AA** (chuẩn văn bản ≥ 4.5:1) | Tuyến tạm ẩn, chuyến đã đóng đặt vé, bản nháp |
| **Đã hủy / Lỗi** | `#FFEBEE` (Red 50) | `#C62828` (Red 800) | **4.92:1** | **Đạt AA** (chuẩn văn bản ≥ 4.5:1) | Chuyến bị hủy, vé đã hoàn, lỗi thanh toán |

---

## 3. Typography (Font Chữ & Kiểu Trình Bày)

### 3.1. Họ Phông Chữ (Font Family) & Trọng Số Thực Tế (Weights)
- **Font chính thức**: **`Livvic`**, sans-serif.
  - *Nguồn*: Google Fonts (`https://fonts.google.com/specimen/Livvic`), tải tự do không phụ thuộc license bên thứ ba.
  - *Subset*: `latin`, `vietnamese`.
  - *Kiểm tra bộ dấu tiếng Việt*: `Điều Quyền Hướng Nghề Ường Ẫ Ỡ Ổ Ự Ặ` — hiển thị mượt mà 100%, không bị vỡ glyph hoặc lệch chân dấu.
  - *Bằng chứng kiểm tra*: Đã render toàn bộ 5 trọng số sử dụng thực tế và lưu trữ tại [`docs/design/reference/livvic-vietnamese-weights.png`](file:///e:/Workspace/go-trail/docs/design/reference/livvic-vietnamese-weights.png).
  - *Các trọng số thực tế có trên Google Fonts*: `100, 200, 300, 400, 500, 600, 700, 900` (**hoàn toàn không có weight 800**).
  - *5 trọng số được chọn dùng trong hệ thống*:
    - **`400` (Regular)**: Đoạn văn bản mô tả, nội dung lịch trình tour.
    - **`500` (Medium)**: Thông số kỹ thuật (cự ly, độ cao), địa chỉ đón xe, văn bản phụ.
    - **`600` (SemiBold)**: Tiêu đề phân mục, header bảng, nhãn badge trạng thái.
    - **`700` (Bold)**: Tên tuyến (H3), giá vé, nút CTA chính, tiêu đề phân đoạn (H2).
    - **`900` (Black)**: Tiêu đề lớn Display H1 trang chủ, số liệu thống kê dashboard (thay thế cho font vẽ tay độc quyền Tharon).
- **Font phụ trợ (Code/Số liệu/Vé)**: `ui-monospace`, `SFMono-Regular`, `Menlo`, `Monaco`, `Consolas`, monospace (dùng hiển thị mã thanh toán, mã ghế, số tiền đối soát).

### 3.2. Thang Cỡ Chữ (Type Scale)

| Cấp bậc | Cỡ chữ Desktop (1440px) | Cỡ chữ Mobile (360px) | Độ đậm (Weight) | Chiều cao dòng (Line-height) | Ứng dụng |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display H1** | `40px` | `28px` | Black (900) | `48px` | Tiêu đề chính trang chủ (Uppercase) |
| **Section H2** | `32px` - `35px` | `24px` | Bold (700) | `40px` - `42px` | Tiêu đề phân đoạn lớn (Uppercase ngoài, Sentence case trong) |
| **Card Title H3** | `22px` - `25px` | `18px` - `20px` | Bold (700) | `28px` - `30px` | Tên tuyến trekking trên thẻ và trang chi tiết |
| **Subsection H4** | `18px` | `16px` | SemiBold (600) | `24px` | Tiêu đề khối thông tin, tiêu đề bảng |
| **Body Large** | `16px` | `15px` | Regular (400) | `24px` | Đoạn mô tả, nội dung lịch trình |
| **Body Standard**| `15px` | `14px` | Medium (500) | `22.5px` | Thông số kỹ thuật (Cự ly, Điểm đón, Giá vé) |
| **Caption / Sub**| `13px` - `14px` | `13px` | Medium (500) | `20px` | Nhãn phụ, chú giải, trạng thái bảng |
| **Micro Tag** | `12px` | `12px` | SemiBold (600) | `16px` | Badge chip, thời gian giữ ghế (Tuyệt đối không < 12px) |

---

## 4. Khoảng Cách & Bố Cục (Spacing & Grid)

### 4.1. Chiều Cao Header & Khoảng Đệm Tránh Che Khuất [Đo đạc từ gotrail.vn]

| Breakpoint | Chiều rộng Viewport | Chiều cao Header | Padding Header | Khoảng cách nội dung đến đỉnh viewport | Khoảng hở an toàn dưới Header |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Desktop** | `>= 1024px` (đo tại 1440px) | **`102px`** | Top/Bottom `6px` | **`126px`** | **`24px`** |
| **Tablet** | `768px - 1023px` | **`74px`** | Top/Bottom `0px` | **`98px`** | **`24px`** |
| **Mobile** | `<= 767px` (đo tại 360px) | **`74px`** | Top/Bottom `0px` | **`98px`** | **`24px`** |

> **Khắc phục lỗi che tiêu đề khi cuộn**: Mọi liên kết neo cuộn trang (như `#system-trailbus`) bắt buộc phải có thuộc tính CSS:  
> `scroll-margin-top: 110px;` (trên desktop) và `scroll-margin-top: 80px;` (trên mobile) để khi nhảy tới liên kết, tiêu đề không bao giờ bị Header cố định đè lên!

### 4.2. Thang Khoảng Cách Thuần Túy (Spacing Values)
- `4px`: Khoảng cách rất nhỏ (icon padding).
- `8px`: Khoảng cách giữa icon và chữ.
- `12px`: Khoảng cách giữa các chip badge, khoảng cách input con.
- `16px`: Khoảng cách giữa các dòng thông số trong thẻ tour.
- `20px` - `24px`: Padding bên trong thẻ tour, khoảng hở hàng bảng, gap lưới card.
- `32px`: Padding khối trang chi tiết, khoảng cách giữa các phần form.
- `48px`: Khoảng cách giữa các nhóm phân đoạn lớn trong trang nội bộ.
- `50px`: **[Đo đạc từ section]** Padding trên/dưới của section trên mobile 360px.
- `95px`: **[Đo đạc từ section]** Padding trên/dưới của các section công khai trên gotrail.vn ở desktop 1440px.

---

## 5. Bo Góc, Viền & Bóng Đổ (Border Radius, Borders & Shadows)

### 5.1. Bo Góc (Border Radius)
- **Thẻ Card Tour công khai**: **`5px`** **[Đo đạc từ gotrail.vn: `.tour-card { border-radius: 5px; }`]**.
- **Nút bấm tiêu chuẩn / Nút lọc khu vực**: **`5px`** **[Đo đạc từ gotrail.vn: `.region-item { border-radius: 5px; }`]**.
- **Thẻ Card, Modal & Bảng Back-office**: **`6px`** đến **`8px`** **[Đề xuất]** (gọn gàng, vuông vức nhẹ nhàng, cấm bo tròn 24px - 32px tùy tiện).
- **Badge Chip**: `4px` (góc tù nhẹ) hoặc `9999px` (dạng pill tròn cho tag nhỏ).
- **Nút tròn điều hướng Carousel**: `50%` (`50px x 50px`) **[Đo đạc từ gotrail.vn: `.cardButton`]**.

### 5.2. Đường Viền (Borders)
- **Viền thẻ tour ngoài**: Không viền (sử dụng shadow nhẹ).
- **Viền gạch ngang phân cách thẻ tour**: **`1px solid #CCCCCC`** **[Đo đạc từ gotrail.vn: `.tour-info border-bottom`]**.
- **Viền bảng dữ liệu / ô nhập liệu**: **`1px solid #E0E0E0`** hoặc **`1px solid #6B7280`** cho viền ghế trống đạt WCAG **[Đề xuất]**.

### 5.3. Bóng Đổ (Box Shadows)
- **Thẻ Card Tour**: `0px 4px 8px 0px rgba(0, 0, 0, 0.1)` **[Đo đạc từ gotrail.vn: `.tour-card`]** (Bóng mờ cực kỳ thanh mảnh 8px với độ mờ 10%).
- **Dropdown Menu / Popover**: `0px 8px 16px 0px rgba(0, 0, 0, 0.12)` **[Đề xuất]**.
- **Back-office / Bảng**: Flat hoàn toàn (`box-shadow: none;`), sử dụng viền phân cách `1px solid #E0E0E0` để giữ bố cục phẳng, không gây rối mắt.

---

## 6. Hình Ảnh & Tỉ Lệ Khung Hình (Media)

1. **Ảnh Thẻ Tour (Card Image)**:
   - Tỉ lệ khung hình: `4:3` hoặc `16:10` (rộng 370px, cao 240px - 260px).
   - Hiển thị: `object-fit: cover; object-position: center;`.
   - Bo góc ảnh: Bo góc trên khớp vỏ thẻ (`border-top-left-radius: 5px; border-top-right-radius: 5px;`).
2. **Ảnh Bìa Tuyến Chi Tiết (Trip Detail Hero Banner)**:
   - Tỉ lệ khung hình: `16:9` trên mobile, `21:9` trên desktop (chiều cao tối đa 380px).
   - Lớp phủ gradient (ngoại lệ duy nhất): `linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0) 100%)` đặt dưới chữ trên ảnh bìa để làm nổi bật tên tuyến màu trắng trên mobile.
3. **Ảnh Fallback**: Khi tuyến tạo thủ công chưa có ảnh (`source_url = null`), tự động áp dụng ảnh `KVBUS-3.jpg` (ảnh xe bus Go-Trail chụp cùng thiên nhiên, không lộ chữ test).

---

## 7. Giọng Văn & Tiêu Chuẩn Nội Dung (Content & Tone)

- **Phong thái**: Chuyên nghiệp, an tâm, tràn đầy tinh thần dã ngoại cuối tuần. Hướng đến đối tượng nhân viên văn phòng, người mới bắt đầu trekking.
- **Tiêu chuẩn tiếng Việt**:
  - Viết đúng ngữ pháp, đủ dấu, rõ ràng.
  - Định dạng tiền tệ Việt Nam: `500.000 đ` hoặc `1.599.000 VND`.
  - Định dạng ngày giờ: `"Thứ Bảy, 24/10/2026 - 05:30"` (Múi giờ `Asia/Ho_Chi_Minh`).
- **Xử lý trạng thái rỗng (Empty State)**:
  - *Tuyệt đối không dùng*: Các hộp màu vàng/đỏ nhấp nháy chữ cảnh báo nguy hiểm.
  - *Chuẩn mực*: 1 icon màu trung tính (xám/xanh) + 1 dòng giải thích chân thực + 1 hành động kế tiếp.  
    *Ví dụ*: *"Hiện chưa có chuyến xe mở bán cho cung đường này. Bạn vui lòng liên hệ Hotline 0972699242 để được xếp đoàn sớm."*

---

## 8. Đặc Tả Thành Phần Giao Diện (Components Spec)

### 8.1. Nút Bấm (Buttons)

| Loại nút | Màu nền (Bg) | Màu chữ (Text) | Viền (Border) | Bo góc | Áp dụng & Phạm vi quy tắc |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CTA Chính (Primary)** | `#FEBB02` (Vàng) | `#000000` (Đen bold) | Không | `5px` hoặc `9999px` | **Portal & Đặt vé**: Chỉ 1 nút vàng/màn hình. **Trang công khai**: Nút Đăng ký và nút Chi tiết thẻ tour đều dùng vàng theo bản gốc. |
| **Thương Hiệu (Brand)** | `#186734` (Xanh) | `#FFFFFF` (Trắng) | Không | `5px` | Lọc vùng miền active, Xem chi tiết hành trình |
| **Phụ / Viền (Secondary)**| `#FFFFFF` (Trắng) | `#212529` (Đen) | `1px solid #6B7280` | `5px` | Quay lại, Hủy thao tác, Đóng modal, Xóa bộ lọc (viền đạt WCAG AA) |
| **Nguy Hiểm (Danger)** | `#C62828` (Đỏ) | `#FFFFFF` (Trắng) | Không | `5px` | Xác nhận hủy chuyến, Tạm ẩn tuyến |

### 8.2. Thẻ Tuyến (Tour Card)
- **Bố cục 1 cấp card**: 
  - Khung bao ngoài: nền trắng `#FFFFFF`, bo góc `5px`, bóng mờ `0px 4px 8px 0px rgba(0, 0, 0, 0.1)`.
  - Phần trên: Ảnh bìa (height 220px) có tag địa danh nổi ở góc trái.
  - Phần thân (`padding: 24px`):
    - Tên tuyến (H3, font Livvic Bold 700, 20px - 22px, màu đen `#000000`, chữ hoa).
    - Hàng tag: `Trekking`, `Xe bus khứ hồi`, `Leader dẫn đoàn`.
    - Danh sách thông số: Icon + Nhãn in đậm + Giá trị (Thời gian, Độ dài, Độ khó, Độ cao).
    - Gạch ngang mỏng (`border-bottom: 1px solid #CCCCCC`).
    - Hàng chân thẻ: Giá vé cơ sở (`font-size: 20px; font-weight: 700`) + Nút CTA `CHI TIẾT →` màu vàng `#FEBB02`.

### 8.3. Bảng Dữ Liệu Back-Office [Đề xuất]
- Chiều cao dòng: `44px - 48px`.
- Header bảng: Nền xám nhạt `#F8F9FA`, chữ hoa đầu câu, in đậm (weight 600), font-size 13px, màu `#212529`, viền đáy `1px solid #E0E0E0`.
- Căn lề chuẩn mực:
  - Cột văn bản (Tên, Email, Tuyến): Căn trái (Left).
  - Cột trạng thái / Badge: Căn giữa (Center).
  - Cột số liệu (Giá tiền, Số ghế, Doanh thu, Cự ly): **Bắt buộc căn phải (Right)** kèm font số dễ đọc.
- Thao tác dòng: Đặt ở cột cuối cùng, các nút biểu tượng (Edit, Lock, View) có kích thước 32px x 32px, hiển thị tooltip rõ ràng.

### 8.4. Khung Điều Hướng Shell [Đề xuất]
- **Back-office Shell (RouteMgr, HRMgr, Accountant, Admin)**:
  - **Sidebar màu đen đặc, không trong suốt (`#111111`)**, chiều rộng cố định `240px`, chữ màu trắng/xám `#9CA3AF`.
  - Mục menu đang chọn (Active): Nền xám đậm `#1F2937`, chữ trắng in đậm, có dải màu vàng `#FEBB02` rộng 4px ở mép trái.
  - Chân sidebar hiển thị Avatar, Tên nhân sự và Role Badge.
- **Leader Shell (Mobile-first)**:
  - Thanh Bottom Navigation Bar cố định đáy màn hình (cao `60px`), nền trắng hoặc đen đặc, 3 tab chính: `Chuyến đi`, `Quét QR`, `Tài khoản`.
  - Tab đang chọn có icon và nhãn màu xanh lá `#186734` hoặc vàng `#FEBB02`.

### 8.5. Sơ Đồ Chọn Ghế Xe Bus (Tiêu Chuẩn Rạp Chiếu Phim / Full Seat Map)
- **Hiển thị Full toàn bộ ghế (Bắt buộc)**:
  - Bắt buộc hiển thị **toàn bộ các hàng ghế của chiếc xe** (11 hàng ghế A-B-C-D cho xe 45 chỗ; 8 hàng cho xe 29 chỗ).
  - **Tuyệt đối không sử dụng khung giới hạn chiều cao cố định kèm thanh cuộn (`max-h` + `overflow-y-auto`)**. Lý do: Sơ đồ xe khách có kích thước gọn gàng (~400px), việc nhét thanh cuộn riêng gây lỗi "scroll-trap" nghiêm trọng trên màn hình điện thoại (ngón tay vuốt trang bị kẹt vào box cuộn ghế), đồng thời che khuất tầm nhìn bao quát của khách hàng về vị trí đầu/đuôi xe và các ghế trống còn lại. Thiết kế phải trực quan, liền mạch tương tự như giao diện chọn ghế rạp chiếu phim hiện đại.
  - Phần đầu xe có chỉ dẫn trực quan: Biểu tượng vô lăng bác tài (`Disc`), nhãn "Vô lăng bác tài" và "Cửa lên xe".
  - Lối đi giữa xe đánh số thứ tự hàng ghế (1 - 11) rõ ràng để định vị.
- **Kích thước và tương tác ô ghế**:
  - Kích thước ô ghế tối thiểu: `36px x 32px` trên desktop và chuẩn chạm touch target thân thiện trên mobile.
  - Phân biệt trạng thái ghế rõ ràng (đạt chuẩn WCAG AA và phong cách GoTrail):
    - **Ghế trống (Available)**: Nền trắng, viền xám `#D1D5DB`, chữ đen/xám đậm, hover viền đen.
    - **Ghế đang chọn (Selected)**: Nền vàng `#FEBB02`, viền vàng đậm, chữ đen in đậm (`12.32:1`), viền ngoài ring-2 ring-black, scale nhẹ 1.05.
    - **Ghế người khác đang giữ (Locked)**: Nền xám nhạt `#FFF8E1`, viền cam, chữ cam đậm `#8A5A00` (`5.58:1`), icon ổ khóa nhỏ.
    - **Ghế đã bán (Sold)**: Nền xám `#878787`, viền xám `#878787`, chữ trắng, chuột disabled `cursor-not-allowed`.
- **Thanh tổng kết / Giỏ hàng mini**:
  - Bảng tóm tắt ghế đã chọn, tính tiền tự động theo số lượng vé, nút "Đặt vé ngay" màu vàng `#FEBB02`.

---

## 8.6. Nguyên Tắc Tái Sử Dụng Tuyệt Đối (Single Source of Truth)
- **Đóng gói component dùng chung**: Bất kỳ thành phần nào đã clone về chuẩn và hoạt động ổn định (Header/Navbar, Footer, Thẻ Tour, Nút nổi Zalo & Messenger, Filter Vùng miền...) **bắt buộc phải được đóng gói thành Reusable Component** trong `src/components/ui/` hoặc `src/components/catalog/`.
- **Không nhân bản mã nguồn (Zero Markup Duplication)**:
  - Khi triển khai màn hình mới (ví dụ: Chi tiết tuyến, Đặt chỗ, Trang cá nhân...), bắt buộc phải import và tái sử dụng các component đã có (như `<Navbar />`, `<Footer />`).
  - Tuyệt đối không sao chép lại hàng trăm dòng mã HTML/CSS của footer hay header vào từng trang riêng lẻ, nhằm đảm bảo:
    1. Đồng nhất 100% nhận diện thương hiệu, thông tin liên hệ (SGU, Quỳnh Tiên - Tiến An, hotline, mạng xã hội, logo Tổ Ong).
    2. Một điểm sửa đổi duy nhất (Single Point of Modification) - chỉnh sửa một nơi, toàn hệ thống tự động cập nhật.
    3. Tránh sai lệch layout, CSS thừa thãi và giảm kích thước bundle.

---

## 9. Danh Sách Kiểm Tra Khi Duyệt Màn Hình (Design Review Checklist)

Trước khi chuyển một bản thiết kế từ Stitch/Figma sang viết code, người thiết kế và lập trình viên phải tích đủ các tiêu chí:

- [ ] Đúng 2 màu chủ đạo: Vàng `#FEBB02` (chỉ 1 CTA chính trên Portal/Đặt vé; trang công khai giữ nút vàng theo bản gốc) và Xanh lá `#186734` (thương hiệu).
- [ ] Tuyệt đối không có màu tím/indigo, không có hiệu ứng glow, glassmorphism.
- [ ] Ngoại lệ gradient duy nhất là lớp phủ đen → trong suốt dưới chữ trên ảnh bìa; mọi gradient khác đều bị cấm.
- [ ] Không có card lồng card; viền mỏng 1px; bo góc đồng nhất 5px - 8px.
- [ ] Không có chữ nhỏ hơn 12px; font Livvic hiển thị đúng chuỗi tiếng Việt chuẩn ở 5 weights (400, 500, 600, 700, 900).
- [ ] Tiêu đề trong portal dùng chữ hoa đầu câu (Sentence case).
- [ ] Không chứa bất kỳ thuật ngữ lập trình/tài liệu nào trên giao diện.
- [ ] Trạng thái rỗng (empty state) thể hiện trung tính, không dùng khung cảnh báo vàng gây hoang mang.
- [ ] Mọi màu sắc và viền tương tác đều đạt tỷ lệ tương phản WCAG AA (≥ 4.5:1 cho text, ≥ 3.0:1 cho UI component).
- [ ] Đạt chuẩn hiển thị trên cả 3 độ phân giải: 1440px (Desktop), 768px (Tablet), 360px (Mobile).
