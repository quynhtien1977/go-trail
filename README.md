# Go-Trail

Hệ thống đặt vé xe khứ hồi kèm Leader dẫn đoàn trekking/dã ngoại. Dự án phục vụ đồ án nhóm, tập trung vào quản lý chuyến, đặt ghế, thanh toán và vận hành đoàn.

## Trạng thái hiện tại

Repo đang ở giai đoạn khởi tạo: có scaffold Next.js, TypeScript, Tailwind CSS và ESLint. Trang chủ vẫn là giao diện mặc định của Next.js. Database, đăng nhập và các tính năng nghiệp vụ bên dưới nằm trong kế hoạch triển khai.

## Phạm vi MVP

- Xem tuyến, lịch khởi hành và sơ đồ ghế. Khách phải đăng nhập để giữ ghế và mua vé.
- Một tài khoản đặt nhiều ghế; mỗi ghế có thông tin hành khách và điểm đón riêng.
- Thanh toán chuyển khoản bằng VietQR, xác nhận qua webhook SePay.
- Quản lý vé QR, hủy vé và hoàn tiền theo chính sách. Kế toán/Admin duyệt và xác nhận hoàn tiền thủ công.
- Quản lý xe, tài xế, phụ xe, Leader và phân công theo chuyến.
- Leader check-in hành khách bằng QR trên điện thoại, đánh dấu vắng và kết thúc chuyến.
- Đánh giá sau chuyến, báo cáo doanh thu/lãi lỗ và nhật ký kiểm toán.

Voucher, vé phụ, thuê xe ngoài, tracklog, VNPay/MoMo và hoàn tiền tự động qua ngân hàng nằm ngoài MVP.

## Vai trò

| Role | Trách nhiệm chính |
| --- | --- |
| `Customer` | Đặt vé, thanh toán, quản lý vé và đánh giá |
| `Leader` | Xem chuyến được phân công, check-in và kết thúc chuyến |
| `RouteMgr` | Quản lý tuyến, chuyến và danh sách hành khách |
| `HRMgr` | Quản lý nhân sự, đội xe, phân công và chi phí chuyến |
| `Accountant` | Đối soát thanh toán, hoàn tiền và báo cáo tài chính |
| `Admin` | Quản lý tài khoản, cấu hình, audit và toàn bộ hệ thống |

Driver và Assistant có hồ sơ nhân sự nhưng không đăng nhập hệ thống.

## Công nghệ

| Thành phần | Công nghệ | Trạng thái |
| --- | --- | --- |
| Framework | Next.js 16.4.0, App Router | Đã cài |
| UI runtime | React 19.3.0 | Đã cài |
| Ngôn ngữ | TypeScript 5, strict mode | Đã cấu hình |
| Styling | Tailwind CSS 4 | Đã cài |
| Kiểm tra mã | ESLint 9 | Đã cấu hình |
| Database / ORM | PostgreSQL trên Supabase, Prisma | Dự kiến |
| Xác thực | Auth.js, credentials + JWT sessions | Dự kiến |
| Form / components | React Hook Form, Zod, shadcn/ui | Dự kiến |
| Thanh toán | VietQR + webhook SePay | Dự kiến |

Dùng npm và giữ `package-lock.json` để thống nhất dependency giữa các máy.

## Chạy local

Yêu cầu Node.js **20.9.0 trở lên** theo phiên bản Next.js đã cài, cùng npm. Sau khi clone repo, chạy tại thư mục gốc:

```bash
npm ci
npm run dev
```

Mở [localhost:3000](http://localhost:3000). Scaffold hiện tại chạy được mà chưa cần kết nối database hoặc cấu hình thanh toán.

Các lệnh kiểm tra:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Sau khi build, chạy `npm run start` để mở production server local. Repo hiện chưa có test runner hoặc script `npm test`.

## Biến môi trường

Khi triển khai backend, tạo `.env` tại thư mục gốc và điền cấu hình của đúng môi trường:

```dotenv
DATABASE_URL=
DIRECT_URL=
AUTH_SECRET=
SEPAY_API_KEY=
CRON_SECRET=
BANK_ID=
BANK_ACCOUNT_NUMBER=
BANK_ACCOUNT_NAME=
SEED_PASSWORD=
```

- `DATABASE_URL`: PostgreSQL connection string cho Prisma; không phải Supabase project API URL.
- `DIRECT_URL`: tùy chọn kết nối direct/session cho migrations khi runtime dùng transaction pooler; sẽ được nối khi cấu hình Prisma.
- `AUTH_SECRET`: secret ngẫu nhiên cho Auth.js.
- `SEPAY_API_KEY`: secret xác thực webhook tiền vào, khớp cấu hình SePay.
- `CRON_SECRET`: secret riêng để bảo vệ các tác vụ nền.
- `BANK_*`: thông tin tài khoản công ty nhận thanh toán VietQR.
- `SEED_PASSWORD`: mật khẩu tài khoản demo khi chạy seed trên môi trường phát triển.

Các biến được sử dụng khi tính năng tương ứng được triển khai. Giữ env thật ngoài Git và không đặt tiền tố `NEXT_PUBLIC_` cho secrets hoặc connection strings. Thông tin ngân hàng khách nhận hoàn tiền được lưu theo yêu cầu hoàn tiền, không đặt trong env.

## Kiến trúc dự kiến

Route Handlers xác thực, kiểm quyền, validate request rồi gọi services. Logic booking, payment, refund và departure đặt trong `src/server/services/`; Prisma quản lý schema, migrations và seed trong `prisma/`.

- Kiểm quyền trên server theo role, chủ sở hữu dữ liệu và phân công chuyến.
- Giữ ghế và xử lý tiền trong DB transaction, có cơ chế idempotency.
- Khóa nhiều ghế theo thứ tự cố định; một ghế thất bại thì rollback toàn bộ đơn.
- Webhook trùng không được tạo thêm payment hoặc xác nhận vé lần nữa.
- Tiền VND dùng Decimal; thời gian lưu UTC, hiển thị theo `Asia/Ho_Chi_Minh`.
- Thay đổi về tiền, trạng thái chuyến và quyền truy cập phải có audit log.

## Lộ trình triển khai

1. Schema Prisma, migration và seed dữ liệu mẫu.
2. Auth, phân quyền và audit log.
3. Quản lý tuyến, xe, nhân sự, chuyến và phân công.
4. Chọn/giữ ghế, tạo hóa đơn và trang thanh toán.
5. Webhook SePay, xử lý thanh toán cần đối soát và vé QR.
6. Check-in Leader, kết thúc chuyến và đánh giá.
7. Hủy vé, chính sách hoàn tiền và xử lý hủy/dời chuyến.
8. Dashboard, báo cáo, cảnh báo và cron.

Trước khi tạo migration, nhóm cần chốt ràng buộc bán lại ghế, thứ tự tạo hóa đơn/khóa ghế, giá trị cấu hình hệ thống và các chuyển trạng thái hủy/dời chuyến. Quy tắc xử lý chuyển thừa tiền cũng cần thống nhất trước khi triển khai payment.
