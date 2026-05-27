# 🚀 Roadmap Platform

> A modern roadmap-based learning platform built for a college club initiative.

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge\&logo=next.js)
![Supabase](https://img.shields.io/badge/Supabase-Backend-green?style=for-the-badge\&logo=supabase)
![TypeScript](https://img.shields.io/badge/TypeScript-Frontend-blue?style=for-the-badge\&logo=typescript)
![Tailwind](https://img.shields.io/badge/TailwindCSS-UI-38bdf8?style=for-the-badge\&logo=tailwindcss)

---

## 📖 About

This project was developed as part of a college club initiative to help students follow structured learning roadmaps across different technical domains.

The platform provides:

* 📚 Dynamic learning roadmaps
* 🔐 Secure authentication
* 📈 User progress tracking
* 🛠️ Admin management system
* 📥 Exportable progress reports
* ⚡ Modern responsive UI

---

## ✨ Features

### 👨‍🎓 User Features

* Google Authentication
* Dynamic Roadmap Navigation
* Progress Tracking
* Bookmarks
* Recently Viewed
* Export Progress
* Print Progress Reports
* Responsive Dashboard

### 🛡️ Admin Features

* Admin Dashboard
* Add/Edit/Delete Roadmaps
* Manage Categories
* Publish/Unpublish Roadmaps
* User Analytics
* Progress Monitoring

---

## 🧠 Tech Stack

| Technology    | Purpose            |
| ------------- | ------------------ |
| Next.js       | Frontend Framework |
| TypeScript    | Type Safety        |
| Tailwind CSS  | Styling            |
| Supabase      | Backend + Auth     |
| PostgreSQL    | Database           |
| Framer Motion | Animations         |
| shadcn/ui     | UI Components      |

---

## ⚙️ Setup

### 1️⃣ Clone Repository

```bash
git clone <your-repo-url>
```

---

### 2️⃣ Install Dependencies

```bash
pnpm install
```

---

### 3️⃣ Configure Environment Variables

Create:

```env
.env.local
```

Add:

```env
NEXT_PUBLIC_SUPABASE_URL=your-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key
```

---

### 4️⃣ Setup Database

Run the contents of:

```txt
schema.sql
```

inside the Supabase SQL Editor.

---

### 5️⃣ Start Development Server

```bash
pnpm run dev
```

---

## 🔐 Authentication

Authentication is handled using:

* Supabase Auth
* Google OAuth
* Protected Middleware Routes

---

## 👑 Admin Access

Admins are assigned using the `admin_roles` table.

Example:

```sql
insert into public.admin_roles (id, role)
values ('USER_UUID', 'admin');
```

---

## 📂 Project Structure

```txt
app/
components/
lib/
docs/
schema.sql
README.md
```

---

## 📌 Project Status

🚧 Currently under active development and testing.

---

## 👨‍💻 Author

### Sandip Panchariya

* GitHub
* LinkedIn
* Portfolio

---

## ⭐ Notes

This project focuses heavily on:

* scalable architecture
* clean UI/UX
* secure authentication
* roadmap-based learning workflows
* role-based access systems
