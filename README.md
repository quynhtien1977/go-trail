# Go-Trail

Hệ thống đặt vé xe khứ hồi kèm Leader dẫn đoàn trekking/dã ngoại. Dự án phục vụ đồ án nhóm, tập trung vào quản lý chuyến, đặt ghế, thanh toán và vận hành đoàn.

## Trạng thái hiện tại

Đã có scaffold Next.js, 21 bảng nghiệp vụ PostgreSQL, catalog tham khảo từ GoTrail với importer idempotent, seed phát triển và Prisma client trên server. Backend Auth/RBAC/audit đã có: đăng ký Customer, credentials/JWT, rate limit dùng chung qua Upstash Redis, Proxy kiểm nhóm route, service kiểm chủ hóa đơn/phân công Leader và thay đổi quyền có audit. Migration Auth chỉ bổ sung `users.auth_version` và CHECK không âm; không tạo bảng counter PostgreSQL.

Trang chủ vẫn là giao diện mặc định của Next.js. UI đăng nhập/đăng ký và các trang `/account`, `/leader`, `/staff`, `/admin` chưa được xây; các luồng đặt vé/thanh toán chưa triển khai. Áp dụng migration Auth vào database của môi trường trước khi sử dụng các API mới.

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
| Xác thực | Auth.js (`next-auth` 4.24.15), credentials + JWT sessions | Backend đã triển khai |
| Validation | Zod 4.6.5 | Schema Auth dùng chung client/server |
| Form / components | React Hook Form, shadcn/ui | Dự kiến |
| Thanh toán | VietQR + webhook SePay | Dự kiến |

Dùng npm và giữ `package-lock.json` để thống nhất dependency giữa các máy.

Kiểm tra npm advisory ngày 11/10/2026 còn 9 findings mức high từ dependency chain Prisma CLI (`deepmerge-ts`, `mysql2`) và ESLint (`braces`/glob). Auth mới không thêm advisory. Các package này phục vụ cấu hình/migration/lint; ứng dụng dùng PostgreSQL, không dùng MySQL hoặc nhận glob/config từ HTTP. Tạm giữ baseline và đối chiếu lại trước release, hạn review 18/10/2026; không chạy `npm audit fix --force` vì đề xuất hiện tại downgrade Prisma/Next ESLint qua major version.

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
npm run audit:check
```

### Quy trình CI tự động

Repository sử dụng GitHub Actions workflow (`.github/workflows/ci.yml`) để tự động kiểm tra chất lượng trên các Pull Request và khi push vào nhánh `main`, `develop`.

Các bước kiểm tra trong job `quality`:
1. Cài đặt dependencies sạch: `npm ci --ignore-scripts`
2. Tạo Prisma Client: `npm run db:generate`
3. Kiểm tra cú pháp và quy chuẩn: `npm run lint`
4. Kiểm tra kiểu dữ liệu: `npm run typecheck`
5. Chạy unit & integration tests: `npm test` (48 tests trên PGlite và Redis test double, không dùng secret)
6. Kiểm tra biên dịch production: `npm run build`
7. Kiểm tra bảo mật dependency: `npm run audit:check` (đối chiếu baseline `.github/security-audit-baseline.json` hạn 18/10/2026; cảnh báo và dừng nếu có lỗ hổng mới hoặc quá hạn)

Sau khi build, chạy `npm run start` để mở production server. Auth trên production yêu cầu `NEXTAUTH_URL` là URL HTTPS canonical; dùng `npm run dev` khi chạy Auth local qua HTTP.

`npm test` chạy migrations, constraints và service Auth/RBAC/audit trên PostgreSQL WASM (PGlite) cô lập trong bộ nhớ. Các test service dùng Prisma thật qua socket local và Redis REST test double; không đọc env hoặc gọi dịch vụ bên ngoài. Lua được kiểm tra riêng trên Upstash thật. Prisma Client được sinh tự động khi cài dependency, kiểm tra TypeScript và build. PGlite không thay thế bài kiểm thử concurrency nhiều session trên PostgreSQL thật cho booking sau này.

Kiểm thử thêm các route HTTP thật sau khi build:

```bash
npm run build
npm run test:auth:redis
npm run test:auth:http
```

Hai integration commands cần Redis credentials trong root `.env`. Test Redis kiểm tra Lua/concurrency/TTL bằng keys test ngẫu nhiên và xóa đúng các keys đó. HTTP smoke khởi chạy production server với database và Auth secret riêng, kiểm tra đủ 6 role, cookie, CSRF, Proxy, ownership, phân công, thu hồi phiên, logout và lỗi Redis/DB; không tạo dữ liệu trên Supabase. Counter HTTP dùng namespace test riêng và tự hết hạn sau 15 phút. Nó mô phỏng HTTPS ingress bằng URL canonical và cookie jar trong Node, không kiểm thử TLS hoặc giao diện trình duyệt.

## Biến môi trường

Tạo `.env` tại thư mục gốc và điền cấu hình của đúng môi trường:

```dotenv
DATABASE_URL=
DIRECT_URL=
AUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
AUTH_RATE_LIMIT_NAMESPACE=
SEPAY_API_KEY=
CRON_SECRET=
BANK_ID=
BANK_ACCOUNT_NUMBER=
BANK_ACCOUNT_NAME=
SEED_PASSWORD=
```

- `DATABASE_URL`: PostgreSQL connection string cho Prisma; không phải Supabase project API URL.
- `DIRECT_URL`: kết nối direct hoặc session pooler từ mục Connect của Supabase, dùng cho Prisma CLI và seed. Nếu để trống, chúng dùng `DATABASE_URL`. Runtime Prisma chỉ dùng `DATABASE_URL`; có thể dùng transaction pooler cho ứng dụng serverless.
- `AUTH_SECRET`: secret ngẫu nhiên cho Auth.js, tối thiểu 32 ký tự. Đổi secret thu hồi toàn bộ phiên đang tồn tại.
- `NEXTAUTH_URL`: URL canonical của ứng dụng; `http://localhost:3000` khi dev, URL HTTPS thực tế khi production. Cập nhật khi đổi cổng local. Biến này thuộc Auth.js v4; chưa dùng API/cấu hình v5 beta.
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`: HTTPS REST endpoint Upstash và token có quyền ghi, chỉ dùng trên server. Thiếu/lỗi Redis thì login/registration bị từ chối; các phiên đã đăng nhập vẫn được kiểm tra qua PostgreSQL.
- `AUTH_RATE_LIMIT_NAMESPACE`: tùy chọn, bỏ trống để dùng `go-trail:auth:<VERCEL_ENV hoặc NODE_ENV>`; dùng giá trị riêng khi nhiều deployment cần tách budget. Tách Redis development/Preview khỏi Production; namespace không thay thế phân quyền credentials.
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

Các bảng bật RLS, thu hồi quyền table/sequence của Data API roles; truy cập qua backend Prisma. Auth/RBAC kiểm quyền trên server theo role, chủ hóa đơn và phân công Leader; browser không truy vấn trực tiếp bảng Supabase.

## Hợp đồng Auth/RBAC

Đăng nhập/đăng xuất sử dụng `signIn("credentials", { email, password, redirect: false })` và `signOut()` từ `next-auth/react`; dùng `/api/auth/signin` mặc định để thử backend trước khi có UI. Đăng ký không tự đăng nhập. Mật khẩu đăng ký từ 12 ký tự, tối đa 72 byte UTF-8; không trim mật khẩu. Email được trim/lowercase. Hệ thống chưa có xác minh email hoặc quên mật khẩu.

| Endpoint | Quyền và dữ liệu |
| --- | --- |
| `POST /api/auth/register` | Public; chỉ `{ email, password, full_name, phone }`, luôn tạo Customer; từ chối trường thừa như `role`/`status` |
| `/api/auth/*` | Auth.js xử lý CSRF, credentials, cookie và JWT; login lỗi trả `CredentialsSignin` chung |
| `GET /api/account/me` | Mọi role đang đăng nhập; trả profile của chính mình, không trả password hash |
| `GET /api/invoices/:id` | Customer chủ hóa đơn hoặc Admin; DTO tóm tắt hóa đơn, tiền VND dạng chuỗi; dữ liệu không thuộc mình trả 404 |
| `GET /api/leader/departures` | Leader được phân công và staff Active, chỉ Confirmed/Running/Ended; Admin xem các chuyến trong những trạng thái này; tối đa 100, chưa có manifest/tiền/ngân hàng |
| `PATCH /api/admin/users/:id/access` | Admin; `{ role?, status? }`; thay đổi và audit trong một transaction, thu hồi phiên cũ; không chuyển role phá liên kết Leader/STAFF hoặc loại Admin Active cuối cùng |

Các API ứng dụng trả `{ data: ... }` hoặc `{ error: { code, message } }`, `Cache-Control: private, no-store`. Auth.js giữ response riêng của thư viện. Mọi POST/PATCH cần `Origin` khớp `NEXTAUTH_URL`; Auth.js POST còn cần CSRF token. Không gửi credentials hoặc cookie vào logs.

Phiên tối đa tuyệt đối 8 giờ, cookie HttpOnly/SameSite=Lax và Secure trên production. JWT update từ client không thay đổi quyền. Server kiểm lại `status`, role và `auth_version`; khóa/mở khóa/đổi role tăng version, phiên cũ không dùng lại được.

Rate limit fixed window 15 phút tính từ lần thử đầu, counter update nguyên tử bằng Lua trong Upstash Redis: 10 lần login/email, 3 lần đăng ký/email. Trên Vercel bổ sung 50 lần login/IP và 50 lần đăng ký/IP, chỉ tin header do platform cấp khi `VERCEL=1`; email/IP được HMAC bằng secret trước khi lưu. Keys có namespace môi trường và TTL, lần thử sau không kéo dài TTL; không dùng quota toàn site. Local/host khác không tin forwarded headers; public self-host cần cấu hình limiter tại ingress đáng tin cậy trước khi triển khai.

Redis lỗi/timeout không được cho qua hoặc fallback về RAM. REST request timeout 2 giây, không retry counter để tránh đếm hai lần. Registration trả 503 `AUTH_UNAVAILABLE`; `signIn` trả mã lỗi `AUTH_UNAVAILABLE` khi dịch vụ không khả dụng, tách khỏi `CredentialsSignin` chung cho sai thông tin/Locked/hết budget. UI hiển thị thông báo thử lại, không hiển thị chi tiết provider.

Proxy chỉ kiểm JWT/role sơ bộ: Customer vào `/account`, Leader vào `/leader`, các quản lý vào `/staff`, Admin vào tất cả nhóm. Mỗi protected page/action mới phải gọi `getRouteActor()` và mỗi handler/service phải xác thực/kiểm quyền lại; quyền cụ thể của RouteMgr/HRMgr/Accountant không suy ra từ việc cùng vào `/staff`.

`writeAudit(tx, actorId, event)` nhận event allowlist cho đổi quyền, trạng thái tài khoản/chuyến và số tiền. Gọi trong cùng transaction với thao tác nghiệp vụ; không truyền request body, credentials, ngân hàng hoặc mô tả tùy ý.

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

Đã chốt: mỗi ghế tối đa một vé chưa hủy; trong một transaction tạo hóa đơn trước, khóa ghế theo thứ tự rồi tạo vé; hủy/dời chuyến từ `Open`/`Closed`/`Confirmed`. Backend bước 2 đã có; tiếp theo hoàn thiện UI Auth và triển khai bước 3 (CRUD/vận hành). Quy tắc chuyển thừa tiền cần thống nhất trước khi triển khai payment.
