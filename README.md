# Go-Trail

Hệ thống đặt vé xe khứ hồi kèm Leader dẫn đoàn trekking/dã ngoại. Dự án phục vụ đồ án nhóm, tập trung vào quản lý chuyến, đặt ghế, thanh toán và vận hành đoàn.

## Trạng thái hiện tại

Đã có scaffold Next.js và nền database: schema Prisma gồm 21 bảng, migrations PostgreSQL, catalog tham khảo từ GoTrail với importer idempotent, seed phát triển và Prisma client dùng trên server. Trang chủ vẫn là giao diện mặc định của Next.js; đăng nhập và các luồng nghiệp vụ bên dưới chưa triển khai.

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
| Database / ORM | PostgreSQL trên Supabase, Prisma 7.10.0 + adapter pg | Đã triển khai schema, migration, seed |
| Xác thực | Auth.js, credentials + JWT sessions | Dự kiến |
| Form / components | React Hook Form, Zod, shadcn/ui | Dự kiến |
| Thanh toán | VietQR + webhook SePay | Dự kiến |

Dùng npm và giữ `package-lock.json` để thống nhất dependency giữa các máy.

## Chạy local

Dùng Node.js **24 LTS** cùng npm. Prisma cũng hỗ trợ Node 20.19+ hoặc 22.12+. Sau khi clone repo, chạy tại thư mục gốc:

```bash
npm ci
npm run dev
```

Mở [localhost:3000](http://localhost:3000). Scaffold hiện tại chạy được mà chưa cần kết nối database hoặc cấu hình thanh toán.

Các lệnh kiểm tra:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Sau khi build, chạy `npm run start` để mở production server local. `npm test` chạy migration và kiểm tra ràng buộc trên PostgreSQL WASM (PGlite) trong bộ nhớ, không dùng database Supabase hay env thật. Prisma Client được sinh tự động khi cài dependency, kiểm tra TypeScript và build.

## Biến môi trường

Tạo `.env` tại thư mục gốc và điền cấu hình của đúng môi trường:

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
- `DIRECT_URL`: kết nối direct hoặc session pooler từ mục Connect của Supabase, dùng cho Prisma CLI và seed. Nếu để trống, chúng dùng `DATABASE_URL`. Runtime Prisma chỉ dùng `DATABASE_URL`; có thể dùng transaction pooler cho ứng dụng serverless.
- `AUTH_SECRET`: secret ngẫu nhiên cho Auth.js.
- `SEPAY_API_KEY`: secret xác thực webhook tiền vào, khớp cấu hình SePay.
- `CRON_SECRET`: secret riêng để bảo vệ các tác vụ nền.
- `BANK_*`: thông tin tài khoản công ty nhận thanh toán VietQR.
- `SEED_PASSWORD`: mật khẩu demo khi seed trên môi trường phát triển, ít nhất 16 ký tự và tối đa 72 byte UTF-8 (giới hạn bcrypt). Không ghi mật khẩu vào Git hoặc console.

Các biến được sử dụng khi tính năng tương ứng được triển khai. Giữ env thật ngoài Git và không đặt tiền tố `NEXT_PUBLIC_` cho secrets hoặc connection strings. Thông tin ngân hàng khách nhận hoàn tiền được lưu theo yêu cầu hoàn tiền, không đặt trong env.

## Thiết lập database

Chỉ chạy trên đúng database dành cho go-trail. Với project Supabase mới hoặc để áp dụng migration đã review:

```bash
node scripts/check-db-connection.mjs
npm run db:validate
npm run db:deploy
npm run db:seed
npm run db:status
```

`db:seed` chỉ dành cho development; từ chối khi `NODE_ENV=production`. Seed import catalog đã review, sau đó tạo fixture bằng transaction/upsert. Chạy lại giữ nguyên mật khẩu, cấu hình, nội dung/giá catalog và trạng thái đã có. Thay đổi `SEED_PASSWORD` không đổi mật khẩu tài khoản đã seed. Seed/importer chỉ cho phép database local hoặc đúng project Supabase go-trail đã được cấu hình trong target guard.

Catalog gồm 8 tuyến và 13 điểm đón xe đã review từ snapshot GoTrail. Độ khó chưa xác minh và độ cao không áp dụng được lưu `null`. Giá là giá tham khảo gói xe + Leader, cần xác nhận trước khi mở bán thật. URL ảnh nằm trong [assets.json](data/reference/gotrail/assets.json), chưa đưa vào schema hoặc tải ảnh.

Dữ liệu kiểm thử: mỗi role có email `<role viết thường>@go-trail.example.test` (ví dụ `admin@go-trail.example.test`), 1 Leader/Driver/Assistant, 1 xe có 16 ghế và 3 chuyến `Draft`/`Open`/`Closed`. Lịch tháng 1/2030 có `is_demo=true`, với giờ đón fixture; không phải lịch mở bán từ nguồn. Public/booking thực tế phải loại các chuyến này. Không có hóa đơn hoặc giao dịch thanh toán mẫu. Cấu hình ban đầu: giữ ghế 15 phút, tối đa 10 ghế/hóa đơn, 15 khách/Leader; chính sách hoàn 168h→100%, 72h→70%, 24h→30%, 0h→0%.

Để chỉ import catalog và thay hai tuyến demo cũ, không seed tài khoản/xe/cấu hình:

```bash
npm run db:catalog -- --dry-run
npm run db:catalog -- --apply
```

Áp dụng migrations trước khi chạy importer. Mặc định là dry-run: thực thi trong transaction rồi rollback, nhưng PostgreSQL sequences có thể tăng nên ID không đảm bảo liên tục. [import-review.json](data/reference/gotrail/import-review.json) ghi lựa chọn giá/điểm đón/lịch trình cùng SHA-256 của snapshot; sửa dataset cần review lại. Import không gọi website khi chạy, không tạo ngày khởi hành thực và chạy lại không ghi đè chỉnh sửa trong DB. Thay demo giữ ID/FK; điểm đón mẫu không còn dùng được đánh dấu `is_active=false`. Nếu demo đã có booking/chi phí hoặc bị sửa, importer dừng và rollback để đối chiếu.

Để phát triển migration mới, dùng database local riêng và shadow database, chạy `npm run db:migrate -- --name ten_thay_doi`. Không chạy lệnh reset hay `migrate dev` vào Supabase dùng chung. Partial unique index và CHECK nằm trong SQL migration; giữ các ràng buộc này khi tạo migration tiếp theo. Prisma quản lý lịch sử schema; không tạo thêm lịch sử migration qua Supabase SQL Editor/MCP.

Các bảng bật RLS, thu hồi quyền table/sequence của Data API roles; truy cập dữ liệu qua backend Prisma. RBAC và quyền theo chủ sở hữu/phân công sẽ được bổ sung ở bước Auth; browser không truy vấn trực tiếp bảng Supabase.

## Kiến trúc

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

Đã chốt: mỗi ghế tối đa một vé chưa hủy; trong một transaction tạo hóa đơn trước, khóa ghế theo thứ tự rồi tạo vé; hủy/dời chuyến từ `Open`/`Closed`/`Confirmed`. Bước tiếp theo là Auth, RBAC và audit log. Quy tắc xử lý chuyển thừa tiền còn cần thống nhất trước khi triển khai payment.
