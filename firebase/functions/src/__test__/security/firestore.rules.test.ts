/**
 * Tests de Security Rules Firestore — Phase 1
 *
 * IMPORTANT : ce fichier utilise @firebase/rules-unit-testing (compat API).
 * Les contextes testEnv.authenticatedContext / unauthenticatedContext respectent
 * les Security Rules, à l'OPPOSÉ des tests handler qui passent en Admin SDK
 * (bypass total des rules). Ne JAMAIS mélanger les deux approches dans un même fichier.
 *
 * Exception délibérée à Convention #3 (Pas de afterAll) :
 * testEnv.cleanup() est l'API officielle de @firebase/rules-unit-testing.
 * Le --forceExit du script test:emulator reste le filet de sécurité.
 */

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import * as path from "path";

const OWNER_UID = "rules-test-owner";
const OTHER_UID = "rules-test-other";

const RULES = readFileSync(
  path.resolve(__dirname, "../../../../../firestore.rules"),
  "utf8"
);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-guilds-empires",
    firestore: {
      rules: RULES,
      host: "127.0.0.1",
      port: 8080,
    },
  });

  await testEnv.clearFirestore();

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.collection("players").doc(OWNER_UID).set({ gold: 100, schemaVersion: 1 });
    await db.collection("players").doc(OWNER_UID).collection("buildings").doc("b1").set({ buildingType: "sawmill" });
    await db.collection("players").doc(OWNER_UID).collection("contracts").doc("c1").set({ status: "active" });
    await db.collection("players").doc(OWNER_UID).collection("marketTrades").doc("t1").set({ uid: OWNER_UID });
    await db.collection("players").doc(OWNER_UID).collection("inventoryUpgrades").doc("u1").set({ uid: OWNER_UID });
    await db.collection("players").doc(OWNER_UID).collection("guildPurchases").doc("g1").set({ uid: OWNER_UID });
    await db.collection("marketState").doc("state").set({ prices: {} });
    await db.collection("activeWorldEvents").doc("event1").set({ eventType: "test" });
    await db.collection("contractPool").doc("pool1").set({ tier: 1 });
    await db.collection("randomCollection").doc("doc1").set({ foo: "bar" });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

// ─── A. players/{uid} — quadruplet complet ────────────────────────────────────

test("1. players/{uid} : OWNER lit son doc → assertSucceeds", async () => {
  const db = testEnv.authenticatedContext(OWNER_UID).firestore();
  await assertSucceeds(db.collection("players").doc(OWNER_UID).get());
});

test("2. players/{uid} : OTHER lit le doc de OWNER → assertFails", async () => {
  const db = testEnv.authenticatedContext(OTHER_UID).firestore();
  await assertFails(db.collection("players").doc(OWNER_UID).get());
});

test("3. players/{uid} : unauth lit le doc de OWNER → assertFails", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection("players").doc(OWNER_UID).get());
});

test("4. players/{uid} : OWNER tente d'écrire → assertFails", async () => {
  const db = testEnv.authenticatedContext(OWNER_UID).firestore();
  await assertFails(db.collection("players").doc(OWNER_UID).set({ gold: 999 }));
});

// ─── B. players/{uid}/marketTrades — quadruplet complet ───────────────────────

test("5. marketTrades : OWNER lit sa trace → assertSucceeds", async () => {
  const db = testEnv.authenticatedContext(OWNER_UID).firestore();
  await assertSucceeds(
    db.collection("players").doc(OWNER_UID).collection("marketTrades").doc("t1").get()
  );
});

test("6. marketTrades : OTHER lit la trace de OWNER → assertFails", async () => {
  const db = testEnv.authenticatedContext(OTHER_UID).firestore();
  await assertFails(
    db.collection("players").doc(OWNER_UID).collection("marketTrades").doc("t1").get()
  );
});

test("7. marketTrades : unauth lit → assertFails", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(
    db.collection("players").doc(OWNER_UID).collection("marketTrades").doc("t1").get()
  );
});

test("8. marketTrades : OWNER tente d'écrire → assertFails", async () => {
  const db = testEnv.authenticatedContext(OWNER_UID).firestore();
  await assertFails(
    db.collection("players").doc(OWNER_UID).collection("marketTrades").doc("t2").set({ uid: OWNER_UID })
  );
});

// ─── C. Autres subcollections player — assertions allégées ────────────────────
// get() document uniquement. La dimension query est couverte en section F.

test("9. buildings : OWNER read / OTHER read / client write", async () => {
  const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
  const otherDb = testEnv.authenticatedContext(OTHER_UID).firestore();
  await assertSucceeds(ownerDb.collection("players").doc(OWNER_UID).collection("buildings").doc("b1").get());
  await assertFails(otherDb.collection("players").doc(OWNER_UID).collection("buildings").doc("b1").get());
  await assertFails(ownerDb.collection("players").doc(OWNER_UID).collection("buildings").doc("b1").set({ x: 1 }));
});

test("10. contracts : OWNER read / OTHER read / client write", async () => {
  const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
  const otherDb = testEnv.authenticatedContext(OTHER_UID).firestore();
  await assertSucceeds(ownerDb.collection("players").doc(OWNER_UID).collection("contracts").doc("c1").get());
  await assertFails(otherDb.collection("players").doc(OWNER_UID).collection("contracts").doc("c1").get());
  await assertFails(ownerDb.collection("players").doc(OWNER_UID).collection("contracts").doc("c1").set({ x: 1 }));
});

test("11. inventoryUpgrades : OWNER read / OTHER read / client write", async () => {
  const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
  const otherDb = testEnv.authenticatedContext(OTHER_UID).firestore();
  await assertSucceeds(ownerDb.collection("players").doc(OWNER_UID).collection("inventoryUpgrades").doc("u1").get());
  await assertFails(otherDb.collection("players").doc(OWNER_UID).collection("inventoryUpgrades").doc("u1").get());
  await assertFails(ownerDb.collection("players").doc(OWNER_UID).collection("inventoryUpgrades").doc("u1").set({ x: 1 }));
});

test("12. guildPurchases : OWNER read / OTHER read / client write", async () => {
  const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
  const otherDb = testEnv.authenticatedContext(OTHER_UID).firestore();
  await assertSucceeds(ownerDb.collection("players").doc(OWNER_UID).collection("guildPurchases").doc("g1").get());
  await assertFails(otherDb.collection("players").doc(OWNER_UID).collection("guildPurchases").doc("g1").get());
  await assertFails(ownerDb.collection("players").doc(OWNER_UID).collection("guildPurchases").doc("g1").set({ x: 1 }));
});

// ─── D. Collections globales — read authentifié, write refusé ─────────────────

test("13. marketState : auth read / unauth read / client write", async () => {
  const authDb   = testEnv.authenticatedContext(OWNER_UID).firestore();
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(authDb.collection("marketState").doc("state").get());
  await assertFails(unauthDb.collection("marketState").doc("state").get());
  await assertFails(authDb.collection("marketState").doc("state").set({ prices: {} }));
});

test("14. activeWorldEvents : auth read / unauth read / client write", async () => {
  const authDb   = testEnv.authenticatedContext(OWNER_UID).firestore();
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(authDb.collection("activeWorldEvents").doc("event1").get());
  await assertFails(unauthDb.collection("activeWorldEvents").doc("event1").get());
  await assertFails(authDb.collection("activeWorldEvents").doc("event1").set({ eventType: "x" }));
});

test("15. contractPool : auth read / unauth read / client write", async () => {
  const authDb   = testEnv.authenticatedContext(OWNER_UID).firestore();
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(authDb.collection("contractPool").doc("pool1").get());
  await assertFails(unauthDb.collection("contractPool").doc("pool1").get());
  await assertFails(authDb.collection("contractPool").doc("pool1").set({ tier: 2 }));
});

// ─── E. Deny-all ──────────────────────────────────────────────────────────────

test("16. Collection arbitraire non couverte → deny-all", async () => {
  const authDb   = testEnv.authenticatedContext(OWNER_UID).firestore();
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(authDb.collection("randomCollection").doc("doc1").get());
  await assertFails(unauthDb.collection("randomCollection").doc("doc1").get());
  await assertFails(authDb.collection("randomCollection").doc("doc2").set({ foo: "x" }));
});

// ─── F. Tests de QUERY (collection.get()) ─────────────────────────────────────
// Firestore évalue les rules différemment pour une query que pour un get() de
// document. Unity fait des queries (listes). Chemins nominatifs explicites.

test("17. OWNER query marketTrades → assertSucceeds", async () => {
  const db = testEnv.authenticatedContext(OWNER_UID).firestore();
  await assertSucceeds(
    db.collection("players").doc(OWNER_UID).collection("marketTrades").get()
  );
});

test("18. OTHER query marketTrades de OWNER → assertFails", async () => {
  const db = testEnv.authenticatedContext(OTHER_UID).firestore();
  await assertFails(
    db.collection("players").doc(OWNER_UID).collection("marketTrades").get()
  );
});

test("19. OWNER query buildings → assertSucceeds", async () => {
  const db = testEnv.authenticatedContext(OWNER_UID).firestore();
  await assertSucceeds(
    db.collection("players").doc(OWNER_UID).collection("buildings").get()
  );
});

test("20. OWNER query contracts → assertSucceeds", async () => {
  const db = testEnv.authenticatedContext(OWNER_UID).firestore();
  await assertSucceeds(
    db.collection("players").doc(OWNER_UID).collection("contracts").get()
  );
});

test("21. OWNER query inventoryUpgrades → assertSucceeds", async () => {
  const db = testEnv.authenticatedContext(OWNER_UID).firestore();
  await assertSucceeds(
    db.collection("players").doc(OWNER_UID).collection("inventoryUpgrades").get()
  );
});

test("22. OWNER query guildPurchases → assertSucceeds", async () => {
  const db = testEnv.authenticatedContext(OWNER_UID).firestore();
  await assertSucceeds(
    db.collection("players").doc(OWNER_UID).collection("guildPurchases").get()
  );
});
