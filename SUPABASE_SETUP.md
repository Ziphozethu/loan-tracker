# Supabase Database Setup

## Adding Missing Columns to the `loans` Table

Your app needs these columns in the Supabase `loans` table:
- `account_number` (text)
- `residency_place` (text)
- `image1` (text)
- `image2` (text)

### Method 1: Supabase SQL Editor (Recommended)

1. **Go to Supabase Dashboard:**
   https://supabase.com/dashboard/project/fdsqwpgwhcpceiptamfy/sql

2. **Click the "New Query" button**

3. **Copy and paste this SQL:**
   ```sql
   -- Add missing columns to loans table for South African loan tracker
   ALTER TABLE loans
   ADD COLUMN IF NOT EXISTS account_number TEXT,
   ADD COLUMN IF NOT EXISTS residency_place TEXT,
   ADD COLUMN IF NOT EXISTS image1 TEXT,
   ADD COLUMN IF NOT EXISTS image2 TEXT;
   ```

4. **Click "Run" button (or press Ctrl+Enter)**

5. **You should see:** `Success. No rows affected.`

---

### Method 2: Table Editor (GUI Method)

If you prefer the visual editor:

1. Go to Supabase Dashboard
2. Click **Table Editor** in the left sidebar
3. Click on the **`loans`** table
4. Click the **`+`** button to add a new column

Add these columns:

| Column Name | Type | Nullable | Default |
|---|---|---|---|
| account_number | text | Yes | NULL |
| residency_place | text | Yes | NULL |
| image1 | text | Yes | NULL |
| image2 | text | Yes | NULL |

---

### Verify the Columns Were Added

Run this query in SQL Editor to check:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'loans'
ORDER BY ordinal_position;
```

You should see all these columns listed:
- id
- created_at
- borrower_name
- phone
- amount
- loan_date
- due_date
- notes
- status
- account_number ✅
- residency_place ✅
- image1 ✅
- image2 ✅

---

## Next Steps

After adding the columns:

1. Your Vercel app is already deployed and ready
2. Visit: https://loan-tracker-eight-alpha.vercel.app
3. Log in with:
   - Role: **Administrator**
   - PIN: **1234**

4. Start adding borrowers with the new fields:
   - Account Number
   - Residency Place
   - 2 Profile Images

---

## Troubleshooting

**"Cannot find table"?**
- Make sure you're in the correct Supabase project
- Project URL: `https://fdsqwpgwhcpceiptamfy.supabase.co`

**"Column already exists"?**
- The columns might already be there - check Method 2 to verify

**Images not saving?**
- Base64 images are stored as TEXT fields
- For large-scale deployments, consider using Supabase Storage instead

---

## Support

If you need help, share your project details with support:
- Project ID: `fdsqwpgwhcpceiptamfy`
- Database: PostgreSQL (Supabase)
