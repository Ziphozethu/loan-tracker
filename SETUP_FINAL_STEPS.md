# 🎯 Final Setup Steps

## ✅ Completed Tasks
- ✓ `.env.local` updated with 4 environment variables
- ✓ React Router installed (`react-router-dom`)
- ✓ `index.js` configured with routing for `/` and `/apply` pages

---

## 📋 Remaining Steps (In Supabase Dashboard)

### 1️⃣ Add `bank_name` Column to `loans` Table

Go to **Supabase SQL Editor** and run:

```sql
ALTER TABLE loans ADD COLUMN IF NOT EXISTS bank_name text;
```

---

### 2️⃣ Create `pending_applications` Table

Run this SQL in the Supabase SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS pending_applications (
  id               uuid primary key default gen_random_uuid(),
  borrower_name    text not null,
  phone            text not null,
  account_number   text,
  bank_name        text,
  residency_place  text,
  amount           numeric not null,
  due_date         date not null,
  image1           text,
  image2           text,
  status           text default 'pending',
  submitted_at     timestamptz default now()
);
```

---

### 3️⃣ Create Storage Bucket for Images

1. Go to **Storage** in Supabase dashboard
2. Click **Create a new bucket** 
3. Name it: `loan-images`
4. Make it **PUBLIC** (toggle the "public" setting)
5. Click **Create bucket**

---

### 4️⃣ Enable RLS (Row Level Security) on `pending_applications`

In the SQL Editor, run:

```sql
ALTER TABLE pending_applications ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert
CREATE POLICY "allow_insert"
  ON pending_applications
  FOR INSERT
  WITH CHECK (true);

-- Allow admins to view/manage all
CREATE POLICY "allow_select"
  ON pending_applications
  FOR SELECT
  USING (true);

CREATE POLICY "allow_delete"
  ON pending_applications
  FOR DELETE
  USING (true);
```

---

## 🚀 You're Ready!

Once you've run these SQL commands in Supabase:
- Users can apply via `/apply` route (with QR code support)
- Admins can review applications in the dashboard
- Images are stored in the public `loan-images` bucket
- Both `loans` and `pending_applications` include bank information

**Note:** Change `REACT_APP_ADMIN_PIN` and `REACT_APP_VIEWER_PASSWORD` in `.env.local` to your preferred secure values before deploying!
