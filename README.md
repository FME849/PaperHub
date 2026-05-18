# PaperHub

Monorepo cho dự án PaperHub — quản lý và khám phá bài báo khoa học.

## Cấu trúc

| Thư mục | Mô tả |
|---------|--------|
| [`Frontend/`](./Frontend/) | Giao diện Next.js (React, TypeScript, Tailwind) |
| [`backend/`](./backend/) | API Express + Prisma + MySQL |
| [`specs/`](./specs/) | Đặc tả tính năng (Spec Kit) |

## Chạy nhanh

**Frontend** (giao diện, mock data):

```bash
cd Frontend
npm install
npm run dev
```

→ http://localhost:3000

**Backend** (API, cần Docker cho MySQL):

```bash
cd backend
cp .env.example .env
docker compose up -d
npm install
npx prisma migrate dev
npm run dev
```

→ http://localhost:4000

Chi tiết: [Frontend/README.md](./Frontend/README.md) · [specs/001-user-auth/quickstart.md](./specs/001-user-auth/quickstart.md)

---

Repo nhóm: [FME849/PaperHub](https://github.com/FME849/PaperHub)
