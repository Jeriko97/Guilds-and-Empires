import type { firestore } from "firebase-admin";

/** Schéma Firestore actif. Toute Cloud Function rejette un document dont la version diffère. */
export const CURRENT_SCHEMA_VERSION = 1;

// ─── Enums ────────────────────────────────────────────────────────────────────

export type FavorRank =
  | "local_supplier"
  | "approved_merchant"
  | "imperial_entrepreneur"
  | "guild_charter_eligible";

export type ContractTier = "standard" | "reinforced" | "priority";

export type ContractStatus = "active" | "completed" | "expired";

export type WorldEventStatus = "pending" | "active" | "decaying" | "completed";

export type RecipeId = "logs" | "planks" | "reconstruction_kits";

export type BuildingType = "sawmill";

// ─── Sous-structures ──────────────────────────────────────────────────────────

/** Quantité et cap d'une ressource dans l'inventaire du joueur. */
export interface ResourceStack {
  quantity: number;
  /**
   * Plafond appliqué côté serveur. Le yield de production est clampé à
   * (cap - quantity) : si l'inventaire est plein, le yield est 0 mais le
   * slot reste actif. Upgradable via upgradeInventoryCap (gold sink).
   */
  cap: number;
}

/** Inventaire complet dénormalisé dans le document joueur. */
export interface InventoryState {
  logs: ResourceStack;
  planks: ResourceStack;
  reconstructionKits: ResourceStack;
}

// ─── Document joueur — /players/{uid} ────────────────────────────────────────

export interface PlayerDocument {
  /** Doit être égal à CURRENT_SCHEMA_VERSION. Vérification obligatoire avant toute logique économique. */
  schemaVersion: number;
  displayName: string;
  createdAt: firestore.Timestamp;
  /** Mis à jour par resolveLoginState à chaque login. Toujours serverTimestamp(). */
  lastLoginAt: firestore.Timestamp;

  /** Toutes les mutations passent par Cloud Functions. allow write: if false côté client. */
  gold: number;

  /**
   * Cumulatif, ne décroît jamais. Détermine favorRank et l'accès aux tiers de contrats.
   * Signal principal de confiance avec l'Empire.
   */
  imperialFavor: number;

  /**
   * Dénormalisé pour un login en 1 read. Évite un aller-retour en subcollection.
   * À 10k DAU, économise ~60-90M reads/mois vs une subcollection séparée.
   */
  inventory: InventoryState;

  /**
   * Rang dénormalisé, dérivé de imperialFavor. Recalculé côté serveur à chaque gain
   * de faveur. Évite tout calcul de rang côté client.
   */
  favorRank: FavorRank;

  guildCharterUnlocked: boolean;

  /** null tant que le Guild Charter n'est pas acheté. */
  guildCharterPurchasedAt: firestore.Timestamp | null;

  /**
   * Passe à true lors de la première livraison réussie (deliverToContract).
   * Déclenche l'event scripté Imperial Reconstruction Initiative.
   */
  firstContractCompleted: boolean;
}

// ─── Document bâtiment — /players/{uid}/buildings/{buildingId} ───────────────

export interface ProductionSlotState {
  slotIndex: 0 | 1 | 2;

  /** null = slot inactif. */
  recipeId: RecipeId | null;

  /**
   * Posé une fois par startProductionSlot via serverTimestamp(). Jamais resetté.
   * Référence informative : depuis quand le slot tourne globalement.
   * Le calcul différé utilise lastProcessedAt (pas startedAt) pour éviter la duplication.
   */
  startedAt: firestore.Timestamp | null;

  /**
   * Timestamp du dernier calcul de production qui a effectivement consommé des cycles.
   * Sert de référence pour calculer le temps écoulé depuis la dernière collecte effective.
   *
   * Distinct de startedAt qui est informatif (depuis quand le slot tourne globalement).
   * lastProcessedAt est calculatoire (depuis quand du temps non consommé s'accumule).
   *
   * Mis à jour si completedCycles > 0, même si le yield est clampé à 0 par le cap
   * (Option B — production perdue à saturation est intentionnelle, pas récupérable).
   *
   * null = slot inactif (recipeId === null) ou premier calcul avant migration.
   * Fallback : resolveLoginState utilise startedAt si lastProcessedAt est null.
   */
  lastProcessedAt: firestore.Timestamp | null;
}

export interface BuildingDocument {
  buildingType: BuildingType;
  /** Réservé pour les upgrades de bâtiments Phase 2. Toujours 1 en Phase 1. */
  level: number;
  slots: ProductionSlotState[];
}

// ─── Document contrat — /players/{uid}/contracts/{contractId} ────────────────

export interface ContractDocument {
  /** Référence le template dans /global/contractPool/{contractTemplateId}. */
  contractTemplateId: string;
  tier: ContractTier;
  resourceType: RecipeId;
  quantityRequired: number;
  quantityDelivered: number;

  /** Lu depuis le template au moment de l'acceptation. Jamais fourni par le client. */
  rewardGold: number;
  /** Lu depuis le template au moment de l'acceptation. Jamais fourni par le client. */
  rewardFavor: number;

  status: ContractStatus;
  acceptedAt: firestore.Timestamp;

  /** null pour les contrats Standard (pas d'expiration). Timestamp pour les contrats Priority. */
  expiresAt: firestore.Timestamp | null;

  /** null tant que le contrat n'est pas livré. */
  completedAt: firestore.Timestamp | null;

  /**
   * UUID généré côté client au moment de la livraison, stocké ici pour prévenir
   * le double-spend. deliverToContract est idempotent : même clé → résultat déjà
   * stocké retourné immédiatement, sans retraitement.
   */
  idempotencyKey: string;
}

// ─── Document marché global — /global/marketState ────────────────────────────

export interface ResourcePrice {
  currentPrice: number;
  /** Référence utilisée par updateMarketPrices pour calculer le drift vers l'équilibre. */
  basePrice: number;
  trend: "rising" | "stable" | "falling";
}

export interface MarketStateDocument {
  schemaVersion: number;
  /** Mis à jour par la fonction schedulée updateMarketPrices. Toujours serverTimestamp(). */
  lastUpdatedAt: firestore.Timestamp;
  prices: {
    logs: ResourcePrice;
    planks: ResourcePrice;
  };
  /**
   * 3 derniers prix par ressource, FIFO. Précalculés par le serveur pour que le ticker
   * Unity puisse afficher les flèches directionnelles sans émettre plusieurs reads.
   */
  priceHistory: {
    logs: number[];
    planks: number[];
  };
}

// ─── Document world event — /global/activeWorldEvents/{eventId} ──────────────

export type WorldEventType =
  | "imperial_reconstruction_initiative";
  // D'autres types seront ajoutés explicitement quand de nouveaux events seront
  // introduits (Phase 2+). Acte explicite requis — pas de string arbitraire acceptée.

export interface WorldEventDocument {
  eventId: string;
  eventType: WorldEventType;
  status: WorldEventStatus;
  startedAt: firestore.Timestamp | null;
  /** startedAt + 4 heures. null jusqu'à la transition vers 'active'. */
  endsAt: firestore.Timestamp | null;
  /** endsAt + 1 heure (fenêtre de decay progressive). null jusqu'à la fin de l'event. */
  decayEndsAt: firestore.Timestamp | null;
  /** Multiplicateurs appliqués aux prix du marché pendant l'event. */
  priceMultipliers: {
    logs: number;
    planks: number;
  };
  priorityContractSlots: {
    total: number;
    /** Incrémenté côté serveur à chaque acceptContract sur un contrat Priority. */
    claimed: number;
  };
  /**
   * 'first_contract_completed' — event scripté, déclenché une seule fois par lifecycle.
   * 'manual'                   — déclenché manuellement via Admin SDK (LiveOps).
   * null                       — pas de condition de déclenchement (déjà actif).
   */
  triggerCondition: "first_contract_completed" | "manual" | null;
  /** Empêche le double-déclenchement si plusieurs Functions vérifient la condition en parallèle. */
  triggerProcessed: boolean;
}

// ─── Document contract pool — /global/contractPool/{contractId} ──────────────

export interface ContractPoolDocument {
  tier: ContractTier;
  resourceType: RecipeId;
  quantityRequired: number;
  rewardGold: number;
  rewardFavor: number;
  /** null pour les contrats permanents. Renseigné pour les contrats liés à un event. */
  associatedEventId: string | null;
  isActive: boolean;
  validFrom: firestore.Timestamp;
  /** null pour les contrats permanents sans expiration. */
  validUntil: firestore.Timestamp | null;
}

// ─── Type de retour des Cloud Functions ──────────────────────────────────────

/**
 * Snapshot complet retourné par resolveLoginState (et les autres fonctions
 * qui mutent le state). Donne au client Unity l'état mis à jour en un seul
 * aller-retour — évite un second read Firestore après l'appel.
 */
export interface PlayerStateSnapshot {
  player: PlayerDocument;
  /** Tous les bâtiments du joueur avec l'état courant de leurs slots. */
  buildings: BuildingDocument[];
  /**
   * Contrats avec status 'active' uniquement. Les contrats completed/expired
   * sont exclus pour garder le payload minimal.
   */
  activeContracts: ContractDocument[];
}
