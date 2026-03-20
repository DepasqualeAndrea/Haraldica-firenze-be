# Documentazione API Backend - Allineamento Frontend

**Versione:** 1.0.0
**Data:** Gennaio 2025
**Base URL:** `https://api.meravien.com/api/v1`

---

## Indice

1. [Security Audit Report](#1-security-audit-report)
2. [Nuovi Endpoint Implementati](#2-nuovi-endpoint-implementati)
   - [Wishlist API](#21-wishlist-api)
   - [GDPR/User Export API](#22-gdpruser-export-api)
   - [Newsletter API (Admin)](#23-newsletter-api-admin)
3. [Endpoint Modificati](#3-endpoint-modificati)
   - [Reviews Eligibility](#31-reviews-eligibility)
4. [Event System (Email Triggers)](#4-event-system-email-triggers)
5. [Modelli Database Nuovi](#5-modelli-database-nuovi)
6. [Script di Seed](#6-script-di-seed)
7. [Breaking Changes](#7-breaking-changes)

---

## 1. Security Audit Report

### Riepilogo Sicurezza

| Area | Status | Dettagli |
|------|--------|----------|
| **Stripe Payments** | ✅ SICURO | Tokenizzazione, webhook signature validation |
| **Password Hashing** | ✅ SICURO | bcrypt 12 rounds |
| **JWT Blacklist** | ✅ SICURO | Redis-based |
| **Rate Limiting** | ✅ SICURO | 500 req/15min prod |
| **Input Validation** | ✅ SICURO | ValidationPipe con whitelist |
| **SQL Injection** | ✅ SICURO | TypeORM parametrizzato |
| **GDPR Compliance** | ✅ IMPLEMENTATO | Export dati + soft delete |

### Raccomandazioni Frontend
- Implementare HTTPS enforcement (redirect da HTTP)
- Aggiungere header `X-CSRF-Token` nelle richieste mutative
- Non salvare dati sensibili in localStorage (preferire httpOnly cookies per token)

---

## 2. Nuovi Endpoint Implementati

### 2.1 Wishlist API

**Base Path:** `/api/v1/wishlists`
**Autenticazione:** JWT Required

#### GET /wishlists
Ottiene la wishlist dell'utente corrente.

**Response:**
```json
{
  "success": true,
  "wishlist": [
    {
      "id": "uuid",
      "productId": "uuid",
      "userId": "uuid",
      "createdAt": "2025-01-29T10:00:00Z",
      "product": {
        "id": "uuid",
        "name": "Crema Viso Idratante",
        "slug": "crema-viso-idratante",
        "price": 29.90,
        "images": ["https://..."],
        "isActive": true
      }
    }
  ],
  "count": 1
}
```

#### POST /wishlists
Aggiunge un prodotto alla wishlist.

**Request Body:**
```json
{
  "productId": "uuid"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Prodotto aggiunto alla wishlist",
  "item": { ... }
}
```

**Errori:**
- `404` - Prodotto non trovato o non disponibile
- `409` - Prodotto già presente nella wishlist

#### POST /wishlists/toggle/:productId
Toggle: aggiunge o rimuove il prodotto dalla wishlist.

**Response:**
```json
{
  "success": true,
  "isInWishlist": true,
  "message": "Prodotto aggiunto alla wishlist"
}
```

#### DELETE /wishlists/:productId
Rimuove un prodotto dalla wishlist.

**Response:**
```json
{
  "success": true,
  "message": "Prodotto rimosso dalla wishlist"
}
```

#### GET /wishlists/check/:productId
Verifica se un prodotto è nella wishlist.

**Response:**
```json
{
  "success": true,
  "isInWishlist": true
}
```

#### GET /wishlists/count
Conta i prodotti nella wishlist.

**Response:**
```json
{
  "success": true,
  "count": 5
}
```

#### DELETE /wishlists
Svuota tutta la wishlist.

**Response:**
```json
{
  "success": true,
  "message": "5 prodotti rimossi dalla wishlist",
  "removed": 5
}
```

---

### 2.2 GDPR/User Export API

**Base Path:** `/api/v1/users`
**Autenticazione:** JWT Required

#### GET /users/me/export
Esporta tutti i dati dell'utente (GDPR Art. 20 - Portabilità).

**Response:**
```json
{
  "success": true,
  "message": "Dati esportati con successo",
  "exportDate": "2025-01-29T10:00:00Z",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "Mario",
    "lastName": "Rossi",
    "phone": "+39 333 1234567",
    "role": "customer",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00Z",
    "totalOrders": 5,
    "totalSpent": 250.00
  },
  "orders": [
    {
      "id": "uuid",
      "orderNumber": "MRV-2025-0001",
      "status": "delivered",
      "total": 59.90,
      "items": [...]
    }
  ],
  "reviews": [...],
  "addresses": [...],
  "consents": {
    "marketingConsent": true,
    "analyticsConsent": true,
    "consentDate": "2024-01-01T00:00:00Z"
  },
  "wishlist": [...],
  "carts": [...]
}
```

#### DELETE /users/me/account
Richiede eliminazione account (con grace period 30 giorni).

**Response:**
```json
{
  "success": true,
  "message": "Account schedulato per eliminazione. Hai 30 giorni per annullare.",
  "gracePeriodDays": 30,
  "scheduledDeletionDate": "2025-02-28T10:00:00Z"
}
```

**Errori:**
- `400` - Ordini pendenti presenti

#### DELETE /users/me/account/immediate
Elimina account immediatamente (soft delete + anonimizzazione PII).

**Response:**
```json
{
  "success": true,
  "message": "Account eliminato con successo. I tuoi dati sono stati anonimizzati."
}
```

---

### 2.3 Newsletter API (Admin)

**Base Path:** `/api/v1/admin/newsletters`
**Autenticazione:** JWT Required + Role ADMIN

#### POST /admin/newsletters
Crea una nuova newsletter.

**Request Body:**
```json
{
  "subject": "Nuova Collezione Primavera 2025",
  "content": "<html>...</html>",
  "previewText": "Scopri i nuovi arrivi...",
  "ctaText": "SCOPRI ORA",
  "ctaUrl": "https://meravien.com/nuovi-arrivi",
  "headerImage": "https://cdn.meravien.com/newsletter/header.jpg",
  "scheduledAt": "2025-02-01T10:00:00Z",
  "campaignName": "spring-2025",
  "targetAudience": {
    "allSubscribers": false,
    "vipOnly": true,
    "minOrders": 3
  },
  "discountCode": {
    "code": "SPRING15",
    "discountPercent": 15,
    "validUntil": "2025-03-01T23:59:59Z",
    "minPurchase": 50
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Newsletter creata",
  "newsletter": {
    "id": "uuid",
    "subject": "...",
    "status": "draft",
    ...
  }
}
```

#### GET /admin/newsletters
Lista tutte le newsletter.

**Query Parameters:**
- `status`: `draft` | `scheduled` | `sending` | `sent` | `cancelled`
- `search`: ricerca per subject
- `page`: numero pagina (default: 1)
- `limit`: elementi per pagina (default: 20)
- `sortBy`: campo ordinamento (default: `createdAt`)
- `sortOrder`: `ASC` | `DESC` (default: `DESC`)

**Response:**
```json
{
  "success": true,
  "newsletters": [...],
  "total": 50,
  "page": 1,
  "limit": 20
}
```

#### GET /admin/newsletters/stats
Statistiche globali newsletter.

**Response:**
```json
{
  "success": true,
  "stats": {
    "total": 50,
    "drafts": 5,
    "scheduled": 2,
    "sent": 43,
    "totalRecipients": 15000,
    "totalOpens": 8500,
    "totalClicks": 2100
  }
}
```

#### GET /admin/newsletters/:id
Dettaglio singola newsletter.

#### PATCH /admin/newsletters/:id
Aggiorna newsletter (solo se draft o scheduled).

#### DELETE /admin/newsletters/:id
Elimina newsletter (non se in sending).

#### POST /admin/newsletters/:id/send
Invia newsletter immediatamente.

**Response:**
```json
{
  "success": true,
  "message": "Newsletter inviata a 1500 destinatari",
  "newsletter": {
    "status": "sent",
    "sentAt": "2025-01-29T10:00:00Z",
    "recipientCount": 1500,
    "sentCount": 1498,
    "failedCount": 2
  }
}
```

#### POST /admin/newsletters/:id/schedule
Programma invio newsletter.

**Request Body:**
```json
{
  "scheduledAt": "2025-02-01T10:00:00Z"
}
```

#### POST /admin/newsletters/:id/cancel
Annulla invio programmato.

#### GET /admin/newsletters/:id/recipients-count
Conta destinatari in base ai filtri.

**Response:**
```json
{
  "success": true,
  "recipientsCount": 1500
}
```

---

## 3. Endpoint Modificati

### 3.1 Reviews Eligibility

**Endpoint:** `GET /api/v1/reviews/me/eligible-products`

**FIX APPLICATO:**
- Prima restituiva prodotti da ordini `confirmed` e `delivered`
- Ora restituisce SOLO prodotti da ordini `delivered`
- Aggiunto campo `productImage` nella response

**Nuova Response:**
```json
{
  "success": true,
  "eligibleProducts": [
    {
      "productId": "uuid",
      "productName": "Crema Viso Idratante",
      "productImage": "https://cdn.meravien.com/products/crema.jpg",
      "orderId": "uuid",
      "orderDate": "2025-01-15T10:00:00Z",
      "canReview": true,
      "reason": null
    },
    {
      "productId": "uuid2",
      "productName": "Siero Anti-Age",
      "productImage": "https://cdn.meravien.com/products/siero.jpg",
      "orderId": "uuid",
      "orderDate": "2025-01-15T10:00:00Z",
      "canReview": false,
      "reason": "Già recensito"
    }
  ]
}
```

**Note per FE:**
- Mostrare solo prodotti con `canReview: true` nel form recensione
- Usare `productImage` per thumbnail nella lista
- `orderDate` è ora `deliveredAt` (data consegna effettiva)

---

## 4. Event System (Email Triggers)

### Nuovo: Email "Ordine Consegnato" con CTA Recensione

**Trigger:** Evento `order.delivered`

**Quando viene emesso:**
- Quando l'ordine passa a stato `delivered` (via webhook BRT o manualmente)

**Template:** `order-delivered.html`

**Variabili template:**
```
{{orderNumber}} - Numero ordine
{{customerName}} - Nome cliente
{{reviewUrl}} - URL per lasciare recensione
```

**URL Recensione formato:**
```
https://meravien.com/account/reviews/new?orderId={orderId}&productId={firstProductId}
```

**Azione FE richiesta:**
- Creare pagina `/account/reviews/new` che accetta query params
- Pre-selezionare prodotto se `productId` presente
- Linkare all'ordine se `orderId` presente

---

## 5. Modelli Database Nuovi

### Newsletter Entity

```typescript
{
  id: string;                    // UUID
  subject: string;               // Oggetto email
  content: string;               // HTML content
  previewText?: string;          // Preheader
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';
  ctaText?: string;              // Testo pulsante
  ctaUrl?: string;               // URL pulsante
  headerImage?: string;          // Immagine header
  scheduledAt?: Date;            // Data invio programmato
  sentAt?: Date;                 // Data invio effettivo
  recipientCount: number;        // Totale destinatari
  sentCount: number;             // Email inviate con successo
  failedCount: number;           // Email fallite
  openCount: number;             // Aperture
  clickCount: number;            // Click
  targetAudience?: {             // Filtri targeting
    allSubscribers?: boolean;
    vipOnly?: boolean;
    minOrders?: number;
    minSpent?: number;
    registeredAfter?: Date;
    registeredBefore?: Date;
  };
  discountCode?: {               // Codice sconto associato
    code: string;
    discountPercent?: number;
    discountAmount?: number;
    validFrom?: Date;
    validUntil?: Date;
    minPurchase?: number;
  };
  campaignName?: string;         // Nome campagna tracking
  createdBy?: string;            // Admin ID
  createdAt: Date;
  updatedAt: Date;
}
```

### User Entity - Nuovi campi

```typescript
{
  // ... campi esistenti ...

  // GDPR: Soft delete
  deletedAt?: Date;              // Data soft delete (nullable)
}
```

---

## 6. Script di Seed

### Seed Utenti Admin/Test

**Comando:** `npm run seed:admin`

**Utenti creati:**

| Email | Password | Ruolo | Note |
|-------|----------|-------|------|
| admin@meravien.com | Admin123!@# | ADMIN | Admin principale |
| support@meravien.com | Support123!@# | ADMIN | Support team |
| test@meravien.com | Test123!@# | CUSTOMER | Test user |
| vip@meravien.com | Vip123!@# | CUSTOMER | VIP test |
| nuovo@meravien.com | Nuovo123!@# | CUSTOMER | Email non verificata |

**Note:**
- Password admin può essere override con env `ADMIN_DEFAULT_PASSWORD`
- Script skip utenti già esistenti
- Cambiare password admin dopo primo login!

---

## 7. Breaking Changes

### ⚠️ Review Eligibility

**Prima:**
```json
{
  "productId": "...",
  "productName": "...",
  "orderId": "...",
  "orderDate": "...",  // Era createdAt dell'ordine
  "canReview": true
}
```

**Dopo:**
```json
{
  "productId": "...",
  "productName": "...",
  "productImage": "...",  // ✅ NUOVO
  "orderId": "...",
  "orderDate": "...",     // Ora è deliveredAt
  "canReview": true,
  "reason": null          // ✅ Sempre presente (null se canReview=true)
}
```

**Azione FE:**
- Aggiornare interfaccia per usare `productImage`
- Considerare che `orderDate` ora riflette data consegna

---

## Checklist Integrazione FE

### Wishlist
- [ ] Implementare pagina `/account/wishlist`
- [ ] Aggiungere icona cuore su card prodotto
- [ ] Chiamare `POST /wishlists/toggle/:id` on click
- [ ] Mostrare badge count wishlist in header
- [ ] Gestire stato `isInWishlist` per styling

### GDPR
- [ ] Aggiungere sezione "I miei dati" in area personale
- [ ] Pulsante "Esporta i miei dati" → download JSON
- [ ] Pulsante "Elimina account" con conferma
- [ ] Mostrare grace period dopo richiesta eliminazione

### Newsletter (Admin Dashboard)
- [ ] Creare pagina lista newsletter
- [ ] Form creazione/modifica newsletter
- [ ] Editor WYSIWYG per content HTML
- [ ] Preview email prima dell'invio
- [ ] Dashboard statistiche (open rate, click rate)
- [ ] Scheduler per invio programmato

### Reviews
- [ ] Aggiornare lista prodotti eleggibili con immagine
- [ ] Creare pagina `/account/reviews/new` con query params
- [ ] Gestire deep link da email

---

## Contatti Supporto

Per domande tecniche sull'integrazione API:
- **Backend Team:** backend@meravien.com
- **Slack:** #meravien-api
