# Go-Trail

Ứng dụng đặt vé xe khứ hồi kèm Leader dẫn đoàn trekking

## Trạng thái dự án

Đã có schema/database, dữ liệu mẫu, Auth/RBAC/audit, backend catalog và quản lý tuyến/điểm đón, giao diện đăng nhập/đăng ký, portal theo role, trang chủ và About Us. GitHub Actions đã kiểm tra chất lượng tự động.

Danh sách tour trên trang chủ còn dùng fixture, chưa nối API catalog. Quản lý xe/nhân sự/chuyến, booking, thanh toán SePay và check-in QR đang được phát triển.

## Công nghệ

Next.js App Router · React · TypeScript · Tailwind CSS · shadcn/ui · Prisma · PostgreSQL/Supabase · Auth.js · Upstash Redis.

## Cài đặt và chạy

### 1. Lấy mã nguồn

Cài **Node.js 24** theo `.node-version` và dùng npm với `package-lock.json`.

```bash
git clone --branch develop https://github.com/quynhtien1977/go-trail.git
cd go-trail
```

Tạo `.env` từ file mẫu (PowerShell trên Windows):

```powershell
Copy-Item .env.example .env
```

### 2. Cấu hình môi trường

Mỗi thành viên tạo **một project Supabase development riêng**. Điền các biến sau trong `.env`:

| Biến | Giá trị cần điền |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string của DB riêng, lấy ở mục **Connect** trong Supabase |
| `DIRECT_URL` | Direct hoặc **Session pooler** của cùng DB cho migration/seed; có thể dùng Session pooler cho cả hai URL khi chạy local |
| `AUTH_SECRET` | Secret ngẫu nhiên riêng, ít nhất 32 ký tự |
| `NEXTAUTH_URL` | `http://localhost:3000` |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Redis REST endpoint và token dùng cho development |
| `AUTH_RATE_LIMIT_NAMESPACE` | Tên riêng cho mỗi thành viên, ví dụ `go-trail:dev:ten-ban` |
| `SEED_PASSWORD` | Mật khẩu tài khoản mẫu, ít nhất 16 ký tự và tối đa 72 byte UTF-8 |

Seed dùng `DIRECT_URL` nếu đã điền, nếu không thì dùng `DATABASE_URL`; không cần khai báo thêm project ref. URL PostgreSQL cần đúng mật khẩu DB; mã hóa các ký tự đặc biệt trong mật khẩu nếu có. Không dùng Supabase API URL thay connection string.

Redis có thể dùng riêng hoặc dùng Redis development của nhóm với namespace riêng. Giữ URL ảnh public có sẵn trong `.env.example`; SePay, cron và thông tin ngân hàng chưa cần cấu hình ở bước này. Không chia sẻ `.env` hoặc đưa secrets lên GitHub.

### 3. Khởi tạo DB và chạy ứng dụng

Kiểm tra cả hai URL trỏ đúng DB development của mình, rồi chạy:

```bash
npm ci
npm run db:deploy
npm run db:seed
npm run dev
```

Mở [localhost:3000](http://localhost:3000). Auth/portal cần DB đã migration và Redis hoạt động.

Seed tạo **8 tuyến tham khảo, 13 điểm đón, 6 tài khoản theo role, 3 nhân sự, 1 xe/16 ghế và 3 chuyến demo**, cùng cấu hình/chính sách hoàn tiền. Các chuyến demo không phải lịch mở bán thật.

Đăng nhập bằng email `<role viết thường>@go-trail.example.test`: `customer`, `leader`, `routemgr`, `hrmgr`, `accountant` hoặc `admin`; mật khẩu là `SEED_PASSWORD` đã điền. Đăng ký tại `/register` luôn tạo Customer.

Seed có thể chạy lại và giữ các giá trị đã có; đổi `SEED_PASSWORD` không đổi mật khẩu tài khoản đã tạo.

Chỉ seed DB development của mình. Seed/importer từ chối khi `NODE_ENV=production`; URL không tự cho biết một DB là development hay production.

## Khi nhận code mới

```bash
npm ci
npm run db:deploy
npm run dev
```

`db:deploy` chỉ áp dụng migrations chưa chạy trên DB của mình, không tạo lại toàn bộ DB. Chạy `db:seed` khi cần dữ liệu mẫu hoặc có hướng dẫn seed mới; migration và seed là hai việc riêng.

## Lệnh thường dùng

| Lệnh | Mục đích |
| --- | --- |
| `npm run dev` | Chạy development |
| `npm run lint` | Kiểm tra ESLint |
| `npm run typecheck` | Sinh Prisma Client và kiểm tra TypeScript |
| `npm test` | Tests trên DB PGlite cô lập, không dùng DB Supabase của thành viên |
| `npm run test:catalog:http` | HTTP smoke catalog trên production build có sẵn, DB cô lập |
| `npm run build` | Build production |
| `npm run db:status` | Xem migrations của DB đang cấu hình |
| `npm run audit:check` | Kiểm tra dependency theo baseline của nhóm |

## Cấu trúc dự án

| Thư mục | Nội dung |
| --- | --- |
| `src/app/` | Pages và API |
| `src/server/` | Auth, phân quyền và nghiệp vụ backend |
| `src/schemas/` | Validation |
| `prisma/` | Schema, migrations và seed |
| `data/reference/` | Snapshot catalog dùng chung cho dữ liệu mẫu |
| `tests/` | Unit/integration tests và HTTP smoke |

## Làm việc trong nhóm

- Tạo branch theo nhiệm vụ từ `develop`, ví dụ `feat/trip-catalog`; mở PR vào `develop`. `main` dành cho bản ổn định/release.
- PR cần mô tả thay đổi, cách kiểm thử, đồng đội review và CI của đúng head mới nhất PASS.
- Khi thay cấu trúc DB, PR phải có `schema.prisma` và migration tương ứng. Không sửa migration đã áp dụng; không dùng SQL Editor để thay schema riêng rồi bỏ quên migration.
- Người tạo migration dùng DB local có thể bỏ và shadow DB riêng; các thành viên khác áp dụng file migration bằng `db:deploy`. Không chạy reset trên DB có dữ liệu cần giữ.
- Mỗi người có dữ liệu chạy thử riêng; chia sẻ dữ liệu khởi tạo qua seed/catalog trong repository.
- CI kiểm tra chất lượng; chưa tự deploy hoặc migration DB của thành viên.
- PRD và ghi chú kỹ thuật nội bộ được quản lý riêng, không nằm trong bản clone GitHub; nhận từ người phụ trách trước khi làm nghiệp vụ.
