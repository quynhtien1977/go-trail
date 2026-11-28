# SCRUM-52 · Bàn giao backend GoTrail

**Ứng viên bàn giao:** `477b853a6267c2ba548c67ee7a49e69a62102790` trên `develop`. Ngày đối chiếu bằng chứng: 28/11/2026. Người review theo kế hoạch Jira: Trần Nguyễn Thanh Trúc.

## Bằng chứng cho đúng bản build

Job Quality trên Ubuntu đã checkout commit trên, dùng phiên bản Node trong `.node-version` và cài dependency từ lockfile. Mở từng bước trong [log Quality](https://github.com/quynhtien1977/go-trail/actions/runs/46039642020/job/140643799935) để xem đầu ra gốc.

| Bước | Kiểm tra | Kết quả |
|---|---|---|
| 6–8 | ESLint, TypeScript, unit và integration | Đạt cả ba |
| 9–10 | Phân công và booking đồng thời trên PostgreSQL riêng | Đạt cả hai |
| 11 | Build production | Đạt |
| 12 | Ma trận phân quyền HTTP của 5 role trên bản build | Đạt |
| 13 | Audit dependency theo policy của repo | Đạt |

Kiểm chứng lại tại máy bàn giao ngày 28/11/2026 sau khi cài từ lockfile: production build thành công, HTTP smoke đạt 1.705 lượt kiểm tra cho 64 phương thức được bảo vệ và qua kiểm tra cron. Bài booking concurrency đạt 25 nhóm trên PostgreSQL 18 riêng ở cả hai lần chạy. `rtk npm run audit:check` trả mã 0 và báo 0 advisory tại thời điểm chạy. Lint, typecheck độc lập, toàn bộ unit/integration và concurrency phân công lấy bằng chứng từ job CI nêu trên.

Không có bước nào trong job báo blocker/critical cần sửa. Trạng thái audit có nghĩa là đạt [baseline đã duyệt](../../.github/security-audit-baseline.json). Ngoại lệ công cụ development phải được review lại trước production hoặc hạn 02/12/2026, tùy mốc nào đến trước.

## Chạy lại khi sửa lỗi hoặc đổi SHA

Từ checkout của ứng viên, dùng Node theo [.node-version](../../.node-version), Docker đang chạy và cấu hình build dành riêng cho development/test. Thực hiện lần lượt theo [workflow CI](../../.github/workflows/ci.yml); dừng và giữ log ở bước đầu tiên lỗi.

```sh
npm ci --ignore-scripts
npm run db:generate
npm run lint
npm run typecheck
npm test
npm run test:assignments:concurrency
npm run test:bookings:concurrency
npm run build
npm run test:rbac:http
npm run audit:check
```

Hai bài concurrency tự tạo container PostgreSQL trên localhost. HTTP smoke dùng DB cô lập và cần production build vừa tạo. Không cần seed hoặc reset DB dùng chung. Khi có lỗi từ E2E, ghi SHA, vai trò, fixture, bước tái hiện, kết quả mong đợi/thực tế và ảnh hưởng. Ưu tiên mất tiền, bán trùng ghế, lộ dữ liệu hoặc build không chạy. Sau sửa, chạy lại ca tái hiện và toàn bộ Quality trên SHA mới.

## Quyết định bàn giao

**Đạt cổng CI; chờ nghiệm thu liên task.** [SCRUM-50](https://zair0u.atlassian.net/browse/SCRUM-50) phụ trách E2E 10 nhóm chức năng và cross-role. Tại thời điểm lập biên bản, chưa xác minh được kết quả T01 hiện tại. Trước khi ký bàn giao, người review đính kèm kết quả T01, đối chiếu các lỗi blocker/critical với SHA trên, rồi ghi tên người review, ngày và quyết định vào [SCRUM-52](https://zair0u.atlassian.net/browse/SCRUM-52). Nếu T01 kiểm thử SHA khác, ghi rõ phần chênh lệch cần chạy lại.
