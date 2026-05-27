# Admin Documentation

## Overview

The platform supports role-based administration.

Admins can:

* manage roadmaps
* manage categories
* publish/unpublish content
* monitor progress
* access analytics

---

# Admin Roles

Administrative access is controlled using:

```txt
admin_roles
```

table.

---

# Making a User Admin

## 1. Login Normally

Admins authenticate using the same Google login flow as regular users.

---

## 2. Copy User UUID

Inside Supabase:

* Authentication
* Users

Copy the user's UUID.

---

## 3. Insert Admin Role

Run:

```sql
insert into public.admin_roles (id, role)
values ('USER_UUID', 'admin');
```

---

# Admin Dashboard

The admin dashboard allows:

* roadmap creation
* roadmap editing
* roadmap deletion
* category assignment
* publishing workflows

---

# Roadmap Structure

Roadmaps are structured as:

```txt
Roadmap
└── Sections
    └── Nodes/Topics
```

Example:

```txt
Web Development
├── HTML
├── CSS
├── JavaScript
└── React
```

---

# Publishing Workflow

Admins can:

* save drafts
* publish roadmaps
* unpublish roadmaps

Only published roadmaps are visible to users.

---

# Permissions

Normal users:

* cannot access admin dashboard
* cannot modify roadmaps
* cannot access analytics

All admin permissions are validated server-side.

---

# Security Notes

Admin permissions are protected using:

* middleware validation
* database role checks
* RLS policies
* protected API routes
