# Tài liệu API KOL.GOV.VN

Tài liệu này mô tả toàn bộ REST API của backend `kol-gov-api` dùng dữ liệu PostgreSQL trong database `kol`, schema `kol_gov`.

## 1. Thông tin chung

| Trường | Giá trị |
|---|---|
| Base URL | `http://localhost:4000` |
| API prefix | `/api/v1` |
| Swagger UI | `http://localhost:4000/docs` |
| OpenAPI JSON | `http://localhost:4000/docs/json` |
| Content-Type | `application/json; charset=utf-8` |
| Xác thực | Không yêu cầu |
| Phương thức hỗ trợ | `GET`, `HEAD`, `OPTIONS` |

### Quy ước phân trang

Các API danh sách trả về cấu trúc:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 911,
    "totalPages": 46
  }
}
```

Các trường PostgreSQL kiểu `bigint` có thể được trả về dưới dạng chuỗi để JavaScript không làm mất độ chính xác.

### Response lỗi dùng chung

**400 — Tham số không hợp lệ**

```json
{
  "error": "VALIDATION_ERROR",
  "message": "querystring/limit must be <= 100",
  "details": []
}
```

**404 — Không tìm thấy tài nguyên**

```json
{
  "error": "NOT_FOUND",
  "message": "Influencer not found"
}
```

**404 — Không tìm thấy route**

```json
{
  "error": "ROUTE_NOT_FOUND",
  "message": "Route GET /api/v1/unknown not found"
}
```

**500 — Lỗi server hoặc PostgreSQL**

```json
{
  "error": "INTERNAL_SERVER_ERROR",
  "message": "An internal server error occurred"
}
```

---

## 2. System API

### 2.1. Kiểm tra backend

| Trường | Nội dung |
|---|---|
| Name | API kiểm tra backend đang hoạt động |
| Method | `GET` |
| URL | `http://localhost:4000/health` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | Không có |
| Query Params | Không có |
| Status | `200` |
| Note | Chỉ kiểm tra tiến trình Node.js, không kiểm tra database |

**Response — 200**

```json
{
  "status": "ok",
  "timestamp": "2026-08-10T04:45:13.903Z"
}
```

### 2.2. Kiểm tra kết nối PostgreSQL

| Trường | Nội dung |
|---|---|
| Name | API kiểm tra database sẵn sàng |
| Method | `GET` |
| URL | `http://localhost:4000/ready` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | Không có |
| Query Params | Không có |
| Status | `200`, `500` |
| Note | Thực hiện truy vấn thật tới PostgreSQL |

**Response — 200**

```json
{
  "status": "ready",
  "database": {
    "database": "kol",
    "server_time": "2026-08-10 11:45:13.987+07"
  }
}
```

### 2.3. Thông tin API

| Trường | Nội dung |
|---|---|
| Name | API index |
| Method | `GET` |
| URL | `http://localhost:4000/api/v1/` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | Không có |
| Query Params | Không có |
| Status | `200` |
| Note | Trả về phiên bản và các endpoint chính |

**Response — 200**

```json
{
  "name": "KOL.GOV.VN PostgreSQL API",
  "version": "1.0.0",
  "docs": "/docs",
  "endpoints": {
    "stats": "/api/v1/stats",
    "influencers": "/api/v1/influencers",
    "channels": "/api/v1/channels",
    "mcns": "/api/v1/mcns",
    "growth": "/api/v1/growth/rankings",
    "bsi": "/api/v1/bsi/rankings",
    "news": "/api/v1/news"
  }
}
```

### 2.4. Thống kê dữ liệu

| Trường | Nội dung |
|---|---|
| Name | API thống kê số bản ghi |
| Method | `GET` |
| URL | `http://localhost:4000/api/v1/stats` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | Không có |
| Query Params | Không có |
| Status | `200`, `500` |
| Note | Số liệu thay đổi khi database được cập nhật |

**Response — 200**

```json
{
  "data": {
    "influencers": 911,
    "social_channels": 1520,
    "channel_entities": 3809,
    "ticker_channels": 3169,
    "mcns": 26,
    "mcn_influencers": 47,
    "growth_rankings": 252,
    "bsi_rankings": 237,
    "news_posts": 14
  }
}
```

---

## 3. Influencer API

### 3.1. Danh sách KOL/Influencer

| Trường | Nội dung |
|---|---|
| Name | API lấy danh sách KOL |
| Method | `GET` |
| URL | `http://localhost:4000/api/v1/influencers` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | Không có |
| Query Params | `page`, `limit`, `search`, `verified`, `platform`, `hasSourceId`, `sort`, `order` |
| Status | `200`, `400`, `500` |
| Note | Có phân trang, tìm kiếm, lọc và sắp xếp |

**Query Params**

| Tên | Kiểu | Bắt buộc | Mặc định | Giá trị/Ghi chú |
|---|---|---:|---|---|
| `page` | integer | Không | `1` | Tối thiểu `1` |
| `limit` | integer | Không | `20` | Từ `1` đến `100` |
| `search` | string | Không | — | Tìm trong `name`, `nick_name` |
| `verified` | string | Không | — | `true` hoặc `false` |
| `platform` | string | Không | — | Ví dụ: `facebook`, `youtube`, `tiktok` |
| `hasSourceId` | string | Không | — | `true` hoặc `false` |
| `sort` | string | Không | `name` | `name`, `followers`, `channels`, `scrapedAt` |
| `order` | string | Không | `asc` | `asc` hoặc `desc` |

**Example**

```http
GET /api/v1/influencers?page=1&limit=10&verified=true&platform=youtube&sort=followers&order=desc
```

**Response — 200**

```json
{
  "data": [
    {
      "influencer_key": "kol_28b6e9b15f3a96dc9b938fd08c9e18c0",
      "name": "Ví dụ KOL",
      "nick_name": "KOL Example",
      "gender": null,
      "identity_verified": true,
      "source_url": "https://kol.gov.vn/...",
      "scraped_at": "2026-08-08T10:00:00.000Z",
      "channel_count": 3,
      "followers_total": "1200000",
      "views_total": "50000000",
      "likes_total": "2400000",
      "source_ids": [
        {
          "sourceId": "1349",
          "sourceSystem": "kol.gov.vn",
          "matchMethod": "source_id",
          "confidence": 1,
          "detailUrl": "https://kol.gov.vn/..."
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 911,
    "totalPages": 92
  }
}
```

### 3.2. Tra KOL theo source ID

| Trường | Nội dung |
|---|---|
| Name | API tra KOL theo ID gốc từ kol.gov.vn |
| Method | `GET` |
| URL | `http://localhost:4000/api/v1/influencers/source/:sourceId` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | `sourceId`: ID nguồn, bắt buộc |
| Query Params | Không có |
| Status | `200`, `404`, `500` |
| Note | Dùng khi frontend đang có ID gốc thay vì `influencer_key` |

**Example**

```http
GET /api/v1/influencers/source/1349
```

**Response — 200**

```json
{
  "source_id": "1349",
  "source_system": "kol.gov.vn",
  "influencer_key": "kol_6e6762b15bb45c69c77f6f1119fd3d36",
  "match_method": "source_id",
  "confidence": 1,
  "detail_url": "https://kol.gov.vn/...",
  "scraped_at": "2026-08-08T10:00:00.000Z",
  "influencer": {
    "influencer_key": "kol_6e6762b15bb45c69c77f6f1119fd3d36",
    "name": "Ví dụ KOL",
    "nick_name": null,
    "gender": null,
    "identity_verified": false,
    "source_url": "https://kol.gov.vn/...",
    "scraped_at": "2026-08-08T10:00:00.000Z"
  }
}
```

### 3.3. Chi tiết KOL và các quan hệ

| Trường | Nội dung |
|---|---|
| Name | API lấy chi tiết KOL |
| Method | `GET` |
| URL | `http://localhost:4000/api/v1/influencers/:key` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | `key`: `influencer_key`, bắt buộc |
| Query Params | Không có |
| Status | `200`, `404`, `500` |
| Note | Trả kèm source ID, kênh, MCN, growth ranking và BSI ranking |

**Example**

```http
GET /api/v1/influencers/kol_28b6e9b15f3a96dc9b938fd08c9e18c0
```

**Response — 200**

```json
{
  "influencer_key": "kol_28b6e9b15f3a96dc9b938fd08c9e18c0",
  "name": "Ví dụ KOL",
  "nick_name": "KOL Example",
  "gender": null,
  "identity_verified": true,
  "source_url": "https://kol.gov.vn/...",
  "scraped_at": "2026-08-08T10:00:00.000Z",
  "source_ids": [],
  "channels": [],
  "mcns": [],
  "growth_rankings": [],
  "bsi_rankings": []
}
```

Các phần tử `channels` có thông tin kênh và `channelEntityKey`; `mcns` có MCN liên quan; `growth_rankings` và `bsi_rankings` là lịch sử xếp hạng của KOL.

---

## 4. Channel API

### 4.1. Danh sách kênh đã chuẩn hóa

| Trường | Nội dung |
|---|---|
| Name | API lấy danh sách kênh |
| Method | `GET` |
| URL | `http://localhost:4000/api/v1/channels` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | Không có |
| Query Params | `page`, `limit`, `search`, `platform`, `source`, `sort`, `order` |
| Status | `200`, `400`, `500` |
| Note | Một channel entity có thể nối cả nguồn social và ticker |

**Query Params**

| Tên | Kiểu | Bắt buộc | Mặc định | Giá trị/Ghi chú |
|---|---|---:|---|---|
| `page` | integer | Không | `1` | Tối thiểu `1` |
| `limit` | integer | Không | `20` | Từ `1` đến `100` |
| `search` | string | Không | — | Tìm tên, tên chuẩn hóa hoặc URL |
| `platform` | string | Không | — | Lọc chính xác theo nền tảng |
| `source` | string | Không | `all` | `all`, `social`, `ticker`, `both` |
| `sort` | string | Không | `name` | `name`, `platform`, `followers`, `views`, `likes`, `scrapedAt` |
| `order` | string | Không | `asc` | `asc` hoặc `desc` |

**Example**

```http
GET /api/v1/channels?platform=youtube&source=both&sort=followers&order=desc&limit=10
```

**Response — 200**

```json
{
  "data": [
    {
      "channel_entity_key": "che_aa2ca4500ae3e1aa8df77bbaad831b33",
      "canonical_url": "https://youtube.com/@example",
      "normalized_name": "example",
      "platform": "youtube",
      "display_name": "Example Channel",
      "scraped_at": "2026-08-08T10:00:00.000Z",
      "has_social_source": true,
      "has_ticker_source": true,
      "social_source_count": 1,
      "ticker_source_count": 1,
      "followers_total": "1500000",
      "views_total": "80000000",
      "likes_total": "3500000"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 3809,
    "totalPages": 381
  }
}
```

### 4.2. Chi tiết kênh và dữ liệu nguồn

| Trường | Nội dung |
|---|---|
| Name | API lấy chi tiết channel entity |
| Method | `GET` |
| URL | `http://localhost:4000/api/v1/channels/:key` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | `key`: `channel_entity_key`, bắt buộc |
| Query Params | Không có |
| Status | `200`, `404`, `500` |
| Note | `social_sources` nối tới KOL; `ticker_sources` chứa chỉ số ticker |

**Example**

```http
GET /api/v1/channels/che_aa2ca4500ae3e1aa8df77bbaad831b33
```

**Response — 200**

```json
{
  "channel_entity_key": "che_aa2ca4500ae3e1aa8df77bbaad831b33",
  "canonical_url": "https://youtube.com/@example",
  "normalized_name": "example",
  "platform": "youtube",
  "display_name": "Example Channel",
  "scraped_at": "2026-08-08T10:00:00.000Z",
  "social_sources": [
    {
      "channelKey": "soc_...",
      "channelType": "youtube",
      "channelName": "Example Channel",
      "channelUrl": "https://youtube.com/@example",
      "followers": 1500000,
      "views": 80000000,
      "likes": 3500000,
      "matchMethod": "canonical_url",
      "influencer": {
        "influencerKey": "kol_...",
        "name": "Ví dụ KOL",
        "nickName": null,
        "identityVerified": true
      }
    }
  ],
  "ticker_sources": [
    {
      "sourceChannelId": "123",
      "name": "Example Channel",
      "followers": 1500000,
      "views": 80000000,
      "likes": 3500000,
      "comments": 120000,
      "shares": 45000,
      "matchMethod": "canonical_url",
      "confidence": 1
    }
  ]
}
```

---

## 5. MCN API

### 5.1. Danh sách MCN

| Trường | Nội dung |
|---|---|
| Name | API lấy danh sách MCN owner |
| Method | `GET` |
| URL | `http://localhost:4000/api/v1/mcns` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | Không có |
| Query Params | `page`, `limit`, `search`, `platform`, `sort`, `order` |
| Status | `200`, `400`, `500` |
| Note | `platforms` và `channels_by_type` là JSON |

**Query Params**

| Tên | Kiểu | Bắt buộc | Mặc định | Giá trị/Ghi chú |
|---|---|---:|---|---|
| `page` | integer | Không | `1` | Tối thiểu `1` |
| `limit` | integer | Không | `20` | Từ `1` đến `100` |
| `search` | string | Không | — | Tìm trong `name`, `subtitle` |
| `platform` | string | Không | — | Nền tảng có trong mảng `platforms` |
| `sort` | string | Không | `name` | `name`, `channels`, `kols`, `scrapedAt` |
| `order` | string | Không | `asc` | `asc` hoặc `desc` |

**Example**

```http
GET /api/v1/mcns?platform=youtube&sort=channels&order=desc
```

**Response — 200**

```json
{
  "data": [
    {
      "source_id": "22",
      "name": "Example MCN",
      "subtitle": "Multi-channel network",
      "avatar_url": "https://example.com/avatar.jpg",
      "platforms": ["youtube", "tiktok"],
      "channels_by_type": { "youtube": 120, "tiktok": 50 },
      "total_channels": 170,
      "total_kols": 60,
      "scraped_at": "2026-08-08T10:00:00.000Z",
      "public_influencer_count": 4
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 26,
    "totalPages": 2
  }
}
```

### 5.2. Chi tiết MCN

| Trường | Nội dung |
|---|---|
| Name | API lấy chi tiết MCN |
| Method | `GET` |
| URL | `http://localhost:4000/api/v1/mcns/:sourceId` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | `sourceId`: `mcn_owners.source_id`, bắt buộc |
| Query Params | Không có |
| Status | `200`, `404`, `500` |
| Note | Trả kèm KOL thành viên và lịch sử growth ranking |

**Example**

```http
GET /api/v1/mcns/22
```

**Response — 200**

```json
{
  "source_id": "22",
  "name": "Example MCN",
  "subtitle": "Multi-channel network",
  "avatar_url": "https://example.com/avatar.jpg",
  "platforms": ["youtube", "tiktok"],
  "channels_by_type": { "youtube": 120, "tiktok": 50 },
  "total_channels": 170,
  "total_kols": 60,
  "raw_json": {},
  "scraped_at": "2026-08-08T10:00:00.000Z",
  "featured_influencers": [
    {
      "membershipKey": "mci_...",
      "relationshipType": "featured",
      "sourceUrl": "https://kol.gov.vn/...",
      "influencerSourceId": "1349",
      "influencerKey": "kol_...",
      "name": "Ví dụ KOL",
      "nickName": null,
      "identityVerified": true
    }
  ],
  "growth_rankings": []
}
```

---

## 6. Growth Ranking API

### 6.1. Danh sách kỳ growth

| Trường | Nội dung |
|---|---|
| Name | API lấy các bộ kỳ growth hiện có |
| Method | `GET` |
| URL | `http://localhost:4000/api/v1/growth/periods` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | Không có |
| Query Params | Không có |
| Status | `200`, `500` |
| Note | Dùng để tạo tab KOL/MCN và lựa chọn 7/28 ngày |

**Response — 200**

```json
{
  "data": [
    {
      "entity_type": "influencer",
      "period_days": 7,
      "metric": "total",
      "ranking_count": 100,
      "latest_scraped_at": "2026-08-08T10:00:00.000Z"
    },
    {
      "entity_type": "owner",
      "period_days": 28,
      "metric": "total",
      "ranking_count": 26,
      "latest_scraped_at": "2026-08-08T10:00:00.000Z"
    }
  ]
}
```

### 6.2. Bảng xếp hạng growth

| Trường | Nội dung |
|---|---|
| Name | API lấy bảng xếp hạng tăng trưởng KOL/MCN |
| Method | `GET` |
| URL | `http://localhost:4000/api/v1/growth/rankings` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | Không có |
| Query Params | `page`, `limit`, `entityType`, `periodDays`, `metric`, `search`, `sort`, `order` |
| Status | `200`, `400`, `500` |
| Note | `entityType=influencer` là KOL; `entityType=owner` là MCN |

**Query Params**

| Tên | Kiểu | Bắt buộc | Mặc định | Giá trị/Ghi chú |
|---|---|---:|---|---|
| `page` | integer | Không | `1` | Tối thiểu `1` |
| `limit` | integer | Không | `20` | Từ `1` đến `100` |
| `entityType` | string | Không | `influencer` | `influencer` hoặc `owner` |
| `periodDays` | integer | Không | `7` | `7` hoặc `28` |
| `metric` | string | Không | `total` | Metric đang lưu trong database |
| `search` | string | Không | — | Tìm theo `name`, `subtitle` |
| `sort` | string | Không | `rank` | `rank`, `growthCurrent`, `growthRate`, `score` |
| `order` | string | Không | `asc` | `asc` hoặc `desc` |

**Example**

```http
GET /api/v1/growth/rankings?entityType=influencer&periodDays=7&sort=rank&order=asc&limit=10
```

**Response — 200**

```json
{
  "data": [
    {
      "snapshot_key": "grw_0010ea00dc1e9d1b57ea9dbe5610170f",
      "entity_type": "influencer",
      "metric": "total",
      "period_days": 7,
      "rank": 1,
      "name": "Ví dụ KOL",
      "subtitle": null,
      "avatar_url": "https://example.com/avatar.jpg",
      "snap_end_now": 1500000,
      "growth_current": 120000,
      "growth_previous": 90000,
      "growth_change": 30000,
      "growth_rate": 33.33,
      "score": 95.2,
      "scraped_at": "2026-08-08T10:00:00.000Z",
      "growth_entity_key": "gre_2a0a5148deb9d3de470e0610b2c27a2c",
      "influencer_key": "kol_...",
      "mcn_source_id": null,
      "entity": {
        "type": "influencer",
        "key": "kol_...",
        "name": "Ví dụ KOL",
        "nickName": null,
        "identityVerified": true
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

### 6.3. Chi tiết growth entity

| Trường | Nội dung |
|---|---|
| Name | API lấy thực thể growth và toàn bộ lịch sử xếp hạng |
| Method | `GET` |
| URL | `http://localhost:4000/api/v1/growth/entities/:key` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | `key`: `growth_entity_key`, bắt buộc |
| Query Params | Không có |
| Status | `200`, `404`, `500` |
| Note | `entity` là KOL hoặc MCN tùy `entity_type` |

**Example**

```http
GET /api/v1/growth/entities/gre_2a0a5148deb9d3de470e0610b2c27a2c
```

**Response — 200**

```json
{
  "growth_entity_key": "gre_2a0a5148deb9d3de470e0610b2c27a2c",
  "entity_type": "influencer",
  "source_id": "1349",
  "influencer_key": "kol_...",
  "mcn_source_id": null,
  "display_name": "Ví dụ KOL",
  "scraped_at": "2026-08-08T10:00:00.000Z",
  "entity": {},
  "rankings": []
}
```

---

## 7. BSI Ranking API

### 7.1. Danh sách kỳ BSI

| Trường | Nội dung |
|---|---|
| Name | API lấy các tháng BSI hiện có |
| Method | `GET` |
| URL | `http://localhost:4000/api/v1/bsi/periods` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | Không có |
| Query Params | `tab` |
| Status | `200`, `400`, `500` |
| Note | Không truyền `tab` sẽ trả kỳ của tất cả nhóm |

**Query Params**

| Tên | Kiểu | Bắt buộc | Mặc định | Giá trị |
|---|---|---:|---|---|
| `tab` | string | Không | — | `campaign`, `event`, `influencer`, `show` |

**Example**

```http
GET /api/v1/bsi/periods?tab=influencer
```

**Response — 200**

```json
{
  "data": [
    {
      "tab": "influencer",
      "year": 2026,
      "month": 5,
      "ranking_count": 10,
      "latest_scraped_at": "2026-08-08T10:00:00.000Z"
    }
  ]
}
```

### 7.2. Bảng xếp hạng BSI

| Trường | Nội dung |
|---|---|
| Name | API lấy bảng xếp hạng BSI |
| Method | `GET` |
| URL | `http://localhost:4000/api/v1/bsi/rankings` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | Không có |
| Query Params | `page`, `limit`, `tab`, `year`, `month`, `search` |
| Status | `200`, `400`, `500` |
| Note | Không truyền `year` và `month` sẽ tự chọn kỳ mới nhất của tab |

**Query Params**

| Tên | Kiểu | Bắt buộc | Mặc định | Giá trị/Ghi chú |
|---|---|---:|---|---|
| `page` | integer | Không | `1` | Tối thiểu `1` |
| `limit` | integer | Không | `20` | Từ `1` đến `100` |
| `tab` | string | Không | `influencer` | `campaign`, `event`, `influencer`, `show` |
| `year` | integer | Không | Kỳ mới nhất | Từ `2000` đến `2100` |
| `month` | integer | Không | Kỳ mới nhất | Từ `1` đến `12` |
| `search` | string | Không | — | Tìm theo tên chủ thể |

**Example**

```http
GET /api/v1/bsi/rankings?tab=influencer&year=2026&month=5&limit=10
```

**Response — 200**

```json
{
  "data": [
    {
      "snapshot_key": "bsi_00047e7923257b4449c82afc60698f84",
      "tab": "influencer",
      "year": 2026,
      "month": 5,
      "rank": 1,
      "name": "Ví dụ KOL",
      "score": 95.7,
      "image_url": "https://example.com/image.jpg",
      "scraped_at": "2026-08-08T10:00:00.000Z",
      "subject_key": "sub_52507cd6dcef91d1553f4b4dde38decb",
      "subject_type": "influencer",
      "influencer_key": "kol_...",
      "influencer": {
        "key": "kol_...",
        "name": "Ví dụ KOL",
        "nickName": null,
        "identityVerified": true
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 10,
    "totalPages": 1
  }
}
```

### 7.3. Danh sách BSI subject

| Trường | Nội dung |
|---|---|
| Name | API lấy danh sách chủ thể BSI đã chuẩn hóa |
| Method | `GET` |
| URL | `http://localhost:4000/api/v1/bsi/subjects` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | Không có |
| Query Params | `page`, `limit`, `search`, `type` |
| Status | `200`, `400`, `500` |
| Note | Subject có thể là campaign, event, influencer hoặc show |

**Query Params**

| Tên | Kiểu | Bắt buộc | Mặc định | Giá trị/Ghi chú |
|---|---|---:|---|---|
| `page` | integer | Không | `1` | Tối thiểu `1` |
| `limit` | integer | Không | `20` | Từ `1` đến `100` |
| `search` | string | Không | — | Tìm theo tên |
| `type` | string | Không | — | Lọc theo `subject_type` |

**Response — 200**

```json
{
  "data": [
    {
      "subject_key": "sub_52507cd6dcef91d1553f4b4dde38decb",
      "subject_type": "influencer",
      "name": "Ví dụ KOL",
      "image_url": "https://example.com/image.jpg",
      "influencer_key": "kol_...",
      "match_method": "normalized_name",
      "scraped_at": "2026-08-08T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 155,
    "totalPages": 8
  }
}
```

### 7.4. Chi tiết BSI subject

| Trường | Nội dung |
|---|---|
| Name | API lấy subject và lịch sử BSI |
| Method | `GET` |
| URL | `http://localhost:4000/api/v1/bsi/subjects/:key` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | `key`: `subject_key`, bắt buộc |
| Query Params | Không có |
| Status | `200`, `404`, `500` |
| Note | `influencer` là `null` nếu subject không phải KOL hoặc chưa nối được KOL |

**Example**

```http
GET /api/v1/bsi/subjects/sub_52507cd6dcef91d1553f4b4dde38decb
```

**Response — 200**

```json
{
  "subject_key": "sub_52507cd6dcef91d1553f4b4dde38decb",
  "subject_type": "influencer",
  "name": "Ví dụ KOL",
  "image_url": "https://example.com/image.jpg",
  "influencer_key": "kol_...",
  "match_method": "normalized_name",
  "scraped_at": "2026-08-08T10:00:00.000Z",
  "influencer": {},
  "rankings": []
}
```

---

## 8. News API

### 8.1. Danh mục tin tức

| Trường | Nội dung |
|---|---|
| Name | API lấy danh mục tin |
| Method | `GET` |
| URL | `http://localhost:4000/api/v1/news/categories` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | Không có |
| Query Params | Không có |
| Status | `200`, `500` |
| Note | `post_count` là số bài nối qua bảng quan hệ |

**Response — 200**

```json
{
  "data": [
    {
      "category_key": "cat_25414bded41259026cb057437927f13d",
      "name": "Hoạt động cục",
      "post_count": 4
    },
    {
      "category_key": "cat_6422c21749908dea4d96717cc05540ea",
      "name": "Tin tức nổi bật",
      "post_count": 5
    }
  ]
}
```

### 8.2. Nhãn tin tức

| Trường | Nội dung |
|---|---|
| Name | API lấy tag/nhãn tin |
| Method | `GET` |
| URL | `http://localhost:4000/api/v1/news/tags` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | Không có |
| Query Params | Không có |
| Status | `200`, `500` |
| Note | `post_count` là số bài dùng tag |

**Response — 200**

```json
{
  "data": [
    {
      "tag_key": "tag_13a2d3a85d7b44451fe3375fe4211253",
      "name": "Xu hướng",
      "post_count": 2
    },
    {
      "tag_key": "tag_1d20ce2cf442e6414faa23bd5de84414",
      "name": "mạng xã hội",
      "post_count": 3
    }
  ]
}
```

### 8.3. Danh sách tin tức

| Trường | Nội dung |
|---|---|
| Name | API lấy danh sách bài viết |
| Method | `GET` |
| URL | `http://localhost:4000/api/v1/news` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | Không có |
| Query Params | `page`, `limit`, `search`, `category`, `tag`, `from`, `to`, `sort`, `order` |
| Status | `200`, `400`, `500` |
| Note | Danh sách không trả `body_text` và `body_html`; dùng API chi tiết để lấy nội dung |

**Query Params**

| Tên | Kiểu | Bắt buộc | Mặc định | Giá trị/Ghi chú |
|---|---|---:|---|---|
| `page` | integer | Không | `1` | Tối thiểu `1` |
| `limit` | integer | Không | `20` | Từ `1` đến `100` |
| `search` | string | Không | — | Tìm trong tiêu đề, mô tả, nội dung text |
| `category` | string | Không | — | `category_key` hoặc tên danh mục, không phân biệt hoa thường |
| `tag` | string | Không | — | `tag_key` hoặc tên tag, không phân biệt hoa thường |
| `from` | date | Không | — | Từ ngày, định dạng `YYYY-MM-DD` |
| `to` | date | Không | — | Đến ngày, định dạng `YYYY-MM-DD` |
| `sort` | string | Không | `publishedAt` | `publishedAt` hoặc `title` |
| `order` | string | Không | `desc` | `asc` hoặc `desc` |

**Example**

```http
GET /api/v1/news?category=Tin%20tức%20nổi%20bật&from=2026-01-01&sort=publishedAt&order=desc
```

**Response — 200**

```json
{
  "data": [
    {
      "slug": "thu-tuong-moi-nguoi-dan-can-ung-xu-van-minh-tren-khong-gian-mang",
      "source_url": "https://kol.gov.vn/...",
      "category": "Tin tức nổi bật",
      "title": "Thủ tướng: Mỗi người dân cần ứng xử văn minh trên không gian mạng",
      "excerpt": "Nội dung mô tả ngắn...",
      "published_date": "2026-05-30",
      "reading_minutes": 5,
      "image_url": "https://kol.gov.vn/...jpg",
      "scraped_at": "2026-08-08T10:00:00.000Z",
      "categories": [
        {
          "key": "cat_6422c21749908dea4d96717cc05540ea",
          "name": "Tin tức nổi bật"
        }
      ],
      "tags": [
        {
          "key": "tag_1d20ce2cf442e6414faa23bd5de84414",
          "name": "mạng xã hội"
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 14,
    "totalPages": 1
  }
}
```

### 8.4. Chi tiết bài viết

| Trường | Nội dung |
|---|---|
| Name | API lấy nội dung đầy đủ bài viết |
| Method | `GET` |
| URL | `http://localhost:4000/api/v1/news/:slug` |
| Header | Không bắt buộc |
| Body | Không có |
| Path Params | `slug`: slug của bài viết, bắt buộc |
| Query Params | Không có |
| Status | `200`, `404`, `500` |
| Note | Frontend phải sanitize `body_html` trước khi render bằng `innerHTML` |

**Example**

```http
GET /api/v1/news/thu-tuong-moi-nguoi-dan-can-ung-xu-van-minh-tren-khong-gian-mang
```

**Response — 200**

```json
{
  "slug": "thu-tuong-moi-nguoi-dan-can-ung-xu-van-minh-tren-khong-gian-mang",
  "source_url": "https://kol.gov.vn/...",
  "category": "Tin tức nổi bật",
  "title": "Thủ tướng: Mỗi người dân cần ứng xử văn minh trên không gian mạng",
  "excerpt": "Nội dung mô tả ngắn...",
  "published_date": "2026-05-30",
  "reading_minutes": 5,
  "image_url": "https://kol.gov.vn/...jpg",
  "body_text": "Nội dung đầy đủ dạng text...",
  "body_html": "<p>Nội dung đầy đủ dạng HTML...</p>",
  "tags": ["mạng xã hội"],
  "scraped_at": "2026-08-08T10:00:00.000Z",
  "categories": [
    {
      "key": "cat_6422c21749908dea4d96717cc05540ea",
      "name": "Tin tức nổi bật"
    }
  ],
  "normalized_tags": [
    {
      "key": "tag_1d20ce2cf442e6414faa23bd5de84414",
      "name": "mạng xã hội"
    }
  ]
}
```

---

## 9. Ví dụ gọi API từ frontend

### JavaScript/TypeScript

```ts
const API_URL = "http://localhost:4000/api/v1";

async function getInfluencers(page = 1, search = "") {
  const params = new URLSearchParams({
    page: String(page),
    limit: "20",
    search,
    sort: "followers",
    order: "desc"
  });

  const response = await fetch(`${API_URL}/influencers?${params}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}
```

### Axios

```ts
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:4000/api/v1",
  headers: { Accept: "application/json" }
});

const { data } = await api.get("/growth/rankings", {
  params: {
    entityType: "influencer",
    periodDays: 7,
    limit: 10
  }
});

console.log(data.data, data.pagination);
```

## 10. Danh sách nhanh toàn bộ endpoint

| Name | Method | URL | Status chính |
|---|---|---|---|
| Health check | `GET` | `/health` | `200` |
| Database readiness | `GET` | `/ready` | `200`, `500` |
| API index | `GET` | `/api/v1/` | `200` |
| Dataset stats | `GET` | `/api/v1/stats` | `200`, `500` |
| Danh sách KOL | `GET` | `/api/v1/influencers` | `200`, `400`, `500` |
| KOL theo source ID | `GET` | `/api/v1/influencers/source/:sourceId` | `200`, `404`, `500` |
| Chi tiết KOL | `GET` | `/api/v1/influencers/:key` | `200`, `404`, `500` |
| Danh sách kênh | `GET` | `/api/v1/channels` | `200`, `400`, `500` |
| Chi tiết kênh | `GET` | `/api/v1/channels/:key` | `200`, `404`, `500` |
| Danh sách MCN | `GET` | `/api/v1/mcns` | `200`, `400`, `500` |
| Chi tiết MCN | `GET` | `/api/v1/mcns/:sourceId` | `200`, `404`, `500` |
| Kỳ growth | `GET` | `/api/v1/growth/periods` | `200`, `500` |
| Bảng growth | `GET` | `/api/v1/growth/rankings` | `200`, `400`, `500` |
| Chi tiết growth entity | `GET` | `/api/v1/growth/entities/:key` | `200`, `404`, `500` |
| Kỳ BSI | `GET` | `/api/v1/bsi/periods` | `200`, `400`, `500` |
| Bảng BSI | `GET` | `/api/v1/bsi/rankings` | `200`, `400`, `500` |
| Danh sách BSI subject | `GET` | `/api/v1/bsi/subjects` | `200`, `400`, `500` |
| Chi tiết BSI subject | `GET` | `/api/v1/bsi/subjects/:key` | `200`, `404`, `500` |
| Danh mục tin | `GET` | `/api/v1/news/categories` | `200`, `500` |
| Tag tin | `GET` | `/api/v1/news/tags` | `200`, `500` |
| Danh sách tin | `GET` | `/api/v1/news` | `200`, `400`, `500` |
| Chi tiết tin | `GET` | `/api/v1/news/:slug` | `200`, `404`, `500` |
