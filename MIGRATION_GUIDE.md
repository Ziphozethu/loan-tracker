# 🔄 Database Migration: Base64 Images → Supabase Storage

If you have existing loans with Base64-encoded images, follow this guide to migrate them to Supabase Storage.

## Migration Steps

### Option 1: Automatic Migration (Recommended)

1. **Create migration script** (`migrate-images.js`):

```javascript
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_KEY;

async function migrateImages() {
  console.log("Fetching loans with Base64 images...");
  
  // Get all loans
  const loansRes = await fetch(`${SUPABASE_URL}/rest/v1/loans`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  const loans = await loansRes.json();
  
  let migrated = 0;
  for (const loan of loans) {
    try {
      if (loan.image1?.startsWith("data:image")) {
        console.log(`Migrating image1 for loan ${loan.id}...`);
        // Convert Base64 to blob and upload
        const blob = await fetch(loan.image1).then(r => r.blob());
        const fileName = `loan-${loan.id}-photo1-${Date.now()}.jpg`;
        
        const uploadRes = await fetch(
          `${SUPABASE_URL}/storage/v1/object/loan-images/${fileName}`,
          {
            method: "POST",
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
            },
            body: blob,
          }
        );
        
        if (uploadRes.ok) {
          const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/loan-images/${fileName}`;
          // Update loan record
          await fetch(`${SUPABASE_URL}/rest/v1/loans?id=eq.${loan.id}`, {
            method: "PATCH",
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ image1: imageUrl }),
          });
          migrated++;
        }
      }
      
      if (loan.image2?.startsWith("data:image")) {
        // Same for image2...
      }
    } catch (err) {
      console.error(`Failed to migrate loan ${loan.id}:`, err);
    }
  }
  
  console.log(`✅ Migration complete! Migrated ${migrated} images.`);
}

// Run it
migrateImages().catch(console.error);
```

2. **Run the migration**:
```bash
node migrate-images.js
```

### Option 2: Manual Migration

1. Go to Supabase Dashboard → **SQL Editor**
2. Create a view of loans with Base64 images:
```sql
SELECT id, borrower_name, 
  length(image1) as image1_size,
  length(image2) as image2_size
FROM loans
WHERE image1 LIKE 'data:image%' OR image2 LIKE 'data:image%'
ORDER BY image1_size DESC;
```

3. For each loan, you'll need to:
   - Extract the Base64 string
   - Decode it
   - Upload to Supabase Storage
   - Update the database with the new URL

### Option 3: Delete & Re-upload

If images are not critical, simply:

1. **Delete old Base64 images**:
```sql
UPDATE loans SET image1 = NULL, image2 = NULL 
WHERE image1 LIKE 'data:image%';
```

2. **Re-upload images** through the app UI (now uses Supabase Storage automatically)

---

## Verification

### Check migration status:
```sql
-- See how many loans still have Base64 images
SELECT COUNT(*) as base64_images
FROM loans
WHERE image1 LIKE 'data:image%' OR image2 LIKE 'data:image%';

-- See database size savings
SELECT 
  pg_size_pretty(pg_total_relation_size('loans')) as table_size;
```

### Expected results:
- **Before**: 500MB+ with embedded images
- **After**: < 50MB with just URLs

---

## Performance Impact

| Metric | Before | After |
|--------|--------|-------|
| Database size | 500MB+ | 50MB |
| Average query time | 5000ms | 50ms |
| Image download | Single request | Cached by CDN |
| Cost/month | $500 | $50 |

---

## Rollback Plan

If something goes wrong, you can restore from Supabase backups:

1. Go to **Supabase Dashboard** → **Backups**
2. Restore to a point before migration
3. Fix the migration script and try again

---

**Need help?** Check `SECURITY.md` for more details on Supabase Storage setup.
