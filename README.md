# KOL.GOV.VN PostgreSQL API

Backend Node.js/TypeScript chỉ đọc dữ liệu từ PostgreSQL schema `kol_gov`. API dùng Fastify, `pg`, CORS, Helmet và có tài liệu OpenAPI/Swagger.

Tài liệu API tiếng Việt đầy đủ: [API_DOCS_VI.md](./API_DOCS_VI.md).

## Chạy dự án

Yêu cầu Node.js 20+ và PostgreSQL đang chạy.

```powershell
cd D:\KOL\backend
npm install
npm run dev
```

Chạy bản build:

```powershell
npm run build
npm start
```

- API: `http://localhost:4000/api/v1`
- Swagger UI: `http://localhost:4000/docs`
- Health check: `http://localhost:4000/health`
- Database check: `http://localhost:4000/ready`

## Cấu hình

File `.env` hiện đã được cấu hình cho database local:

```dotenv
PGHOST=localhost
PGPORT=5432
PGDATABASE=kol
PGUSER=postgres
PGPASSWORD=change-me
PGSCHEMA=kol_gov
HOST=0.0.0.0
PORT=4000
CORS_ORIGIN=*
```

Khi triển khai thật, nên đặt `CORS_ORIGIN` thành domain frontend cụ thể, ví dụ `https://example.com`. Có thể khai báo nhiều domain, phân cách bằng dấu phẩy.

## API chính

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/health` | Trạng thái tiến trình |
| GET | `/ready` | Kiểm tra kết nối PostgreSQL |
| GET | `/api/v1/stats` | Thống kê số bản ghi |
| GET | `/api/v1/influencers` | Danh sách KOL, tìm kiếm/lọc/sắp xếp/phân trang |
| GET | `/api/v1/influencers/:key` | Chi tiết KOL cùng kênh, MCN, BSI và growth |
| GET | `/api/v1/influencers/source/:sourceId` | Tra KOL theo ID gốc của nguồn |
| GET | `/api/v1/channels` | Danh sách kênh đã chuẩn hóa |
| GET | `/api/v1/channels/:key` | Chi tiết kênh và các bản ghi nguồn |
| GET | `/api/v1/mcns` | Danh sách MCN |
| GET | `/api/v1/mcns/:sourceId` | Chi tiết MCN, KOL thành viên và growth |
| GET | `/api/v1/growth/periods` | Các kỳ growth đang có |
| GET | `/api/v1/growth/rankings` | Xếp hạng growth KOL/MCN |
| GET | `/api/v1/growth/entities/:key` | Lịch sử growth của thực thể |
| GET | `/api/v1/bsi/periods` | Các tháng BSI đang có |
| GET | `/api/v1/bsi/rankings` | Xếp hạng BSI theo tab/tháng |
| GET | `/api/v1/bsi/subjects` | Danh sách chủ thể BSI chuẩn hóa |
| GET | `/api/v1/bsi/subjects/:key` | Lịch sử xếp hạng của chủ thể BSI |
| GET | `/api/v1/news` | Danh sách tin tức |
| GET | `/api/v1/news/:slug` | Nội dung đầy đủ của bài viết |
| GET | `/api/v1/news/categories` | Danh mục tin và số bài |
| GET | `/api/v1/news/tags` | Nhãn tin và số bài |

Tất cả endpoint danh sách trả về cùng cấu trúc:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

## Ví dụ frontend

```ts
const params = new URLSearchParams({
  entityType: "influencer",
  periodDays: "7",
  limit: "10"
});

const response = await fetch(`http://localhost:4000/api/v1/growth/rankings?${params}`);
if (!response.ok) throw new Error(`API error: ${response.status}`);
const result = await response.json();
console.log(result.data, result.pagination);
```

Các bộ lọc và giá trị hợp lệ của từng API được mô tả đầy đủ trong Swagger UI.
