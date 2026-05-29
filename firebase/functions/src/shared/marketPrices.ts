export const MARKET_PRICE_DRIFT_FACTOR    = 0.1;
export const MARKET_PRICE_NOISE_AMPLITUDE = 0.05;

export const MARKET_PRICE_BOUNDS = {
  logs:               { basePrice: 5,  min: 3,  max: 9  },
  planks:             { basePrice: 12, min: 8,  max: 22 },
  reconstructionKits: { basePrice: 20, min: 20, max: 20 },
} as const;

export type MarketResource = keyof typeof MARKET_PRICE_BOUNDS;
