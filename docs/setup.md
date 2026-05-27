# Setup Guide

## Requirements

Before running the project locally, ensure you have:

* Node.js installed
* pnpm or npm installed
* A Supabase project created
* Git installed

---

# 1. Clone Repository

```bash
git clone <your-repository-url>
```

---

# 2. Open Project

```bash
cd roadmap-platform
```

---

# 3. Install Dependencies

Using pnpm:

```bash
pnpm install
```

Or using npm:

```bash
npm install
```

---

# 4. Configure Environment Variables

Create a file named:

```env
.env.local
```

Add:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

# 5. Setup Database

Open the Supabase dashboard.

Navigate to:

* SQL Editor

Open the `schema.sql` file from the project.

Copy all contents and run them inside the SQL editor.

---

# 6. Start Development Server

Using pnpm:

```bash
pnpm run dev
```

Or npm:

```bash
npm run dev
```

---

# 7. Open Application

Visit:

```txt
http://localhost:3000
```

---

# Notes

* Ensure `.env.local` is NOT committed to GitHub.
* Restart the development server after changing environment variables.
* Google OAuth must be configured inside Supabase Authentication settings.
