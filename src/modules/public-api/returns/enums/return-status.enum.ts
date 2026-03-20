export enum ReturnStatus {
  // 1. Cliente fa richiesta + carica foto
  REQUESTED = 'requested',

  // 2. Admin richiede info aggiuntive (foto poco chiare)
  PENDING_INFO = 'pending_info',

  // 3a. Admin rifiuta pre-valutazione (foto mostrano prodotto aperto per ripensamento)
  REJECTED_PRE_INSPECTION = 'rejected_pre_inspection',

  // 3b. Admin approva per spedizione
  APPROVED_FOR_RETURN = 'approved_for_return',

  // 4. Cliente ha spedito il pacco
  IN_TRANSIT = 'in_transit',

  // 5. Pacco arrivato in magazzino
  RECEIVED = 'received',

  // 6. Admin sta controllando fisicamente
  INSPECTING = 'inspecting',

  // 7a. Tutto ok, si rimborsa
  APPROVED = 'approved',

  // 7b. Rifiutato dopo controllo fisico (sigillo rotto nonostante foto ok)
  REJECTED = 'rejected',

  // 7c. Solo alcuni prodotti approvati
  PARTIALLY_APPROVED = 'partially_approved',

  // 8. Rimborso effettuato
  REFUNDED = 'refunded',

  // 9. Rimborso parziale effettuato
  PARTIALLY_REFUNDED = 'partially_refunded',

  // 10. Annullato (cliente o admin)
  CANCELLED = 'cancelled',
}

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  [ReturnStatus.REQUESTED]: 'Richiesta Ricevuta',
  [ReturnStatus.PENDING_INFO]: 'In Attesa di Informazioni',
  [ReturnStatus.REJECTED_PRE_INSPECTION]: 'Rifiutato (Pre-Controllo)',
  [ReturnStatus.APPROVED_FOR_RETURN]: 'Approvato - Spedisci Prodotto',
  [ReturnStatus.IN_TRANSIT]: 'In Transito',
  [ReturnStatus.RECEIVED]: 'Ricevuto in Magazzino',
  [ReturnStatus.INSPECTING]: 'In Controllo Qualità',
  [ReturnStatus.APPROVED]: 'Approvato',
  [ReturnStatus.REJECTED]: 'Rifiutato',
  [ReturnStatus.PARTIALLY_APPROVED]: 'Parzialmente Approvato',
  [ReturnStatus.REFUNDED]: 'Rimborsato',
  [ReturnStatus.PARTIALLY_REFUNDED]: 'Rimborsato Parzialmente',
  [ReturnStatus.CANCELLED]: 'Annullato',
};

export const RETURN_STATUS_DESCRIPTIONS: Record<ReturnStatus, string> = {
  [ReturnStatus.REQUESTED]: 'La tua richiesta di reso è stata ricevuta e verrà esaminata a breve.',
  [ReturnStatus.PENDING_INFO]: 'Abbiamo bisogno di ulteriori informazioni o foto più chiare.',
  [ReturnStatus.REJECTED_PRE_INSPECTION]: 'La richiesta è stata rifiutata in base alle foto inviate.',
  [ReturnStatus.APPROVED_FOR_RETURN]: 'Reso approvato! Riceverai le istruzioni di spedizione via email.',
  [ReturnStatus.IN_TRANSIT]: 'Il pacco è in viaggio verso il nostro magazzino.',
  [ReturnStatus.RECEIVED]: 'Il pacco è arrivato e sarà controllato a breve.',
  [ReturnStatus.INSPECTING]: 'Stiamo verificando lo stato del prodotto.',
  [ReturnStatus.APPROVED]: 'Reso approvato! Procederemo con il rimborso.',
  [ReturnStatus.REJECTED]: 'Il reso è stato rifiutato dopo il controllo qualità.',
  [ReturnStatus.PARTIALLY_APPROVED]: 'Alcuni prodotti sono stati approvati, altri rifiutati.',
  [ReturnStatus.REFUNDED]: 'Rimborso completato! Riceverai l\'importo entro 5-10 giorni lavorativi.',
  [ReturnStatus.PARTIALLY_REFUNDED]: 'Rimborso parziale completato per i prodotti approvati.',
  [ReturnStatus.CANCELLED]: 'La richiesta di reso è stata annullata.',
};

// Stati che permettono al cliente di annullare
export const CANCELLABLE_STATUSES = [
  ReturnStatus.REQUESTED,
  ReturnStatus.PENDING_INFO,
  ReturnStatus.APPROVED_FOR_RETURN,
];

// Stati che richiedono azione admin
export const ADMIN_ACTION_REQUIRED = [
  ReturnStatus.REQUESTED,
  ReturnStatus.RECEIVED,
  ReturnStatus.INSPECTING,
];

// Stati finali (non modificabili)
export const FINAL_STATUSES = [
  ReturnStatus.REFUNDED,
  ReturnStatus.PARTIALLY_REFUNDED,
  ReturnStatus.REJECTED,
  ReturnStatus.REJECTED_PRE_INSPECTION,
  ReturnStatus.CANCELLED,
];