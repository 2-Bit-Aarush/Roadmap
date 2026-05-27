# Database Documentation

## Overview

The project uses PostgreSQL through Supabase.

The schema is defined inside:

```txt
schema.sql
```

The database is protected using Row Level Security (RLS).

---

# Core Tables

## profiles

Stores user profile information.

Fields include:

* id
* full_name
* avatar_url
* email

Connected directly to:

```txt
auth.users
```

---

## admin_roles

Defines administrative users.

Used for:

* admin dashboard access
* roadmap management permissions
* analytics permissions

Example role:

* admin

---

## roadmaps

Stores roadmap metadata.

Fields:

* title
* description
* category
* difficulty
* estimated_duration
* published status

---

## roadmap_sections

Represents sections inside a roadmap.

Example:

* HTML
* CSS
* JavaScript

---

## roadmap_nodes

Stores learning topics/nodes inside sections.

Supports:

* descriptions
* learning resources
* ordering
* progress tracking

---

## progress_tracking

Stores completed nodes for each user.

Used for:

* progress dashboards
* exports
* completion percentage

---

## bookmarks

Stores bookmarked roadmaps for users.

---

## recently_viewed

Tracks recently opened roadmaps.

---

## admin_logs

Stores administrative activity logs.

Examples:

* roadmap creation
* roadmap deletion
* publish actions

---

# Row Level Security (RLS)

RLS is enabled to ensure users can only access their own data.

Examples:

* users can only edit their own profile
* users can only see their own progress
* only admins can modify roadmaps

---

# Security Notes

The database protects against:

* unauthorized access
* privilege escalation
* cross-user data access

All sensitive actions are validated server-side.
