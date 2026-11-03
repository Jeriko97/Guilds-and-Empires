import * as admin from "firebase-admin";

import type { BuildingDocument, InventoryState, PlayerDocument, ProductionSlotState } from "../shared/types";

// ── CLI : npm run emulator:testdata -- --project <demo-id> <commande> [options] ──────────────────
// (= npm run build && node lib/dev/runEmulatorTestData.js ...). ÉTAPE 19.4a, D-ETAPE19-011.
// Outil de développement : écrit dans l'ÉMULATEUR Firestore seulement. Aucune option ne vise la production :
// FIRESTORE_EMULATOR_HOST local et projet demo-* obligatoires. Jamais exporté par index.ts (inerte dans lib/).
// Commandes :
//   set-inventory   [--uid U] [--logs N] [--planks N] [--kits N]   quantités, plafonds inchangés
//   start-logs-slot [--uid U] [--building B] --slot S               slot libre → logs actif depuis maintenant
//   rewind-slot     [--uid U] [--building B] --slot S --minutes M   recule startedAt (et lastProcessedAt posé)
//   corrupt-slot    [--uid U] [--building B] --slot S               slot occupé sans startedAt (D-ETAPE19-006)
// --uid facultatif s'il n'existe qu'un seul joueur ; --building : sawmill_0 par défaut.

type ResourceKey = keyof InventoryState;
type SlotIndex = 0 | 1 | 2;

export type TestDataCommand =
  | { kind: "set-inventory"; quantities: Partial<Record<ResourceKey, number>> }
  | { kind: "start-logs-slot"; slotIndex: SlotIndex }
  | { kind: "rewind-slot"; slotIndex: SlotIndex; minutes: number }
  | { kind: "corrupt-slot"; slotIndex: SlotIndex };

export type TestDataPlan = {
  project:    string;
  uid:        string | null;
  buildingId: string;
  command:    TestDataCommand;
};

export type TestDataPlanResult = { ok: true; plan: TestDataPlan } | { ok: false; error: string };

const DEFAULT_BUILDING_ID = "sawmill_0";
const LOCAL_EMULATOR_HOSTS = ["127.0.0.1", "localhost", "[::1]"];

/** Options propres à chaque commande ; --project et --uid sont communes. */
const COMMAND_OPTIONS: Record<TestDataCommand["kind"], readonly string[]> = {
  "set-inventory":   ["--logs", "--planks", "--kits"],
  "start-logs-slot": ["--building", "--slot"],
  "rewind-slot":     ["--building", "--slot", "--minutes"],
  "corrupt-slot":    ["--building", "--slot"],
};

const INVENTORY_OPTIONS: Record<string, ResourceKey> = {
  "--logs":   "logs",
  "--planks": "planks",
  "--kits":   "reconstructionKits",
};

function parseNonNegativeInteger(raw: string): number | null {
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

/** Hôte de FIRESTORE_EMULATOR_HOST (« hôte:port », IPv6 entre crochets). */
function emulatorHostName(value: string): string {
  const colon = value.lastIndexOf(":");
  return colon > 0 ? value.slice(0, colon) : value;
}

/** Garde-fous et lecture des arguments — pur, testé sans émulateur. */
export function parseTestDataArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): TestDataPlanResult {
  // Garde anti-production : émulateur local obligatoire.
  const emulatorHost = env["FIRESTORE_EMULATOR_HOST"];
  if (!emulatorHost) {
    return { ok: false, error: "FIRESTORE_EMULATOR_HOST absent : cet outil n'écrit que dans l'émulateur." };
  }
  if (!LOCAL_EMULATOR_HOSTS.includes(emulatorHostName(emulatorHost))) {
    return {
      ok: false,
      error: `FIRESTORE_EMULATOR_HOST='${emulatorHost}' n'est pas local (${LOCAL_EMULATOR_HOSTS.join(", ")}).`,
    };
  }

  const options = new Map<string, string>();
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      return { ok: false, error: `${token} attend une valeur.` };
    }
    if (options.has(token)) {
      return { ok: false, error: `${token} est donné deux fois.` };
    }
    options.set(token, value);
    i++;
  }

  // Projet demo-* seulement : les émulateurs du client tournent sous demo-guilds-empires (D-ETAPE19-011).
  const project = options.get("--project");
  if (!project) {
    return { ok: false, error: "--project <demo-id> est obligatoire." };
  }
  if (!project.startsWith("demo-")) {
    return { ok: false, error: `Projet '${project}' refusé : projet demo-* seulement.` };
  }
  // Même règle que seed:market : une variable d'environnement contradictoire signale une confusion de cible.
  for (const name of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) {
    const value = env[name];
    if (value && value !== project) {
      return { ok: false, error: `${name}='${value}' contredit --project '${project}'.` };
    }
  }

  if (positionals.length !== 1) {
    return { ok: false, error: `Une commande attendue (${Object.keys(COMMAND_OPTIONS).join(", ")}).` };
  }
  const kind = positionals[0] as TestDataCommand["kind"];
  // Propriété propre seulement : « constructor » ou « __proto__ » ne sont pas des commandes.
  const allowed = Object.prototype.hasOwnProperty.call(COMMAND_OPTIONS, kind) ? COMMAND_OPTIONS[kind] : undefined;
  if (allowed === undefined) {
    return { ok: false, error: `Commande inconnue '${positionals[0]}'.` };
  }
  for (const name of options.keys()) {
    if (name !== "--project" && name !== "--uid" && !allowed.includes(name)) {
      return { ok: false, error: `Option ${name} inconnue pour '${kind}'.` };
    }
  }

  const uid        = options.get("--uid") ?? null;
  const buildingId = options.get("--building") ?? DEFAULT_BUILDING_ID;

  if (kind === "set-inventory") {
    const quantities: Partial<Record<ResourceKey, number>> = {};
    for (const [option, key] of Object.entries(INVENTORY_OPTIONS)) {
      const raw = options.get(option);
      if (raw === undefined) continue;
      const quantity = parseNonNegativeInteger(raw);
      if (quantity === null) {
        return { ok: false, error: `${option} doit être un entier ≥ 0 (reçu '${raw}').` };
      }
      quantities[key] = quantity;
    }
    if (Object.keys(quantities).length === 0) {
      return { ok: false, error: "set-inventory : au moins une option parmi --logs, --planks, --kits." };
    }
    return { ok: true, plan: { project, uid, buildingId, command: { kind, quantities } } };
  }

  const rawSlot = options.get("--slot");
  const slot = rawSlot === undefined ? null : parseNonNegativeInteger(rawSlot);
  if (slot === null || slot > 2) {
    return { ok: false, error: "--slot doit valoir 0, 1 ou 2." };
  }
  const slotIndex = slot as SlotIndex;

  if (kind === "rewind-slot") {
    const rawMinutes = options.get("--minutes");
    const minutes = rawMinutes === undefined ? null : parseNonNegativeInteger(rawMinutes);
    if (minutes === null || minutes < 1) {
      return { ok: false, error: "--minutes doit être un entier ≥ 1." };
    }
    return { ok: true, plan: { project, uid, buildingId, command: { kind, slotIndex, minutes } } };
  }

  return { ok: true, plan: { project, uid, buildingId, command: { kind, slotIndex } } };
}

// ── Exécution (émulateur) ─────────────────────────────────────────────────────

/** Joueur visé : --uid, ou le seul joueur de l'émulateur. */
export async function resolveTargetUid(db: admin.firestore.Firestore, uid: string | null): Promise<string> {
  if (uid !== null) return uid;
  const players = await db.collection("players").select().get();
  if (players.size === 1) return players.docs[0].id;
  throw new Error(
    players.size === 0
      ? "aucun joueur dans l'émulateur : lancer d'abord le jeu en mode émulateur (connexion)."
      : `${players.size} joueurs dans l'émulateur : préciser --uid (${players.docs.map((d) => d.id).join(", ")}).`
  );
}

/** Applique la commande au joueur `uid`, dans une transaction. Renvoie un résumé lisible. */
export async function applyTestData(
  db: admin.firestore.Firestore,
  uid: string,
  buildingId: string,
  command: TestDataCommand,
): Promise<string> {
  const playerRef   = db.collection("players").doc(uid);
  const buildingRef = playerRef.collection("buildings").doc(buildingId);

  return db.runTransaction(async (tx) => {
    if (command.kind === "set-inventory") {
      const snap = await tx.get(playerRef);
      if (!snap.exists) throw new Error(`joueur '${uid}' introuvable.`);
      const inventory = (snap.data() as PlayerDocument).inventory;
      const updated: InventoryState = {
        logs:               { ...inventory.logs },
        planks:             { ...inventory.planks },
        reconstructionKits: { ...inventory.reconstructionKits },
      };
      for (const [key, quantity] of Object.entries(command.quantities) as Array<[ResourceKey, number]>) {
        if (quantity > updated[key].cap) {
          throw new Error(`${key} : ${quantity} dépasse le plafond ${updated[key].cap} (plafonds inchangés).`);
        }
        updated[key] = { ...updated[key], quantity };
      }
      tx.update(playerRef, { inventory: updated });
      return `inventaire de '${uid}' : ` +
        `logs ${updated.logs.quantity}/${updated.logs.cap}, ` +
        `planks ${updated.planks.quantity}/${updated.planks.cap}, ` +
        `kits ${updated.reconstructionKits.quantity}/${updated.reconstructionKits.cap}.`;
    }

    const snap = await tx.get(buildingRef);
    if (!snap.exists) throw new Error(`bâtiment '${buildingId}' introuvable pour '${uid}'.`);
    const building = snap.data() as BuildingDocument;
    const target = building.slots.find((s) => s.slotIndex === command.slotIndex);
    if (target === undefined) {
      throw new Error(`slot ${command.slotIndex} absent de '${buildingId}'.`);
    }

    let updatedSlot: ProductionSlotState;
    let summary: string;
    if (command.kind === "start-logs-slot") {
      if (target.recipeId !== null) {
        throw new Error(`slot ${command.slotIndex} de '${buildingId}' déjà occupé (${target.recipeId}).`);
      }
      // Même forme qu'un lancement de logs par startProductionSlot (son `updatedSlot`, sans lot).
      updatedSlot = {
        ...target,
        recipeId:        "logs",
        startedAt:       admin.firestore.Timestamp.now(),
        lastProcessedAt: null,
        cyclesPlanned:   null,
        cyclesProcessed: null,
      };
      summary = `slot ${command.slotIndex} de '${buildingId}' : logs actif depuis maintenant.`;
    } else {
      if (target.recipeId === null) {
        throw new Error(`slot ${command.slotIndex} de '${buildingId}' libre : rien à modifier.`);
      }
      if (command.kind === "rewind-slot") {
        if (target.startedAt === null || target.startedAt === undefined) {
          throw new Error(`slot ${command.slotIndex} sans startedAt : rien à reculer.`);
        }
        const shiftMs = command.minutes * 60_000;
        const back = (ts: admin.firestore.Timestamp) =>
          admin.firestore.Timestamp.fromMillis(ts.toMillis() - shiftMs);
        updatedSlot = {
          ...target,
          startedAt:       back(target.startedAt),
          lastProcessedAt: target.lastProcessedAt ? back(target.lastProcessedAt) : target.lastProcessedAt,
        };
        summary = `slot ${command.slotIndex} (${target.recipeId}) de '${buildingId}' reculé de ${command.minutes} min.`;
      } else {
        updatedSlot = { ...target, startedAt: null };
        summary = `slot ${command.slotIndex} (${target.recipeId}) de '${buildingId}' rendu corrompu (startedAt retiré).`;
      }
    }

    tx.update(buildingRef, {
      slots: building.slots.map((s) => s.slotIndex === command.slotIndex ? updatedSlot : s),
    });
    return summary;
  });
}

async function main(): Promise<void> {
  const parsed = parseTestDataArgs(process.argv.slice(2), process.env);
  if (!parsed.ok) {
    console.error(`emulator:testdata — REFUS : ${parsed.error}`);
    process.exitCode = 1;
    return;
  }
  const { project, uid, buildingId, command } = parsed.plan;

  admin.initializeApp({ projectId: project });
  const db = admin.firestore();
  const target = await resolveTargetUid(db, uid);
  const summary = await applyTestData(db, target, buildingId, command);
  console.log(`emulator:testdata — ÉMULATEUR ${process.env["FIRESTORE_EMULATOR_HOST"]} (projet '${project}') — ${summary}`);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error("emulator:testdata — ÉCHEC :", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
