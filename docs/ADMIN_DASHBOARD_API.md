# Dashboard Admin - API Reference

## Endpoint Principale

```
GET /api/v1/admin/dashboard/stats
```

**Header richiesto:** `Authorization: Bearer <JWT_TOKEN>`

---

## Query Parameters

| Param | Tipo | Default | Descrizione |
|-------|------|---------|-------------|
| `period` | `all` \| `daily` \| `monthly` | `all` | Periodo filtro |
| `startDate` | `YYYY-MM-DD` | - | Data inizio (opzionale) |
| `endDate` | `YYYY-MM-DD` | - | Data fine (opzionale) |

### Esempi Chiamata

```bash
# Vista GLOBALE (tutti gli ordini, nessun filtro temporale)
GET /api/v1/admin/dashboard/stats?period=all

# Vista giornaliera (oggi)
GET /api/v1/admin/dashboard/stats?period=daily

# Vista giornaliera data specifica
GET /api/v1/admin/dashboard/stats?period=daily&startDate=2026-01-25

# Vista mensile
GET /api/v1/admin/dashboard/stats?period=monthly
```

---

## Response

```typescript
{
  "period": "all",
  "dateRange": null,  // presente solo se filtrato

  "orders": {
    "total": 5,           // Totale ordini nel sistema
    "pending": 0,         // In attesa pagamento
    "confirmed": 1,       // Confermati (pronti per elaborazione)
    "processing": 0,      // In elaborazione automatica
    "readyToShip": 2,     // Etichetta BRT creata
    "shipped": 1,         // Ritirati dal corriere
    "inTransit": 1,       // In consegna
    "delivered": 0,       // Consegnati
    "cancelled": 0,       // Cancellati
    "todayCount": 1       // Ordini creati OGGI (sempre calcolato)
  },

  "shipments": {
    "readyToShip": 2,     // Ordini con etichetta pronta
    "awaitingPickup": 7,  // In attesa ritiro corriere
    "inTransit": 1,       // Spedizioni in transito
    "delivered": 0,       // Spedizioni consegnate
    "withIssues": 0,      // Spedizioni con problemi
    "todayCreated": 3     // Spedizioni create OGGI
  },

  "revenue": {
    "total": 0.00,           // Revenue totale (solo DELIVERED)
    "today": 0.00,           // Revenue oggi
    "thisWeek": 0.00,        // Revenue settimana
    "thisMonth": 0.00,       // Revenue mese
    "averageOrderValue": 0   // Valore medio ordine
  },

  "actionRequired": {
    "ordersNeedingShipment": 0,   // Ordini senza spedizione
    "ordersNearAutoConfirm": 0,   // Ordini vicini a scadenza modifica
    "shipmentsWithIssues": 0,     // Spedizioni con problemi
    "lowStockProducts": 0         // Prodotti stock basso
  },

  "currentShippingDate": "2026-01-27"  // Data spedizione corrente
}
```

---

## Mapping Card Dashboard

| Card nella Dashboard | Campo API |
|---------------------|-----------|
| **Ordini da Elaborare** | `orders.confirmed` |
| **In Attesa di Ritiro** | `shipments.awaitingPickup` |
| **Revenue Oggi** | `revenue.today` |
| **Totale Mese** | `revenue.thisMonth` |
| **Totale Ordini** | `orders.total` |
| **Ordini di Oggi** | `orders.todayCount` |
| **Spedizioni Create Oggi** | `shipments.todayCreated` |
| **Revenue Totale** | `revenue.total` |
| **Ritirati / In Transito** | `shipments.inTransit` |

---

## Note Importanti

1. **Revenue = 0**: La revenue conta SOLO ordini `DELIVERED`. Se nessun ordine e' stato consegnato, revenue = 0.

2. **Vista Globale**: Usa `period=all` per vedere TUTTI gli ordini senza filtri data.

3. **"In Attesa di Ritiro"**: Sono spedizioni BRT create ma non ancora ritirate dal corriere.

---

## Rate Limiting

| Ambiente | Limite |
|----------|--------|
| Produzione | 500 req / 15 min |
| Development | 1000 req / 15 min |

### Raccomandazioni FE

```typescript
// Refresh automatico: MAX ogni 60 secondi
const REFRESH_INTERVAL = 60000;

// Debounce su pulsante "Aggiorna"
const handleRefresh = debounce(fetchDashboard, 1000);
```

**NON fare:**
- Polling ogni 5-10 secondi
- Chiamate multiple in parallelo
- Refresh ad ogni cambio tab
