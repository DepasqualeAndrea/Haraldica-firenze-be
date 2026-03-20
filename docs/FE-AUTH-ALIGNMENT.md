## Allineamento FE/BE — Auth Cookies + CSRF + HTTPS

Questa nota descrive come il FE deve allinearsi alle nuove policy BE:

### 1) Token in httpOnly cookies (stop localStorage)
- Il BE ora emette `access_token` e `refresh_token` come cookie `httpOnly`.
- Endpoint:
  - `POST /api/v1/auth/login` → imposta cookie
  - `POST /api/v1/auth/register` → imposta cookie
  - `POST /api/v1/auth/upgrade-from-order` → imposta cookie
  - `POST /api/v1/auth/refresh` → ruota cookie (usa `refresh_token`)
  - `POST /api/v1/auth/logout` → invalida token e cancella cookie
- FE:
  - Non usare più `localStorage` per token.
  - Tutte le chiamate devono usare `withCredentials: true`.

### 2) CSRF protection con `X-CSRF-Token`
- Endpoint BE:
  - `GET /api/v1/auth/csrf` → restituisce `{ csrfToken }` e setta cookie `csrfToken` (non httpOnly)
- Regola BE:
  - Tutte le richieste mutative (POST/PUT/PATCH/DELETE) richiedono header `X-CSRF-Token`
  - Esclusi: `/health`, `/webhooks/stripe`, `/api/v1/auth/csrf`
- FE:
  - All’avvio chiamare `GET /auth/csrf` e tenere il token in memoria.
  - Su ogni mutazione aggiungere header `X-CSRF-Token`.

### 3) HTTPS enforcement
- BE: HSTS attivo, HTTPS obbligatorio via ALB.
- FE: assicurarsi che `VITE_API_BASE_URL` usi `https`.

---

## Patch FE richiesta (high level)

### A) apiClient (Axios)
- `withCredentials: true`
- Request interceptor:
  - se metodo non-safe → aggiungere `X-CSRF-Token` letto dal singleton
- Response interceptor:
  - su 401 → chiamare `POST /auth/refresh` (senza leggere localStorage)
  - riprovare la request originale

### B) CSRF singleton (in-memory)
- Modulo che:
  - ha `init()` → chiama `GET /auth/csrf`
  - salva token in memoria
  - espone `getToken()`

### C) Rimozione `storage.ts`
- Eliminare utility che legge/scrive token.
- Sostituire usage con:
  - `auth/session` per caricare user info
  - `auth/refresh` per ruotare cookie

---

## Note operative
- Browser deve accettare cookie `SameSite=Lax/Strict` (prod: Strict).
- Se FE e BE sono su domini diversi, valutare `COOKIE_DOMAIN` e `SameSite=None` + `Secure`.
