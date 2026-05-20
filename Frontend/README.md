# PaperHub — Frontend

Giao diện web cho PaperHub: duyệt bài báo, chủ đề, yêu thích, thống kê và đăng nhập (mock). Xây dựng bằng **Next.js** (Pages Router), **React**, **TypeScript** và **Tailwind CSS**.

## Yêu cầu

- **Node.js** LTS (khuyến nghị 18.x trở lên)
- **npm** (đi kèm Node)

## Chạy trên máy

Từ **thư mục gốc repo**, vào `Frontend` rồi cài và chạy:

```bash
cd Frontend
npm install
npm run dev
```

Mở trình duyệt tại **http://localhost:3000** (cổng mặc định trong `package.json`).

### Kết nối backend (bắt buộc cho đăng nhập / favorites)

1. Sao chép env: `cp .env.example .env.local`
2. Chỉnh `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000` (mặc định trong `.env.example`)
3. Bật backend (xem README gốc repo → `backend/`)

Feed bài báo vẫn **mock**; **auth, profile, favorites** gọi API thật.

## Scripts

| Lệnh            | Mô tả                          |
|-----------------|--------------------------------|
| `npm run dev`   | Chế độ phát triển (hot reload) |
| `npm run build` | Build production               |
| `npm run start` | Chạy bản build (`next start`)  |
| `npm run lint`  | Kiểm tra TypeScript (`tsc`)    |

Thư mục `.next` được tạo khi chạy `dev` / `build`; không commit (đã có trong `.gitignore`).

## Cấu trúc thư mục (tóm tắt)

- `src/pages/` — các route Next.js (`index`, `topics`, `statistics`, `auth/…`, v.v.)
- `src/screens/` — màn hình / logic UI tương ứng
- `src/components/` — layout, paper card, …
- `components/ui/` — component UI (shadcn-style)

## Biến môi trường

| Biến | Mô tả |
|------|--------|
| `NEXT_PUBLIC_API_BASE_URL` | URL API backend (mặc định `http://localhost:4000`) |

Tạo `Frontend/.env.local` từ [`.env.example`](.env.example). File `.env.local` không commit.

## Build production

```bash
cd Frontend
npm run build
npm run start
```

## Backend & tích hợp API

Backend nằm ở [`../backend/`](../backend/). Hướng dẫn đầy đủ: [`../specs/001-user-auth/quickstart.md`](../specs/001-user-auth/quickstart.md), tích hợp frontend: [`../specs/001-user-auth/frontend-integration.md`](../specs/001-user-auth/frontend-integration.md).

---

Repo nhóm: [PaperHub](https://github.com/FME849/PaperHub)
