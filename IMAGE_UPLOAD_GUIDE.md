# 📸 Image Upload System - Developer Guide

## Overview
Images are now uploaded to **Supabase Storage** instead of being converted to Base64 and stored in the database. This improves performance and reduces costs.

---

## Architecture

```
User selects image
        ↓
FileReader shows local preview
        ↓
File stored in state (pendingImages)
        ↓
User clicks "Save Loan"
        ↓
uploadImageToStorage() executes
        ↓
Image uploaded to Supabase Storage
        ↓
URL returned and stored in database
        ↓
Image displayed via URL (cached by CDN)
```

---

## Code Reference

### 1. Upload Function (`App.js`)
```javascript
async function uploadImageToStorage(file, loanId, imageType) {
  const fileName = `loan-${loanId}-${imageType}-${Date.now()}.${file.name.split(".").pop()}`;
  const bucketName = "loan-images";
  
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucketName}/${fileName}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: file,  // Send raw file, not Base64
  });
  
  if (!res.ok) throw new Error("Image upload failed");
  
  // Return public URL
  return `${SUPABASE_URL}/storage/v1/object/public/${bucketName}/${fileName}`;
}
```

### 2. LoanModal Component Changes
```javascript
const [pendingImages, setPendingImages] = useState({ image1: null, image2: null });

// Store file for later upload
const handleImg = async (key, file) => {
  if (!file) return;
  
  // Show preview locally
  const reader = new FileReader();
  reader.onload = (e) => set(key, e.target.result);
  reader.readAsDataURL(file);
  
  // Store file for upload
  setPendingImages(p => ({ ...p, [key]: file }));
};

// Upload when saving
const handleSave = async () => {
  // ... validation ...
  
  if (pendingImages.image1) {
    const url = await uploadImageToStorage(pendingImages.image1, loan.id, "photo1");
    uploadData.image1 = url;
  }
  
  // Send uploadData (with URLs) to backend
  await onSave(uploadData);
};
```

---

## Database Schema

### Before (Base64 - ❌)
```sql
CREATE TABLE loans (
  id BIGSERIAL PRIMARY KEY,
  borrower_name TEXT,
  image1 TEXT,  -- Stores: "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
  image2 TEXT,  -- 2.7MB per image!
);
```

### After (URLs - ✅)
```sql
CREATE TABLE loans (
  id BIGSERIAL PRIMARY KEY,
  borrower_name TEXT,
  image1 TEXT,  -- Stores: "https://xxx.supabase.co/storage/v1/object/public/loan-images/loan-123-photo1.jpg"
  image2 TEXT,  -- Only ~500 bytes per URL
);
```

---

## File Naming Convention

Images are named with this pattern:
```
loan-{loanId}-{imageType}-{timestamp}.{extension}

Example: loan-42-photo1-1623456789012.jpg
```

**Benefits**:
- Unique filenames prevent collisions
- Easy to track which loan/photo
- Timestamp prevents overwrites

---

## Supabase Storage Setup

### 1. Create Bucket
```bash
# Via dashboard
Supabase Dashboard → Storage → Create new bucket
Name: loan-images
Privacy: Public (so images can be viewed)
```

### 2. Storage Policy (SQL)
```sql
-- Allow anyone to view images
CREATE POLICY "Public image access" 
  ON storage.objects 
  FOR SELECT 
  USING (bucket_id = 'loan-images');

-- Allow authenticated users to upload
CREATE POLICY "Users can upload images" 
  ON storage.objects 
  FOR INSERT 
  WITH CHECK (bucket_id = 'loan-images' AND auth.role() = 'authenticated');

-- Allow users to delete their own images
CREATE POLICY "Users can delete own images" 
  ON storage.objects 
  FOR DELETE 
  USING (bucket_id = 'loan-images');
```

---

## API Endpoints

### Upload Image
```bash
POST /storage/v1/object/{bucket}/{filepath}

Headers:
  apikey: {SUPABASE_KEY}
  Authorization: Bearer {SUPABASE_KEY}

Body: Raw file (multipart/form-data or binary)

Response:
  {
    "name": "loan-42-photo1.jpg",
    "id": "xxx",
    "updated_at": "2025-06-07T10:00:00Z",
    "created_at": "2025-06-07T10:00:00Z",
    "last_accessed_at": "2025-06-07T10:00:00Z",
    "metadata": {
      "size": 2048576,
      "mimetype": "image/jpeg"
    }
  }

Public URL:
  https://{project}.supabase.co/storage/v1/object/public/{bucket}/{filepath}
```

### Delete Image
```bash
DELETE /storage/v1/object/{bucket}/{filepath}

Headers:
  apikey: {SUPABASE_KEY}
  Authorization: Bearer {SUPABASE_KEY}
```

### List Images
```bash
GET /storage/v1/object/list/{bucket}?prefix={prefix}

Headers:
  apikey: {SUPABASE_KEY}
```

---

## Displaying Images

### From Component
```javascript
// URLs are stored in database
{loan.image1 && <img src={loan.image1} alt="ID photo" />}
```

### Direct Link
```
https://project.supabase.co/storage/v1/object/public/loan-images/loan-42-photo1.jpg
```

---

## Error Handling

### Upload Errors
```javascript
try {
  const url = await uploadImageToStorage(file, loanId, "photo1");
  // Success - url is ready to store in DB
} catch (err) {
  // Handle: file too large, network error, auth failed, etc
  console.error("Upload failed:", err.message);
}
```

### Common Issues
| Error | Cause | Solution |
|-------|-------|----------|
| 413 Payload Too Large | File > 10MB | Compress image or increase limit |
| 403 Forbidden | Auth failed | Check SUPABASE_KEY |
| 404 Not Found | Bucket doesn't exist | Create `loan-images` bucket |
| Network timeout | Slow upload | Check file size and connection |

---

## Performance Tips

### 1. Image Compression
```javascript
// Compress before uploading
async function compressImage(file, maxWidth = 1000) {
  const canvas = document.createElement('canvas');
  const img = new Image();
  img.src = URL.createObjectURL(file);
  
  await new Promise(r => img.onload = r);
  
  const scale = Math.min(maxWidth / img.width, 1);
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  
  return new Promise(resolve => {
    canvas.toBlob(resolve, 'image/jpeg', 0.8); // 80% quality
  });
}
```

### 2. Lazy Loading
```javascript
{loan.image1 && (
  <img src={loan.image1} alt="ID" loading="lazy" />
)}
```

### 3. CDN Caching
Supabase Storage uses Cloudflare CDN by default:
- First request: Downloads from origin
- Subsequent requests: Served from cache
- Cache headers: Automatically set to 1 year for image files

---

## Size Limits

| Limit | Value |
|-------|-------|
| File size | 10MB per file (configurable) |
| Bucket storage | 1GB free tier (or per plan) |
| Total objects | Unlimited |
| Bandwidth | 1GB/month free (or per plan) |

---

## Monitoring

### Check Upload Progress
```javascript
const handleImg = async (key, file) => {
  // Use fetch with progress event
  const xhr = new XMLHttpRequest();
  
  xhr.upload.addEventListener("progress", (e) => {
    if (e.lengthComputable) {
      const percentComplete = (e.loaded / e.total) * 100;
      console.log(`Upload ${percentComplete}% complete`);
    }
  });
  
  // ... upload logic ...
};
```

### View Storage Usage
```
Supabase Dashboard → Storage → Analytics
Shows: Total size, upload/download counts, bandwidth used
```

---

## Best Practices

✅ **DO**
- Compress images before upload
- Use descriptive file names
- Set appropriate expiry on sensitive images
- Monitor storage usage
- Clean up unused images periodically

❌ **DON'T**
- Upload files > 5MB (compress first)
- Store sensitive data (SSN, credit cards) in images
- Use Base64 for new code
- Store too many versions of same image
- Leave permanent URLs in code (use database)

---

## Migration from Base64

See `MIGRATION_GUIDE.md` for detailed steps to convert existing Base64 images.

Quick summary:
1. Get old Base64 data URL from database
2. Convert data URL to blob: `fetch(dataUrl).then(r => r.blob())`
3. Upload blob using `uploadImageToStorage()`
4. Update database with new URL

---

## FAQ

**Q: Will existing loans still work?**
A: Yes! Old Base64 images still display in the `<img>` tag. Migrate at your own pace.

**Q: How much storage do I need?**
A: Depends on image size and quantity. Rule of thumb: 1MB per loan with 2 photos.

**Q: Can I download images?**
A: Yes, via the public URL in the database. Use `fetch(url).then(r => r.blob())`.

**Q: How do I delete images?**
A: Delete via API or Supabase Dashboard. Image URLs in database will then return 404.

**Q: Can users see all uploaded images?**
A: Only those with the URL. If you want privacy, set bucket to Private and use signed URLs.

---

For more details, see:
- `SECURITY.md` - Security implications
- `MIGRATION_GUIDE.md` - Migrating old images
- [Supabase Storage Docs](https://supabase.com/docs/guides/storage)
