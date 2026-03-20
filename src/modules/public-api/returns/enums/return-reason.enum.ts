export enum ReturnReason {
  // Cliente ha cambiato idea
  CHANGED_MIND = 'changed_mind',

  // Prodotto difettoso/danneggiato
  DEFECTIVE = 'defective',

  // Prodotto non conforme a descrizione
  NOT_AS_DESCRIBED = 'not_as_described',

  // Prodotto sbagliato ricevuto
  WRONG_ITEM = 'wrong_item',

  // Prodotto danneggiato durante spedizione
  DAMAGED_IN_TRANSIT = 'damaged_in_transit',

  // Altro motivo
  OTHER = 'other',
}

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  [ReturnReason.CHANGED_MIND]: 'Ho cambiato idea',
  [ReturnReason.DEFECTIVE]: 'Prodotto difettoso',
  [ReturnReason.NOT_AS_DESCRIBED]: 'Non conforme alla descrizione',
  [ReturnReason.WRONG_ITEM]: 'Prodotto sbagliato',
  [ReturnReason.DAMAGED_IN_TRANSIT]: 'Danneggiato durante la spedizione',
  [ReturnReason.OTHER]: 'Altro',
};

// Motivi che richiedono verifica sigillo intatto
export const REQUIRES_SEALED_PRODUCT = [ReturnReason.CHANGED_MIND];

// Motivi che accettano prodotto aperto
export const ACCEPTS_OPENED_PRODUCT = [
  ReturnReason.DEFECTIVE,
  ReturnReason.NOT_AS_DESCRIBED,
  ReturnReason.WRONG_ITEM,
  ReturnReason.DAMAGED_IN_TRANSIT,
];

// Motivi che rimborsano automaticamente spese spedizione reso
export const REFUNDS_RETURN_SHIPPING = [
  ReturnReason.DEFECTIVE,
  ReturnReason.WRONG_ITEM,
  ReturnReason.DAMAGED_IN_TRANSIT,
];