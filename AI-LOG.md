# AI Log (CSC13114)

Sinh viên: 23120319 — Trương Thành Phát

---

## 2026-10-13 — Phân tích codebase và lên kế hoạch migration (IA#2)
- **Tool**: Antigravity (Claude Sonnet 4.6).
- **Asked for**: Đọc toàn bộ codebase (migration 001, src/app.js, scripts/traffic.js, scripts/check.js) và phân tích các điểm cần lưu ý cho zero-downtime migration. Xác định: cột price có NOT NULL không, có index không, các chỗ ghi/đọc price, cách traffic.js xử lý biến NEW_CLIENTS, và cách ghi check-log.txt.
- **Kept**: Kết luận cột `price` trong `001_init.up.sql` không có `NOT NULL` (nullable by default), không có index trên `price`, và schema đúng như đề bài mô tả. Các chỗ ghi price: dòng 25 (INSERT), dòng 26 (UPDATE), dòng 79 (order_items.unit_price). Các chỗ đọc price: dòng 23/24 (SELECT), dòng 31 (view function), dòng 80 (tính total order).
- **Changed**: Tổng hợp phân tích thành bảng rõ ràng phân loại GHI/ĐỌC theo dòng, ngữ cảnh và lệnh SQL tương ứng; xác định 2 bẫy cần lưu ý: (1) price không có NOT NULL nên v4 không ghi price vẫn an toàn, (2) SQLite DROP COLUMN sẽ lỗi nếu cột nằm trong index/view/CHECK — trong schema hiện tại không có nên stage 6 không cần xử lý.
- **Rejected**: Không có.
- **By hand**: Tự đọc và xác nhận nội dung 001_init.up.sql, tự xác nhận `isPrice` validation nhận float > 0 và <= 100000 (tức max 100 triệu VND). Tự xác định `normalizePrice` cần hỗ trợ cả `price` (float, nghìn đồng) và `priceVnd` (int, đồng) ở request body. Tự xác nhận response của v2/v3 cần trả `{ price: float, priceVnd: int }` để tương thích ngược.

---

## 2026-10-13 — Sửa lỗi cross-platform path trong scripts/migrate.js (IA#2)
- **Tool**: Antigravity (Claude Sonnet 4.6).
- **Asked for**: "scripts/migrate.js bị lỗi trên Windows vì dùng `new URL(import.meta.url).pathname` để lấy đường dẫn file, trả về `/D:/...` thay vì `D:\...`. Hãy sửa để chạy được trên cả Unix và Windows."
- **Kept**: Toàn bộ logic migration (đọc thư mục migrations, áp dụng/huỷ migration, kiểm tra trạng thái) và cách sử dụng `DatabaseSync` từ `node:sqlite`.
- **Changed**: Thay `new URL(import.meta.url).pathname` bằng `fileURLToPath(import.meta.url)` từ `node:url` kết hợp `dirname` từ `node:path`, đảm bảo đường dẫn chính xác trên cả Unix lẫn Windows. Cập nhật import statement.
- **Rejected**: Không có.
- **By hand**: Tự kiểm tra lại toàn bộ script sau khi sửa để đảm bảo logic không bị thay đổi. Tự chạy `npm run migrate` và `npm run seed` thành công trên Windows, xác nhận 4/4 tests pass.

---

## 2026-10-13 — Viết migration 002 và backfill script (IA#2)
- **Tool**: Antigravity (Claude Sonnet 4.6).
- **Asked for**: "Viết migrations/002_add_price_vnd.up.sql, .down.sql và scripts/backfill-price-vnd.js theo đúng kế hoạch 6 giai đoạn."
- **Kept**: Cấu trúc ALTER TABLE ADD COLUMN cho up, ALTER TABLE DROP COLUMN cho down, logic backfill batch 500 rows với transaction ngắn và delay 20ms giữa các batch.
- **Changed**: 002 up thêm `price_vnd INTEGER` không có ràng buộc NOT NULL (để v4 không ghi vẫn OK). 002 down dùng `DROP COLUMN` (SQLite 3.35+). Backfill script dùng `CAST(ROUND(price * 1000) AS INTEGER)` để tránh floating point error khi chuyển đổi. Script có kiểm tra `price_vnd IS NULL` trước khi update nên có thể chạy lại an toàn.
- **Rejected**: Dùng `price * 1000` trực tiếp trong UPDATE (loại bỏ vì có thể gây floating point error như 45.5 * 1000 = 45499.999...). Dùng `price_vnd = ROUND(price * 1000)` không có CAST (SQLite có thể trả về float thay vì int).
- **By hand**: Tự xác nhận `CAST(ROUND(...))` là cách chính xác nhất trong SQLite để chuyển float → integer. Tự kiểm tra backfill script chạy đúng với sample data.
