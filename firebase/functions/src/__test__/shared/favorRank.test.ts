import { computeFavorRank } from "../../shared/favorRank";

describe("computeFavorRank", () => {

  it("1. favor=0 → local_supplier", () => {
    expect(computeFavorRank(0)).toBe("local_supplier");
  });

  it("2. favor=49 → local_supplier (borne inférieure du seuil suivant)", () => {
    expect(computeFavorRank(49)).toBe("local_supplier");
  });

  it("3. favor=50 → approved_merchant (seuil exact)", () => {
    expect(computeFavorRank(50)).toBe("approved_merchant");
  });

  it("4. favor=199 → approved_merchant", () => {
    expect(computeFavorRank(199)).toBe("approved_merchant");
  });

  it("5. favor=200 → imperial_entrepreneur (seuil exact)", () => {
    expect(computeFavorRank(200)).toBe("imperial_entrepreneur");
  });

  it("6. favor=349 → imperial_entrepreneur", () => {
    expect(computeFavorRank(349)).toBe("imperial_entrepreneur");
  });

  it("7. favor=350 → guild_charter_eligible (seuil exact)", () => {
    expect(computeFavorRank(350)).toBe("guild_charter_eligible");
  });

  it("8. favor=9999 → guild_charter_eligible (montant arbitraire)", () => {
    expect(computeFavorRank(9999)).toBe("guild_charter_eligible");
  });

});
