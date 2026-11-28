# SCRUM-55 · Diễn tập kiến trúc và luồng booking

**Câu hỏi mở màn:** Nếu tám khách cùng chọn ghế A01, điều gì đảm bảo chỉ một người giữ được ghế, kể cả khi họ bấm lại hoặc tiền đến muộn?

**Thời lượng:** 7 phút. Nguyễn Quốc Cường trình bày, một thành viên chạy terminal và Trần Nguyễn Thanh Trúc review theo kế hoạch Jira. Dùng [bản bàn giao SCRUM-52](../handoff/SCRUM-52.md). Mọi khoản tiền trong phần trình bày là dữ liệu mô phỏng.

## Chuẩn bị và chạy lại

1. Checkout nhánh demo trên máy diễn tập. Kiểm tra `git rev-parse --short HEAD`, Node theo [.node-version](../../.node-version), và `docker info`. Lần đầu cần tải được image `postgres:18`.
2. Chạy `npm ci --ignore-scripts`, sau đó `npm run db:generate` từ gốc repo. Mở [service giữ ghế](../../src/server/services/bookings.ts) và [repository khóa ghế](../../src/server/repositories/bookings.ts) cạnh terminal.
3. Chạy **`npm run test:bookings:concurrency`**. Script tự tạo container PostgreSQL tên ngẫu nhiên, bind localhost, áp migration rồi tạo chuyến Open, xe bốn ghế A01–A04, một RouteMgr và tám khách giả lập. Mỗi tình huống khởi tạo lại fixture trong DB riêng; kết thúc script sẽ dọn container. Chạy lại cùng lệnh để trở về dữ liệu ban đầu.
4. Có thể bắt đầu lệnh trước phần giới thiệu. Nếu thiếu Docker hoặc tải image thất bại, chuyển sang [log CI đã lưu, bước 10](https://github.com/quynhtien1977/go-trail/actions/runs/46039642020/job/140643799935). Khi dùng log, nói rõ đây là kết quả lần chạy trước.

## Lời dẫn và bằng chứng trên màn hình

| Phút | Người trình bày | Người điều khiển |
|---|---|---|
| 0–1 | “Khách gửi yêu cầu giữ ghế qua HTTP. Route xác thực phiên và đọc input; service quyết định có được giữ ghế; repository thực thi khóa và ghi vào PostgreSQL.” | Mở [route giữ ghế](../../src/app/api/departures/%5Bid%5D/holds/route.ts). Chỉ ra demo gọi service trực tiếp để điều phối nhiều kết nối; phần HTTP có kết quả ở bước 12 của CI. |
| 1–3 | “Tám khách thấy cùng ghế trống. Service phải đọc lại ghế sau khi có khóa. Người thắng tạo hóa đơn Pending và giữ ghế trong cùng transaction.” | Tìm dòng `8 concurrent customers contest one seat`. Mở assertion ngay sau cuộc đua trong [kịch bản thực thi](../../tests/integration/booking-concurrency.mjs). Có đúng một invoice và một dòng vé, bảy yêu cầu còn lại bị từ chối. |
| 3–4 | “Một khách gửi lại tám lần là tình huống khác. Khóa theo khách và idempotency key giúp trả lại cùng hóa đơn. Nếu đổi hành khách với cùng khóa thì bị từ chối.” | Tìm `8 duplicate requests` và `same key with a different passenger payload`. Chỉ vào phép kiểm tra tập ID hóa đơn có kích thước 1. |
| 4–5 | “Đặt hai ghế phải thành công cả hai. Nếu ghế thứ hai đã bán, transaction rollback và ghế thứ nhất không bị giữ dở.” | Mở ca kiểm tra nhiều ghế và dòng PASS có cụm `no partial invoice`. Giải thích thứ tự khóa ghế nhất quán khi hai yêu cầu chọn ghế theo thứ tự ngược nhau. |
| 5–6 | “Bây giờ giả lập webhook bằng service nội bộ. Khi có chuyển khoản trùng hoặc tiền đến muộn, trạng thái ghế và mã giao dịch quyết định kết quả.” | Tìm `a late SePay payment` và `6 retries and 2 other transfers`. Chỉ ra ba mã chuyển khoản khác nhau được ghi nhận, một khoản xác nhận hóa đơn, hai vé có hai mã riêng. Không dùng app ngân hàng hoặc QR chuyển tiền thật. |
| 6–7 | “Ai thắng cuộc đua có thể thay đổi. Các điều phải luôn đúng là một ghế chỉ bán một lần, gửi lại không nhân đôi hóa đơn và khoản tiền đến có dấu vết.” | Hiện dòng tổng kết cuối. Mời reviewer chọn một ca để giải thích lại từ kết quả DB đến đoạn code tạo khóa. |

## Ghi nhận sau diễn tập nhóm

**Diễn tập kỹ thuật ngày 28/11/2026:** đã chạy hai lần liên tiếp trên máy local với Docker PostgreSQL 18, mã ứng dụng `477b853`. Cả hai lần kết thúc với `PASS: 25 PostgreSQL booking concurrency groups; independent connections, no remote database.` Đây là bằng chứng kịch bản chạy lại được. Phần diễn tập có người trình bày và reviewer được ghi riêng bên dưới.

Người điều khiển ghi ngày, SHA, người tham gia, chạy trực tiếp hay dùng log, ca nào lệch dự kiến và cách xử lý. Reviewer xác nhận trên [SCRUM-55](https://zair0u.atlassian.net/browse/SCRUM-55) sau buổi tập. Căn cứ kiến trúc và phạm vi kiểm thử nằm ở mục 10 và 15.8 của [PRD](../PRD.md).
