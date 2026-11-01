import * as admin from "firebase-admin";

import { buildInitialMarketState, seedMarketStateIfAbsent } from "./marketStateSeed";

// ── CLI : npm run seed:market -- --project <id> [--apply] [--confirm-production] ─────
// (= npm run build && node lib/seed/runSeedMarketState.js ...). Dry-run par défaut.
// Jamais exporté par index.ts : ce n'est pas une Cloud Function (présent dans lib/ déployé, inerte).
// N'importe ni index.ts (initializeApp à l'import) ni aucun handler.
// Identifiants : Application Default Credentials (gcloud auth application-default login).
// Hors émulateur, aucune clé de compte de service n'est lue ni versionnée.

export type SeedPlan = {
  project: string;
  apply: boolean;
  target: "emulator" | "production";
};

export type SeedPlanResult = { ok: true; plan: SeedPlan } | { ok: false; error: string };

/** Garde-fous — pur, testé sans émulateur. */
export function parseSeedArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): SeedPlanResult {
  const projectIndex = argv.indexOf("--project");
  const project      = projectIndex >= 0 ? argv[projectIndex + 1] : undefined;
  if (!project || project.startsWith("--")) {
    return { ok: false, error: "--project <id> est obligatoire." };
  }

  // initializeApp({ projectId }) fait foi, mais une variable d'environnement contradictoire
  // signale une confusion de cible : refus plutôt que deviner.
  for (const name of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) {
    const value = env[name];
    if (value && value !== project) {
      return { ok: false, error: `${name}='${value}' contredit --project '${project}'.` };
    }
  }

  const apply             = argv.includes("--apply");
  const confirmProduction = argv.includes("--confirm-production");
  const onEmulator        = Boolean(env["FIRESTORE_EMULATOR_HOST"]);
  const isDemoProject     = project.startsWith("demo-");

  if (isDemoProject && !onEmulator) {
    return { ok: false, error: `Projet '${project}' : un projet demo-* exige FIRESTORE_EMULATOR_HOST.` };
  }
  if (!isDemoProject && !onEmulator && apply && !confirmProduction) {
    return {
      ok: false,
      error: `Projet '${project}' hors émulateur : écriture en PRODUCTION refusée sans --confirm-production.`,
    };
  }

  return { ok: true, plan: { project, apply, target: onEmulator ? "emulator" : "production" } };
}

async function main(): Promise<void> {
  const parsed = parseSeedArgs(process.argv.slice(2), process.env);
  if (!parsed.ok) {
    console.error(`seed:market — REFUS : ${parsed.error}`);
    process.exitCode = 1;
    return;
  }
  const { project, apply, target } = parsed.plan;
  const now = admin.firestore.Timestamp.now();

  console.log(`seed:market — projet '${project}' (${target}) — marketState/state :`);
  console.log(JSON.stringify(buildInitialMarketState(now), null, 2));

  if (!apply) {
    console.log("seed:market — DRY-RUN : rien n'a été écrit. Ajouter --apply pour écrire.");
    return;
  }

  admin.initializeApp({ projectId: project });
  const result = await seedMarketStateIfAbsent(admin.firestore(), now);
  console.log(
    result === "created"
      ? "seed:market — CRÉÉ : marketState/state écrit."
      : "seed:market — DÉJÀ PRÉSENT : marketState/state existe, rien n'a été modifié."
  );
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error("seed:market — ÉCHEC :", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
