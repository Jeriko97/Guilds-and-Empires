#!/usr/bin/env node
// Jeu de tests du filtre de l'arbitre (arbitre-lecture.js) : à rejouer à chaque modification du filtre.
// Lancement : node .claude/hooks/arbitre-lecture.test.js  → code 0 si tous les cas donnent le code attendu.

const { spawnSync } = require("child_process");
const path = require("path");

const FILTRE = path.join(__dirname, "arbitre-lecture.js");
const RACINE = "G:\\Unity\\GuildsAndEmpires";
const ARBITRE = "arbitre-strategique";

// [code attendu, agent_type, cwd, outil, entrée] — 0 = autorisé, 2 = refusé.
const CAS = [
  // Autres agents et session principale : jamais filtrés.
  [0, undefined, RACINE, "Read", { file_path: "G:/Unity/GuildsAndEmpires/.revue-croisee/codex-diff.md" }],
  [0, "auditeur", RACINE, "Read", { file_path: "G:/Unity/GuildsAndEmpires/.revue-croisee/codex-diff.md" }],
  [0, undefined, RACINE, "Bash", { command: "git status" }],
  // Arbitre : lectures du dépôt acceptées.
  [0, ARBITRE, RACINE, "Read", { file_path: "G:\\Unity\\GuildsAndEmpires\\CLAUDE.md" }],
  [0, ARBITRE, RACINE, "Read", { file_path: "G:/Unity/GuildsAndEmpires/.claude/skills/revue-croisee/SKILL.md" }],
  [0, ARBITRE, RACINE, "Grep", { pattern: "STOP", path: "G:/Unity/GuildsAndEmpires/docs" }],
  [0, ARBITRE, RACINE, "Grep", { pattern: ".*Error", glob: "**/*.ts" }],
  [0, ARBITRE, RACINE, "Grep", { pattern: "\\.revue-croisee", path: "G:/Unity/GuildsAndEmpires/CLAUDE.md" }],
  [0, ARBITRE, RACINE, "Glob", { pattern: "**/*.md" }],
  [0, ARBITRE, RACINE, "Glob", { pattern: "docs/*" }],
  [0, ARBITRE, RACINE, "Glob", { pattern: "*.cs" }],
  [0, ARBITRE, RACINE, "Glob", { pattern: "*" }],
  [0, ARBITRE, RACINE, "Glob", { pattern: "**/*.md", path: "G:/Unity/GuildsAndEmpires/.claude/instantanes/a" }],
  // Arbitre : `.revue-croisee` refusé, quelle que soit l'écriture.
  [2, ARBITRE, RACINE, "Read", { file_path: "G:/Unity/GuildsAndEmpires/.revue-croisee/codex-diff.md" }],
  [2, ARBITRE, RACINE, "Read", { file_path: "G:\\Unity\\GuildsAndEmpires\\.revue-croisee\\codex-diff.md" }],
  [2, ARBITRE, RACINE, "Read", { file_path: "G:/Unity/GuildsAndEmpires/.Revue-Croisee/codex-diff.md" }],
  [2, ARBITRE, RACINE, "Read", { file_path: "G:/Unity/GuildsAndEmpires/REVUE-~1/codex-diff.md" }],
  [2, ARBITRE, RACINE, "Grep", { pattern: "VERDICT", path: "G:\\Unity\\GuildsAndEmpires\\.revue-croisee" }],
  [2, ARBITRE, RACINE, "Grep", { pattern: "VERDICT", glob: ".revue-croisee/*.md" }],
  [2, ARBITRE, RACINE, "Grep", { pattern: "x", glob: ".[r]evue-croisee/**" }],
  [2, ARBITRE, RACINE, "Grep", { pattern: "x", glob: "!*.cs" }],
  [2, ARBITRE, RACINE, "Glob", { pattern: ".revue-croisee/**" }],
  [2, ARBITRE, RACINE, "Glob", { pattern: ".revue-*/*.md" }],
  [2, ARBITRE, RACINE, "Glob", { pattern: "?revue-croisee/*" }],
  [2, ARBITRE, RACINE, "Glob", { pattern: "*e*/codex-diff.md" }],
  [2, ARBITRE, RACINE, "Glob", { pattern: ".revue-{croisee,x}/*" }],
  [2, ARBITRE, RACINE, "Glob", { pattern: "*/codex-diff.md", path: "G:/Unity/GuildsAndEmpires/.REVUE-CROISEE" }],
  // Arbitre : dossier courant dans `.revue-croisee` → tout refusé.
  [2, ARBITRE, "G:\\Unity\\GuildsAndEmpires\\.revue-croisee", "Glob", { pattern: "*.md" }],
  [2, ARBITRE, "G:/Unity/GuildsAndEmpires/.Revue-Croisee", "Grep", { pattern: "VERDICT" }],
  // Arbitre : tout autre outil refusé.
  [2, ARBITRE, RACINE, "Bash", { command: "git log -1" }],
  [2, ARBITRE, RACINE, "Edit", {}],
  [2, ARBITRE, RACINE, "Write", { file_path: "G:/Unity/GuildsAndEmpires/x.md" }],
];

function lancer(entree) {
  return spawnSync(process.execPath, [FILTRE], { input: entree, encoding: "utf8" }).status;
}

let echecs = 0;
for (const [attendu, agentType, cwd, outil, entree] of CAS) {
  const code = lancer(JSON.stringify({ agent_type: agentType, cwd, tool_name: outil, tool_input: entree }));
  if (code !== attendu) {
    echecs += 1;
    console.log(`ÉCHEC (attendu ${attendu}, obtenu ${code}) : ${agentType ?? "principal"} ${outil} ${JSON.stringify(entree)}`);
  }
}
// Entrée illisible : refusée (on ne sait pas qui appelle).
if (lancer("illisible") !== 2) { echecs += 1; console.log("ÉCHEC : entrée illisible"); }

const total = CAS.length + 1;
console.log(`${total - echecs}/${total} cas conformes`);
process.exit(echecs === 0 ? 0 : 1);
