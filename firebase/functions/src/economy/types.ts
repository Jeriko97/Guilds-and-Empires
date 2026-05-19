// Types partagés entre toutes les Cloud Functions économiques.

export interface PlayerProfile {
  displayName: string;
  level: number;
  gold: number;
  schemaVersion: number;
  lastClaimedDailyBonusAt?: FirebaseFirestore.Timestamp | null;
}

export interface TransactionLog {
  uid: string;
  action: string;
  result: Record<string, unknown>;
  processedAt: FirebaseFirestore.Timestamp;
}

export interface ClaimDailyBonusRequest {
  nonce: string;
}

export interface ClaimDailyBonusResult {
  goldDelta: number;
  newGold: number;
}
