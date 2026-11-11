#!/usr/bin/env node
// Jeu de tests du filtre de lecture des relecteurs (arbitre-lecture.js) : à rejouer à chaque modification du filtre.
// Lancement : node .claude/hooks/arbitre-lecture.test.js  → code 0 si tous les cas donnent le code attendu.
// Les cas « jonction » dépendent du poste : jonction absente → cas marqué « sans objet », jamais compté comme réussi.

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const FILTRE = path.join(__dirname, "arbitre-lecture.js");
const RACINE = "G:\\Unity\\GuildsAndEmpires";
const WORKTREE = "G:/Unity/_revues/GuildsAndEmpires/essai-L1";
const ARBITRE = "arbitre-strategique";
const AUDITEUR = "auditeur";
const RELECTEURS = [ARBITRE, AUDITEUR];
const DOSSIERS_INTERDITS = [
  "G:/Unity/GuildsAndEmpires/.revue-croisee",
  "G:/Unity/GuildsAndEmpires/.claude/instantanes/executant",
  "G:/Unity/_hors-revue",
  "C:/Users/romai/AppData/Roaming/Claude/side-session-notes",
  "C:/Users/romai/.codex/sessions",
  "C:/Users/romai/.claude/projects",
  "C:/Users/romai/AppData/Local/Temp/claude",
  "G:/Unity/GuildsAndEmpires/.claude/hooks-dev",
];
// Dossiers parents d'un dossier interdit (R2), en racine de Glob et de Grep.
const PARENTS = [
  RACINE, ".", "G:/Unity/GuildsAndEmpires/", ".claude", ".claude/instantanes", "G:/Unity", "G:/", "g:\\",
  "C:/", "C:/Users", "C:/Users/romai", "C:/Users/romai/AppData", "C:/Users/romai/.codex", "C:/Users/romai/.claude",
  "C:/Users/romai/AppData/Local", "C:/Users/romai/AppData/Local/Temp", "C:/Users/romai/AppData/Roaming",
  "C:/Users/romai/AppData/Roaming/Claude", "G:\\UNITY\\GUILDSANDEMPIRES\\.CLAUDE",
];
// Jonctions présentes par défaut sous Windows 10 : [chemin lu, jonction dont dépend le cas].
const JONCTIONS = [
  ["C:\\Documents and Settings\\romai\\.claude\\projects\\x", "C:\\Documents and Settings"],
  ["C:\\Users\\romai\\Local Settings\\Temp\\claude\\x", "C:\\Users\\romai\\Local Settings"],
  ["C:\\Users\\romai\\Application Data\\Claude\\side-session-notes\\x", "C:\\Users\\romai\\Application Data"],
];

// [code attendu, agent_type, cwd, outil, entrée] — 0 = autorisé, 2 = refusé.
const CAS = [];
const ajouter = (attendu, agent, cwd, outil, entree) => CAS.push([attendu, agent, cwd, outil, entree]);

// Session principale et autres agents : jamais filtrés.
ajouter(0, undefined, RACINE, "Read", { file_path: "G:/Unity/GuildsAndEmpires/.revue-croisee/codex-diff.md" });
ajouter(0, undefined, RACINE, "Bash", { command: "git status" });
ajouter(0, undefined, RACINE, "Read", { file_path: "C:/Users/romai/.claude/projects/x/agent.jsonl" });
ajouter(0, undefined, RACINE, "Glob", { pattern: "**/*.md" });
ajouter(0, "general-purpose", RACINE, "Read", { file_path: "G:/Unity/GuildsAndEmpires/.claude/instantanes/executant/x" });

for (const A of RELECTEURS) {
  // Cas existants admis, gardés admis.
  ajouter(0, A, RACINE, "Read", { file_path: "G:\\Unity\\GuildsAndEmpires\\CLAUDE.md" });
  ajouter(0, A, RACINE, "Read", { file_path: "G:/Unity/GuildsAndEmpires/.claude/skills/revue-croisee/SKILL.md" });
  ajouter(0, A, RACINE, "Grep", { pattern: "STOP", path: "G:/Unity/GuildsAndEmpires/docs" });
  ajouter(0, A, RACINE, "Grep", { pattern: "\\.revue-croisee", path: "G:/Unity/GuildsAndEmpires/CLAUDE.md" });
  ajouter(0, A, RACINE, "Glob", { pattern: "**/*.md", path: "G:/Unity/GuildsAndEmpires/.claude/instantanes/a" });
  // Cas existants admis dont la racine est celle du dépôt : passent à 2 (R2, resserrement voulu).
  ajouter(2, A, RACINE, "Grep", { pattern: ".*Error", glob: "**/*.ts" });
  ajouter(2, A, RACINE, "Glob", { pattern: "**/*.md" });
  ajouter(2, A, RACINE, "Glob", { pattern: "docs/*" });
  ajouter(2, A, RACINE, "Glob", { pattern: "*.cs" });
  ajouter(2, A, RACINE, "Glob", { pattern: "*" });
  // Cas existants refusés : restent refusés (`.revue-croisee`, quelle que soit l'écriture).
  ajouter(2, A, RACINE, "Read", { file_path: "G:/Unity/GuildsAndEmpires/.revue-croisee/codex-diff.md" });
  ajouter(2, A, RACINE, "Read", { file_path: "G:\\Unity\\GuildsAndEmpires\\.revue-croisee\\codex-diff.md" });
  ajouter(2, A, RACINE, "Read", { file_path: "G:/Unity/GuildsAndEmpires/.Revue-Croisee/codex-diff.md" });
  ajouter(2, A, RACINE, "Read", { file_path: "G:/Unity/GuildsAndEmpires/REVUE-~1/codex-diff.md" });
  ajouter(2, A, RACINE, "Grep", { pattern: "VERDICT", path: "G:\\Unity\\GuildsAndEmpires\\.revue-croisee" });
  ajouter(2, A, RACINE, "Grep", { pattern: "VERDICT", glob: ".revue-croisee/*.md" });
  ajouter(2, A, RACINE, "Grep", { pattern: "x", glob: ".[r]evue-croisee/**" });
  ajouter(2, A, RACINE, "Grep", { pattern: "x", glob: "!*.cs" });
  ajouter(2, A, RACINE, "Glob", { pattern: ".revue-croisee/**" });
  ajouter(2, A, RACINE, "Glob", { pattern: ".revue-*/*.md" });
  ajouter(2, A, RACINE, "Glob", { pattern: "?revue-croisee/*" });
  ajouter(2, A, RACINE, "Glob", { pattern: "*e*/codex-diff.md" });
  ajouter(2, A, RACINE, "Glob", { pattern: ".revue-{croisee,x}/*" });
  ajouter(2, A, RACINE, "Glob", { pattern: "*/codex-diff.md", path: "G:/Unity/GuildsAndEmpires/.REVUE-CROISEE" });
  ajouter(2, A, "G:\\Unity\\GuildsAndEmpires\\.revue-croisee", "Glob", { pattern: "*.md" });
  ajouter(2, A, "G:/Unity/GuildsAndEmpires/.Revue-Croisee", "Grep", { pattern: "VERDICT" });
  ajouter(2, A, RACINE, "Bash", { command: "git log -1" });
  ajouter(2, A, RACINE, "Edit", {});
  ajouter(2, A, RACINE, "Write", { file_path: "G:/Unity/GuildsAndEmpires/x.md" });

  // Read de chaque dossier interdit : `/`, `\`, casse.
  for (const dossier of DOSSIERS_INTERDITS) {
    ajouter(2, A, RACINE, "Read", { file_path: `${dossier}/x` });
    ajouter(2, A, RACINE, "Read", { file_path: `${dossier}\\x`.replace(/\//g, "\\") });
    ajouter(2, A, RACINE, "Read", { file_path: `${dossier.toUpperCase()}/x` });
    ajouter(2, A, RACINE, "Read", { file_path: dossier });
    ajouter(2, A, RACINE, "Glob", { pattern: "*", path: dossier });
    ajouter(2, A, RACINE, "Grep", { pattern: "x", path: `${dossier}/sous-dossier` });
  }
  // Chemins non normalisés.
  ajouter(2, A, RACINE, "Read", { file_path: ".claude/instantanes/../instantanes/executant/x" });
  ajouter(2, A, RACINE, "Read", { file_path: "G:/Unity//_hors-revue/x" });
  ajouter(2, A, RACINE, "Read", { file_path: "G:/Unity/./_hors-revue/x" });
  ajouter(2, A, RACINE, "Read", { file_path: "G:/Unity/GuildsAndEmpires/docs/../../_hors-revue/x" });
  ajouter(2, A, RACINE, "Read", { file_path: "..\\_hors-revue\\x" });

  // R2 : Glob et Grep avec une racine parente d'un dossier interdit, ou sans `path`.
  for (const parent of PARENTS) {
    ajouter(2, A, RACINE, "Glob", { pattern: "*.md", path: parent });
    ajouter(2, A, RACINE, "Grep", { pattern: "x", path: parent });
  }
  ajouter(2, A, RACINE, "Glob", { pattern: "temoin-L1.txt" });
  ajouter(2, A, RACINE, "Grep", { pattern: "x" });
  ajouter(2, A, "G:/Unity", "Glob", { pattern: "**/temoin-L1.txt" });

  // R3 : motifs absolus, commençant par un lecteur, `/` ou `\`, ou contenant `..`.
  for (const motif of ["G:/Unity/**/x", "/Unity/x", "\\Unity\\x", "../x", "{docs,../x}", "docs/../../x", "C:x"]) {
    ajouter(2, A, RACINE, "Glob", { pattern: motif, path: "docs" });
    ajouter(2, A, RACINE, "Grep", { pattern: "x", glob: motif, path: "docs" });
  }
  // Accolades non développables, `~` en tête.
  for (const motif of ["{a,b", "a}", "{a}", "x{a,{b,c}", "~/x"]) {
    ajouter(2, A, RACINE, "Glob", { pattern: motif, path: "docs" });
  }

  // Admis : worktree de revue.
  ajouter(0, A, RACINE, "Glob", { pattern: "**/*.md", path: WORKTREE });
  ajouter(0, A, RACINE, "Glob", { pattern: "*.txt", path: WORKTREE });
  ajouter(0, A, RACINE, "Glob", { pattern: "temoin-L1.txt", path: WORKTREE });
  ajouter(0, A, RACINE, "Glob", { pattern: "**/temoin-L1.txt", path: WORKTREE.replace(/\//g, "\\") });
  ajouter(0, A, RACINE, "Grep", { pattern: "x", glob: "{instantanes,temoin-L1.txt}", path: WORKTREE });
  ajouter(0, A, RACINE, "Grep", { pattern: "contenu-aleatoire", path: WORKTREE });
  ajouter(0, A, RACINE, "Read", { file_path: `${WORKTREE}/docs/a.md` });
  ajouter(0, A, WORKTREE, "Glob", { pattern: "**/*.md" });
  // Admis : sous-dossiers sûrs du dépôt.
  for (const sur of ["docs", ".claude/skills", ".claude/instantanes/revue", ".claude/instantanes/cloture",
    ".claude/hooks", ".claude/agents", "G:/Unity/GuildsAndEmpires/docs", "Assets\\_Project"]) {
    ajouter(0, A, RACINE, "Glob", { pattern: "**/*.md", path: sur });
    ajouter(0, A, RACINE, "Grep", { pattern: "x", path: sur });
  }
  // Admis : accolades sans dossier interdit.
  ajouter(0, A, RACINE, "Grep", { pattern: "guid", glob: "Firebase.{Auth,Firestore,AppCheck}.dll.meta", path: "Assets" });
  ajouter(0, A, RACINE, "Glob", { pattern: "{guides,sessions}/*.md", path: "docs" });
  ajouter(0, A, RACINE, "Glob", { pattern: "*.{cs,{uxml,uss}}", path: "Assets" });

  // Cas de la revue du ticket v8, un test par forme.
  for (const chemin of [
    "~/.claude/projects/x", "\\\\?\\G:\\Unity\\_hors-revue\\x", "\\\\.\\G:\\Unity\\_hors-revue\\x",
    "\\\\localhost\\G$\\Unity\\_hors-revue\\x", "G:\\Unity\\_hors-revue.\\x", "G:\\Unity\\_hors-revue \\x",
    "G:\\Unity\\GuildsAndEmpires\\docs\\x.md:flux",
  ]) ajouter(2, A, RACINE, "Read", { file_path: chemin });
  ajouter(2, A, RACINE, "Glob", { pattern: ".revue-croisee/*", path: "docs" });
  ajouter(2, A, RACINE, "Glob", { pattern: "**/.claude/instantanes/executant/*", path: "docs" });
  ajouter(2, A, RACINE, "Grep", { pattern: "x", glob: "PROGRA~1/*", path: "docs" });
  ajouter(2, A, "G:\\Unity\\GuildsAndEmpires\\.revue-croisee", "Read", { file_path: "G:/Unity/GuildsAndEmpires/CLAUDE.md" });
  ajouter(2, A, "G:/Unity/_hors-revue", "Read", { file_path: "G:/Unity/GuildsAndEmpires/CLAUDE.md" });
  ajouter(2, A, "G:/Unity/_hors-revue/GuildsAndEmpires/L1", "Read", { file_path: "G:/Unity/GuildsAndEmpires/CLAUDE.md" });

  // Cas de la revue du ticket v9.
  for (const chemin of [
    "\\??\\UNC\\localhost\\G$\\Unity\\_hors-revue\\x", "\\??\\G:\\Unity\\_hors-revue\\x", "\\Unity\\_hors-revue\\x",
    "/Unity/_hors-revue/x", "C:.claude\\projects\\x", "G:..\\_hors-revue\\x", "docs\\*.md",
  ]) ajouter(2, A, RACINE, "Read", { file_path: chemin });
  ajouter(2, A, RACINE, "Glob", { pattern: "*", path: "\\??\\UNC\\localhost\\G$\\Unity\\_hors-revue" });
  for (const motif of [".revue-*/*.md", ".revue-croise?/*", "**/instantan*/exec*/*"]) {
    ajouter(2, A, RACINE, "Glob", { pattern: motif, path: "docs" });
  }

  // Dossier de travail des fichiers protégés (ticket L1 v18, §2 A.1) : Read refusé (absolu, relatif, `\`, casse) ;
  // Glob et Grep refusés avec `path` = `.claude` (R2) ou dans le dossier (R1) ; `.claude/hooks` reste admis (segment).
  ajouter(2, A, RACINE, "Read", { file_path: "G:/Unity/GuildsAndEmpires/.claude/hooks-dev/temoin-L1.txt" });
  ajouter(2, A, RACINE, "Read", { file_path: "G:\\Unity\\GuildsAndEmpires\\.claude\\hooks-dev\\temoin-L1.txt" });
  ajouter(2, A, RACINE, "Read", { file_path: "g:/unity/guildsandempires/.CLAUDE/HOOKS-DEV/temoin-L1.txt" });
  ajouter(2, A, RACINE, "Read", { file_path: ".claude/hooks-dev/temoin-L1.txt" });
  ajouter(2, A, RACINE, "Read", { file_path: ".claude/hooks/../hooks-dev/L1s/.claude/hooks/arbitre-lecture.js" });
  ajouter(2, A, RACINE, "Glob", { pattern: "**/temoin-L1.txt", path: ".claude" });
  ajouter(2, A, RACINE, "Grep", { pattern: "contenu-aleatoire", path: ".claude" });
  ajouter(2, A, RACINE, "Glob", { pattern: "**/*", path: ".claude/hooks-dev" });
  ajouter(2, A, RACINE, "Grep", { pattern: "x", path: "G:/Unity/GuildsAndEmpires/.claude/hooks-dev/L1s" });
  ajouter(0, A, RACINE, "Read", { file_path: "G:/Unity/GuildsAndEmpires/.claude/hooks/arbitre-lecture.js" });
  ajouter(0, A, RACINE, "Glob", { pattern: "*.js", path: "G:/Unity/GuildsAndEmpires/.claude/hooks" });

  // Formes de `cwd` : relative ou absente → refus.
  ajouter(2, A, "GuildsAndEmpires", "Read", { file_path: "G:/Unity/GuildsAndEmpires/CLAUDE.md" });
  ajouter(2, A, undefined, "Read", { file_path: "G:/Unity/GuildsAndEmpires/CLAUDE.md" });
  ajouter(2, A, RACINE, "Read", {});

  // Tout autre outil refusé, pour l'auditeur comme pour l'arbitre.
  for (const outil of ["Bash", "PowerShell", "Edit", "Write", "NotebookEdit", "WebFetch", "Agent", "Skill"]) {
    ajouter(2, A, RACINE, outil, { file_path: "G:/Unity/GuildsAndEmpires/docs/a.md" });
  }
}

function lancer(entree) {
  return spawnSync(process.execPath, [FILTRE], { input: entree, encoding: "utf8" });
}

let echecs = 0;
let conformes = 0;
for (const [attendu, agentType, cwd, outil, entree] of CAS) {
  const { status } = lancer(JSON.stringify({ agent_type: agentType, cwd, tool_name: outil, tool_input: entree }));
  if (status !== attendu) {
    echecs += 1;
    console.log(`ÉCHEC (attendu ${attendu}, obtenu ${status}) : ${agentType ?? "principal"} cwd=${cwd} ${outil} ${JSON.stringify(entree)}`);
  } else {
    conformes += 1;
  }
}

// Jonctions réelles du poste : refus attendu pour un dossier interdit atteint par le chemin réel (R1).
let sansObjet = 0;
for (const [chemin, jonction] of JONCTIONS) {
  let estJonction = false;
  try { estJonction = fs.lstatSync(jonction).isSymbolicLink(); } catch { estJonction = false; }
  for (const A of RELECTEURS) {
    if (!estJonction) {
      sansObjet += 1;
      console.log(`SANS OBJET (jonction absente : ${jonction}) : ${A} Read ${chemin}`);
      continue;
    }
    const sortie = lancer(JSON.stringify({ agent_type: A, cwd: RACINE, tool_name: "Read", tool_input: { file_path: chemin } }));
    if (sortie.status === 2 && /\(chemin réel\) dans un dossier interdit/.test(sortie.stderr)) {
      conformes += 1;
    } else {
      echecs += 1;
      console.log(`ÉCHEC (attendu 2 par le chemin réel, R1 ; obtenu ${sortie.status}) : ${A} Read ${chemin} — ${sortie.stderr.trim()}`);
    }
  }
}

// Entrée illisible : refusée (on ne sait pas qui appelle).
if (lancer("illisible").status !== 2) { echecs += 1; console.log("ÉCHEC : entrée illisible"); } else { conformes += 1; }

const total = conformes + echecs;
console.log(`${conformes}/${total} cas conformes${sansObjet ? ` ; ${sansObjet} cas sans objet (non comptés)` : ""}`);
process.exit(echecs === 0 ? 0 : 1);
