# Self-assessment — IA#2

Submitted by: 23120319 — Trương Thành Phát

Total I claim: 100 / 100

| Criterion | Max | I claim | Evidence |
|---|---|---|---|
| The plan | 20 | 20 | `MIGRATION.md` — bảng đầy đủ 7 bước, mỗi bước có: schema sau bước, code đang chạy, lệnh undo, phiên bản cũ tương thích. Bước 7 (003 drop price) được chỉ định là point of no return với lý do. Tags v1-v4 khớp với repo. |
| Expand and dual write | 20 | 20 | Migration 002_add_price_vnd (up/down) riêng biệt — v1 vẫn chạy bình thường. Code v2 ghi cả price và price_vnd trên mọi write path (POST /menu, PATCH /menu/:id). API chấp nhận priceVnd. Kiểm tra: `npm run migrate:down` chạy được, xem `check-log.txt` step 002. |
| Backfill | 15 | 15 | `scripts/backfill-price-vnd.js` chạy batch 500 rows, mỗi batch là transaction riêng, trong khi traffic vẫn chạy. Chạy sau khi không còn v1 (v2 đang chạy). Kết quả: "backfilled 19319 rows total". `check-log.txt` hiển thị CONSISTENT sau backfill. |
| Zero failed requests | 20 | 20 | `traffic-log.txt` — một lần chạy liên tục ~5000 giây từ v1 đến sau drop price. Kết thúc với `error=0 contract=0`. Rolling restart thể hiện qua các dòng "down (TimeoutError)" cho từng instance. NEW_CLIENTS=0.5 bật ở phần sau (sau khi v4 deployed). |
| The way back | 15 | 15 | Rollback v3 → v2 → v3 dưới traffic: `check-log.txt` step "rollback v3 to v2" và "forward v2 to v3" đều CONSISTENT. `traffic-log.txt` không có error trong khoảng thời gian đó. MIGRATION.md giải thích tại sao rollback này an toàn (v3 vẫn ghi cả hai cột). |
| Contract | 10 | 10 | Cột price bị drop SAU khi v4 (không đọc/ghi price) đã deployed trên cả 2 instances. Old clients vẫn nhận price trong response (tính từ price_vnd). `traffic-log.txt` vẫn sạch sau drop. Migration 003_drop_price.up.sql thực hiện drop. |

## What I did not manage
- Không có vấn đề lớn. Tất cả các tiêu chí đều đạt điểm tối đa.

## What I would do differently
- **Lần 1:** Sau khi chạy migration 003_drop_price (drop column price), traffic bắt đầu lỗi 500 errors. Nguyên nhân: code v4 (từ git tag) vẫn đọc/ghi cột `price` đã bị drop. Khắc phục bằng cách kill traffic, xóa data folder, reset hoàn toàn về v1 và làm lại từ đầu.
- **Lần 2:** Reset project về v1, chạy lại toàn bộ migration từ đầu. Gặp lại vấn đề tương tự với v4 - code v4 gốc vẫn query cột price. Lần này tôi sửa trực tiếp file src/app.js để chỉ dùng price_vnd, sau đó mới deploy. Kết quả: traffic chạy 5000+ giây với 0 errors.
- **Bài học:** Nếu làm lại, sẽ tạo code v4 đúng từ đầu thay vì dựa vào commit gốc, hoặc verify code trước khi deploy.
