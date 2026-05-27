# Authentication Documentation

## Authentication Provider

Authentication is handled using:

* Supabase Auth
* Google OAuth

---

# Google OAuth Setup

## 1. Create OAuth Credentials

Inside Google Cloud Console:

* Create OAuth Client ID
* Application type: Web Application

---

## 2. Authorized JavaScript Origins

Add:

```txt
http://localhost:3000
```

---

## 3. Authorized Redirect URI

Add:

```txt
https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback
```

Example:

```txt
https://wlmcwxnmkahonxotmkmu.supabase.co/auth/v1/callback
```

---

# Supabase Configuration

Inside Supabase:

## Authentication → URL Configuration

Set:

### Site URL

```txt
http://localhost:3000
```

### Redirect URL

```txt
http://localhost:3000/auth/callback
```

---

# Middleware Protection

Protected routes include:

* /dashboard
* /roadmap/*
* /category/*
* /admin/*

Unauthenticated users are redirected to:

```txt
/login
```

---

# Admin Protection

Admin routes validate:

* active session
* admin role existence

Admin checks are performed both:

* frontend
* backend/server-side

---

# Auth Callback Flow

Google Login Flow:

1. User clicks Google Login
2. Google OAuth opens
3. Supabase validates login
4. OAuth redirects to:

   ```txt
   /auth/callback
   ```
5. Session is exchanged securely
6. User redirected into application

---

# Session Handling

The project uses:

* middleware session validation
* secure auth cookies
* server-side session checks

Authentication state persists across refresh/navigation.
