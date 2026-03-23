# 📦 SUPABASE STORAGE - Setup Guida

## 1️⃣ Crea Bucket su Supabase

### Via Dashboard Supabase:
1. Vai su https://supabase.com/dashboard
2. Seleziona il tuo progetto Haraldica Firenze
3. Nel menu laterale, clicca su **Storage**
4. Clicca su **New bucket**
5. Configura:
   ```
   Name: product-images
   Public: ✅ YES (public bucket)
   File size limit: 5MB
   Allowed MIME types: image/jpeg, image/png, image/webp, image/gif
   ```
6. Clicca **Create bucket**

### Struttura Cartelle (verrà creata automaticamente):
```
product-images/
├── products/
│   ├── thumbnails/
│   └── [immagini prodotti]
└── avatars/
    ├── thumbnails/
    └── [avatar utenti]
```

## 2️⃣ Configura Policies (Sicurezza)

### Policy 1: Public Read (tutti possono leggere)
```sql
-- Nel SQL Editor di Supabase:
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');
```

### Policy 2: Admin Upload (solo admin possono caricare)
```sql
CREATE POLICY "Admin Upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'product-images'
  AND auth.jwt() ->> 'role' = 'admin'
);
```

### Policy 3: Admin Delete (solo admin possono eliminare)
```sql
CREATE POLICY "Admin Delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'product-images'
  AND auth.jwt() ->> 'role' = 'admin'
);
```

### Policy 4: Admin Update (solo admin possono aggiornare)
```sql
CREATE POLICY "Admin Update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'product-images'
  AND auth.jwt() ->> 'role' = 'admin'
);
```

## 3️⃣ Variabili Ambiente (.env)

Aggiungi queste variabili al tuo `.env`:

```bash
# Supabase Storage
SUPABASE_STORAGE_BUCKET=product-images
USE_SUPABASE_STORAGE_LOCALLY=true

# Già esistenti (verifica che ci siano):
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 4️⃣ Test Upload

### Endpoint API:
```
POST http://localhost:3000/api/v1/upload/product-image
Authorization: Bearer <admin-token>
Content-Type: multipart/form-data

Body:
- image: <file>
- width: 800 (optional)
- height: 800 (optional)
- quality: 85 (optional)
```

### Risposta Attesa:
```json
{
  "filename": "1710980123456-abc123.webp",
  "originalName": "product.jpg",
  "size": 123456,
  "mimetype": "image/jpeg",
  "url": "https://your-project.supabase.co/storage/v1/object/public/product-images/products/1710980123456-abc123.webp",
  "thumbnailUrl": "https://your-project.supabase.co/storage/v1/object/public/product-images/products/thumbnails/1710980123456-abc123.webp"
}
```

## 5️⃣ Frontend Upload (Admin Dashboard)

Il componente admin products già usa `uploadMultipleImages()` dell'AdminService, che punta a:
```
POST /upload/product-images
```

Questo endpoint accetta multipli file e ritorna:
```json
{
  "urls": [
    "https://...supabase.co/.../image1.webp",
    "https://...supabase.co/.../image2.webp"
  ],
  "results": [...]
}
```

## 🔧 Troubleshooting

### Errore: "Bucket does not exist"
- Verifica che il bucket sia stato creato
- Controlla che SUPABASE_STORAGE_BUCKET corrisponda al nome bucket

### Errore: "new row violates row-level security policy"
- Le policies non sono configurate correttamente
- Verifica che l'utente admin abbia il claim `role: admin` nel JWT

### Errore: "File too large"
- Limite 5MB per file
- Comprimi l'immagine prima dell'upload

### Immagini non visibili
- Verifica che il bucket sia PUBLIC
- Controlla che la policy di READ sia configurata

## ✅ Checklist

- [ ] Bucket `product-images` creato su Supabase
- [ ] Bucket impostato come PUBLIC
- [ ] Policies configurate (Read, Insert, Update, Delete)
- [ ] .env aggiornato con SUPABASE_STORAGE_BUCKET
- [ ] Backend riavviato
- [ ] Test upload singola immagine
- [ ] Test upload multiple immagini
- [ ] Verifica URL immagini nel browser

---

**Note:**
- Le immagini vengono automaticamente convertite in WebP per ottimizzazione
- Vengono create thumbnail automatiche (200x200px)
- Cache di 1 anno sulle immagini pubbliche
- Max 5MB per immagine
- Max 10 immagini per upload multiplo
