# Supabase SQL Setup for QR Onboarding

## 1. Add `bank_name` column to `loans` table

Run this SQL in your Supabase SQL Editor:

```sql
ALTER TABLE loans
ADD COLUMN IF NOT EXISTS bank_name TEXT;
```

## 2. Create `pending_applications` table

Run this SQL in your Supabase SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS pending_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  residency_place TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  due_date TIMESTAMP NOT NULL,
  image1 TEXT,
  image2 TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  status TEXT DEFAULT 'pending'
);

-- Create index for faster queries
CREATE INDEX idx_pending_applications_status ON pending_applications(status);
```

## 3. Set Row Level Security (RLS) Policies

```sql
-- Enable RLS
ALTER TABLE pending_applications ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (for form submissions)
CREATE POLICY "allow_insert_pending" 
  ON pending_applications FOR INSERT 
  WITH CHECK (true);

-- Allow authenticated users to select, update, delete
CREATE POLICY "allow_select_pending" 
  ON pending_applications FOR SELECT 
  TO authenticated USING (true);

CREATE POLICY "allow_delete_pending" 
  ON pending_applications FOR DELETE 
  TO authenticated USING (true);
```

## 4. Update existing `loans` table RLS (if needed)

```sql
CREATE POLICY "allow_all_authenticated" 
  ON loans FOR ALL 
  TO authenticated USING (true);
```

---

## ✅ Verification

After running the SQL above, verify in your Supabase SQL Editor:

```sql
-- Check loans table has bank_name
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'loans' 
ORDER BY ordinal_position;

-- Check pending_applications table exists
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'pending_applications' 
ORDER BY ordinal_position;
```

You should see `bank_name` in the loans columns and all the fields in pending_applications.
