#!/usr/bin/env node
// Jeu de tests du filtre de lecture des relecteurs (arbitre-lecture.js) : à rejouer à chaque modification du filtre.
// Lancement : node .claude/hooks/arbitre-lecture.test.js  → code 0 si tous les cas donnent le code attendu.
// Les cas « jonction » dépendent du poste : jonction absente → cas marqué « sans objet », jamais compté comme réussi.
// Les cas du dossier des avis anciens (`archives/avis-relecteurs`, décision du founder du 2026-11-11, option 3 ;
// arbitrage de l'arbitre du 2026-11-11, Q1, Q2, B2) qui demandent un dossier existant utilisent un gabarit
// temporaire créé sous `G:/Unity/_revues/GuildsAndEmpires/` et supprimé en fin de jeu, même en cas d'échec ; gabarit
// impossible à créer → échec du jeu.
// Les cas des dossiers d'état de Claude Code et de Codex (arbitrage de l'arbitre du 2026-11-11, L2b, suite de P7,
// condition (ii)) ne lisent aucun contenu ; le cas « chemin absent » vérifie d'abord que son chemin n'existe pas.

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const FILTRE = path.join(__dirname, "arbitre-lecture.js");
const RACINE = "G:\\Unity\\GuildsAndEmpires";
const WORKTREE = "G:/Unity/_revues/GuildsAndEmpires/essai-L1";
const REVUES_PROJET = "G:/Unity/_revues/GuildsAndEmpires";
// Gabarit temporaire (racine propre à ce lancement) : `wt` imite un worktree de revue qui contient le dossier des
// avis anciens ; `sans` n'en contient aucun ; `avec-*` contient un dossier de chaque nom interdit ; `boucle/archives`
// est une jonction qui pointe sur elle-même (erreur de `stat` autre que « absent »).
const GABARIT = `${REVUES_PROJET}/gabarit-filtre-${process.pid}`;
const AVIS = "archives/avis-relecteurs";
const ARBITRE = "arbitre-strategique";
const AUDITEUR = "auditeur";
const RELECTEURS = [ARBITRE, AUDITEUR];
const DOSSIERS_INTERDITS = [
  "G:/Unity/GuildsAndEmpires/.revue-croisee",
  "G:/Unity/GuildsAndEmpires/.claude/instantanes/executant",
  "G:/Unity/_hors-revue",
  "C:/Users/romai/AppData/Roaming/Claude/side-session-notes",
  "C:/Users/romai/.codex",
  "C:/Users/romai/.claude",
  "C:/Users/romai/AppData/Local/Temp/claude",
  "G:/Unity/GuildsAndEmpires/.claude/hooks-dev",
];
// Dossiers parents d'un dossier interdit (R2), en racine de Glob et de Grep. `C:/Users/romai/.codex` et
// `C:/Users/romai/.claude` n'y sont plus : dossiers interdits depuis L2b (R1, boucle DOSSIERS_INTERDITS).
const PARENTS = [
  RACINE, ".", "G:/Unity/GuildsAndEmpires/", ".claude", ".claude/instantanes", "G:/Unity", "G:/", "g:\\",
  "C:/", "C:/Users", "C:/Users/romai", "C:/Users/romai/AppData", "C:/Users/romai/AppData/Local",
  "C:/Users/romai/AppData/Local/Temp", "C:/Users/romai/AppData/Roaming",
  "C:/Users/romai/AppData/Roaming/Claude", "G:\\UNITY\\GUILDSANDEMPIRES\\.CLAUDE",
];
// Jonctions présentes par défaut sous Windows 10 : [chemin lu, jonction dont dépend le cas].
const JONCTIONS = [
  ["C:\\Documents and Settings\\romai\\.claude\\projects\\x", "C:\\Documents and Settings"],
  ["C:\\Users\\romai\\Local Settings\\Temp\\claude\\x", "C:\\Users\\romai\\Local Settings"],
  ["C:\\Users\\romai\\Application Data\\Claude\\side-session-notes\\x", "C:\\Users\\romai\\Application Data"],
];

// Les six chemins de P7 (arbitrage de l'arbitre du 2026-11-11, L2), couverts par les deux dossiers d'état.
const P7_CHEMINS = [
  "C:/Users/romai/.claude/todos", "C:/Users/romai/.claude/file-history", "C:/Users/romai/.claude/history.jsonl",
  "C:/Users/romai/.claude/plans", "C:/Users/romai/.codex/archived_sessions", "C:/Users/romai/.codex/log",
];
// Chemins absents du disque (vérifié avant le cas) : le refus ne dépend pas de l'existence.
const CHEMINS_ABSENTS = [
  `C:/Users/romai/.claude/absent-filtre-${process.pid}/x.jsonl`, `C:/Users/romai/.codex/absent-filtre-${process.pid}`,
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
  // Cas existants admis dont la racine est celle du dépôt : passent à 2 (R2).
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

  // Dossier des avis anciens (décision du founder du 2026-11-11, option 3 ; arbitrage du 2026-11-11, Q1 et Q2).
  // Read (`/`, `\`, casse) : dépôt principal, sous la racine des revues du projet, sous `.claude/instantanes/<x>/`.
  for (const base of ["G:/Unity/GuildsAndEmpires", `${REVUES_PROJET}/wt-x`, "G:/Unity/GuildsAndEmpires/.claude/instantanes/e"]) {
    const fichier = `${base}/${AVIS}/2026-11-02-ticket-19-2b.md`;
    ajouter(2, A, RACINE, "Read", { file_path: fichier });
    ajouter(2, A, RACINE, "Read", { file_path: fichier.replace(/\//g, "\\") });
    ajouter(2, A, RACINE, "Read", { file_path: fichier.toUpperCase() });
    ajouter(2, A, RACINE, "Read", { file_path: `${base}/Archives/Avis-Relecteurs` });
  }
  ajouter(2, A, RACINE, "Read", { file_path: `${AVIS}/2026-11-02-ticket-19-2b.md` });
  ajouter(2, A, RACINE, "Read", { file_path: "docs\\..\\archives\\avis-relecteurs\\x.md" });
  // Glob et Grep à racine dans le dossier.
  for (const racine of [`G:/Unity/GuildsAndEmpires/${AVIS}`, `${AVIS}/sous-dossier`, `${WORKTREE}/${AVIS}`,
    `${WORKTREE}/ARCHIVES/Avis-Relecteurs`.replace(/\//g, "\\"), `${REVUES_PROJET}/wt-x/${AVIS}/sous-dossier`]) {
    ajouter(2, A, RACINE, "Glob", { pattern: "*.md", path: racine });
    ajouter(2, A, RACINE, "Grep", { pattern: "x", path: racine });
  }
  ajouter(2, A, `${WORKTREE}/${AVIS}`, "Glob", { pattern: "*.md" });
  // Motifs qui contiennent le nom, ou dont un segment à jokers peut désigner `archives` ou `avis-relecteurs`.
  for (const motif of [`${AVIS}/*`, `**/${AVIS}/*.md`, "{docs,archives/avis-relecteurs}/*", "a*/avis*/*", "*s/*.md",
    "**/archiv?s/*", "*/avis-*/*", "**/[a]rchives/*"]) {
    ajouter(2, A, RACINE, "Glob", { pattern: motif, path: "docs" });
    ajouter(2, A, RACINE, "Grep", { pattern: "x", glob: motif, path: "docs" });
  }

  // Racine des revues du projet et ses parents (arbitrage du 2026-11-11, B2, complément de Q2) : Glob et Grep refusés ;
  // `G:/Unity` et `G:/` déjà refusés (liste PARENTS, R2).
  for (const racine of ["G:/Unity/_revues", "G:\\Unity\\_revues", "g:/unity/_REVUES", REVUES_PROJET,
    REVUES_PROJET.replace(/\//g, "\\"), "G:/UNITY/_revues/guildsandempires/", `${REVUES_PROJET}/wt-x/..`]) {
    ajouter(2, A, RACINE, "Glob", { pattern: "**/*.md", path: racine });
    ajouter(2, A, RACINE, "Grep", { pattern: "x", path: racine });
  }
  ajouter(2, A, RACINE, "Grep", { pattern: "VERDICT", glob: "**/*.md", output_mode: "content", path: REVUES_PROJET });
  ajouter(2, A, RACINE, "Grep", { pattern: "VERDICT", glob: "**/*.md", output_mode: "content", path: "G:/Unity/_revues" });
  ajouter(2, A, REVUES_PROJET, "Grep", { pattern: "VERDICT", glob: "**/*.md", output_mode: "content" });
  ajouter(2, A, "G:/Unity/_revues", "Glob", { pattern: "**/*.md" });

  // Gabarit temporaire. Worktree contenant le dossier : racine refusée (contrôle d'existence), `docs` admis, Read
  // admis hors du dossier, refusé dedans.
  const wt = `${GABARIT}/wt`;
  for (const racine of [wt, wt.replace(/\//g, "\\"), wt.toUpperCase(), `${wt}/`, `${wt}/docs/..`]) {
    ajouter(2, A, RACINE, "Glob", { pattern: "**/*.md", path: racine });
    ajouter(2, A, RACINE, "Grep", { pattern: "x", path: racine });
  }
  ajouter(2, A, RACINE, "Grep", { pattern: "x", glob: "**/*.md", output_mode: "content", path: wt });
  ajouter(2, A, wt, "Grep", { pattern: "x" });
  ajouter(2, A, wt, "Glob", { pattern: "**/*.md" });
  ajouter(2, A, RACINE, "Glob", { pattern: "*", path: `${wt}/archives` });
  ajouter(2, A, RACINE, "Grep", { pattern: "x", path: `${wt}\\Archives` });
  ajouter(2, A, RACINE, "Read", { file_path: `${wt}/${AVIS}/x.md` });
  ajouter(0, A, RACINE, "Glob", { pattern: "**/*.md", path: `${wt}/docs` });
  ajouter(0, A, RACINE, "Grep", { pattern: "x", glob: "**/*.md", output_mode: "content", path: `${wt}/docs` });
  ajouter(0, A, RACINE, "Read", { file_path: `${wt}/docs/a.md` });
  ajouter(0, A, `${wt}/docs`, "Glob", { pattern: "*.md" });
  // Racine parente sans aucun dossier interdit : admise.
  ajouter(0, A, RACINE, "Glob", { pattern: "**/*.md", path: `${GABARIT}/sans` });
  ajouter(0, A, RACINE, "Grep", { pattern: "x", path: `${GABARIT}/sans` });
  // Contrôle d'existence appliqué à tous les noms de NOMS_INTERDITS, avec alignement des derniers segments.
  for (const racine of [`${GABARIT}/avec-revue`, `${GABARIT}/avec-exec`, `${GABARIT}/avec-exec/.claude`,
    `${GABARIT}/avec-exec/.claude/instantanes`]) {
    ajouter(2, A, RACINE, "Glob", { pattern: "**/*.md", path: racine });
    ajouter(2, A, RACINE, "Grep", { pattern: "x", path: racine });
  }

  // Dossiers d'état de Claude Code et de Codex (arbitrage de l'arbitre du 2026-11-11, L2b, suite de P7, condition
  // (ii)). Read refusé sur chacune des deux racines (aussi dans la boucle DOSSIERS_INTERDITS ci-dessus).
  for (const racine of ["C:/Users/romai/.claude", "C:/Users/romai/.codex", "C:\\Users\\romai\\.claude\\",
    "c:/users/ROMAI/.CODEX"]) {
    ajouter(2, A, RACINE, "Read", { file_path: racine });
  }
  // Read refusé sur les six chemins de P7, qu'ils existent ou non (forme « fichier » `history.jsonl` comprise).
  for (const chemin of P7_CHEMINS) {
    ajouter(2, A, RACINE, "Read", { file_path: chemin });
    ajouter(2, A, RACINE, "Read", { file_path: chemin.replace(/\//g, "\\") });
  }
  for (const chemin of ["C:/Users/romai/.claude/todos/x.json", "C:/Users/romai/.claude/file-history/x/y",
    "C:/Users/romai/.claude/plans/x.md", "C:/Users/romai/.codex/archived_sessions/x.jsonl",
    "C:/Users/romai/.codex/log/x.log"]) {
    ajouter(2, A, RACINE, "Read", { file_path: chemin });
  }
  // Anciens chemins (non-régression) et échantillon des entrées constatées.
  for (const chemin of ["C:/Users/romai/.claude/projects/x", "C:/Users/romai/.codex/sessions/x",
    "C:/Users/romai/.claude/shell-snapshots/x", "C:/Users/romai/.codex/logs_2.sqlite",
    "C:/Users/romai/.claude/sessions/x.json", "C:/Users/romai/.claude/uploads/x.jpg",
    "C:/Users/romai/.claude/backups/x", "C:/Users/romai/.codex/.tmp/x", "C:/Users/romai/.claude/settings.json"]) {
    ajouter(2, A, RACINE, "Read", { file_path: chemin });
  }
  // Glob et Grep refusés : racine dans un dossier d'état, ou parente (R2 ; `C:/Users/romai`, `C:/Users`, `C:/` aussi
  // dans la liste PARENTS).
  for (const racine of ["C:/Users/romai/.claude/todos", "C:/Users/romai/.codex/log", "C:/Users/romai/.claude/projects",
    "C:/Users/romai", "C:/Users", "C:/"]) {
    ajouter(2, A, RACINE, "Glob", { pattern: "**/*", path: racine });
    ajouter(2, A, RACINE, "Grep", { pattern: "x", path: racine });
  }
  // `cwd` dans un dossier d'état (R5).
  ajouter(2, A, "C:/Users/romai/.claude", "Read", { file_path: "G:/Unity/GuildsAndEmpires/CLAUDE.md" });
  ajouter(2, A, "C:/Users/romai/.codex/sessions", "Read", { file_path: "G:/Unity/GuildsAndEmpires/CLAUDE.md" });
  // Non-régression positive (condition (i)) : le `.claude` du dépôt reste lisible et admis comme racine.
  ajouter(0, A, RACINE, "Read", { file_path: "G:/Unity/GuildsAndEmpires/.claude/hooks/arbitre-lecture.js" });
  ajouter(0, A, RACINE, "Read", { file_path: "G:/Unity/GuildsAndEmpires/.claude/agents/auditeur.md" });
  ajouter(0, A, RACINE, "Read", { file_path: ".claude/skills/revue-croisee/SKILL.md" });
  for (const racine of ["G:/Unity/GuildsAndEmpires/.claude/hooks", "G:/Unity/GuildsAndEmpires/.claude/agents",
    "G:/Unity/GuildsAndEmpires/.claude/skills", "G:/Unity/GuildsAndEmpires/.claude/instantanes/cloture",
    "G:/Unity/GuildsAndEmpires/.claude/instantanes/revue"]) {
    ajouter(0, A, RACINE, "Glob", { pattern: "**/*", path: racine });
    ajouter(0, A, RACINE, "Grep", { pattern: "x", path: racine });
  }
}

// Cas dont le refus doit venir d'une cause précise (message), gabarit compris : [entrée, expression attendue].
const CAS_MESSAGE = [];
for (const A of RELECTEURS) {
  // Erreur de `stat` autre que « absent » (jonction en boucle) → refus, échec fermé.
  CAS_MESSAGE.push([{ agent_type: A, cwd: RACINE, tool_name: "Glob", tool_input: { pattern: "*", path: `${GABARIT}/boucle` } },
    /contrôle d'existence de archives\/avis-relecteurs impossible \(ELOOP/]);
  CAS_MESSAGE.push([{ agent_type: A, cwd: RACINE, tool_name: "Grep", tool_input: { pattern: "x", path: `${GABARIT}/boucle` } },
    /contrôle d'existence de archives\/avis-relecteurs impossible \(ELOOP/]);
  // Cause nommée : dossier des avis anciens, décision du founder du 2026-11-11.
  CAS_MESSAGE.push([{ agent_type: A, cwd: RACINE, tool_name: "Glob", tool_input: { pattern: "*", path: `${GABARIT}/wt` } },
    /contenant archives\/avis-relecteurs \(dossier des avis anciens, décision du founder du 2026-11-11 ; R2\)/]);
  CAS_MESSAGE.push([{ agent_type: A, cwd: RACINE, tool_name: "Read", tool_input: { file_path: `G:/Unity/GuildsAndEmpires/${AVIS}/x.md` } },
    /contenant archives\/avis-relecteurs \(dossier des avis anciens, décision du founder du 2026-11-11 ; R4\)/]);
  CAS_MESSAGE.push([{ agent_type: A, cwd: RACINE, tool_name: "Grep", tool_input: { pattern: "x", path: REVUES_PROJET } },
    /égale à la racine des revues du projet/]);
  // Dossiers d'état (suite de P7) : cause R1 nommée (forme « fichier » `history.jsonl`, ancien chemin), message (iii).
  CAS_MESSAGE.push([{ agent_type: A, cwd: RACINE, tool_name: "Read", tool_input: { file_path: "C:/Users/romai/.claude/history.jsonl" } },
    /file_path dans un dossier interdit : C:\/Users\/romai\/\.claude \(R1\)/]);
  CAS_MESSAGE.push([{ agent_type: A, cwd: RACINE, tool_name: "Read", tool_input: { file_path: "C:/Users/romai/.codex/sessions/x" } },
    /file_path dans un dossier interdit : C:\/Users\/romai\/\.codex \(R1\)/]);
  CAS_MESSAGE.push([{ agent_type: A, cwd: RACINE, tool_name: "Read", tool_input: { file_path: "C:/Users/romai/.codex/logs_2.sqlite" } },
    /dossiers d'état de Claude Code et de Codex \(`C:\/Users\/romai\/\.claude`, `C:\/Users\/romai\/\.codex`\)/]);
}

// Lecteur absent (échec fermé attendu) : premier lecteur de Z à H qui n'existe pas sur ce poste.
const LECTEUR_ABSENT = [..."ZYXWVUTSRQPONMLKJIH"].find((l) => !fs.existsSync(`${l}:\\`));

function creerGabarit() {
  const dossier = (relatif) => fs.mkdirSync(path.join(GABARIT, relatif), { recursive: true });
  dossier(`wt/${AVIS}`);
  fs.writeFileSync(path.join(GABARIT, `wt/${AVIS}/x.md`), "gabarit\n");
  dossier("wt/docs");
  fs.writeFileSync(path.join(GABARIT, "wt/docs/a.md"), "gabarit\n");
  dossier("sans/docs");
  dossier("avec-revue/.revue-croisee");
  dossier("avec-exec/.claude/instantanes/executant");
  dossier("boucle");
  const jonction = path.join(GABARIT, "boucle", "archives");
  fs.symlinkSync(jonction, jonction, "junction");
}

function supprimerGabarit() {
  fs.rmSync(GABARIT, { recursive: true, force: true });
}

function lancer(entree) {
  return spawnSync(process.execPath, [FILTRE], { input: entree, encoding: "utf8" });
}

let echecs = 0;
let conformes = 0;
try {
  try {
    creerGabarit();
  } catch (erreur) {
    echecs += 1;
    console.log(`ÉCHEC : gabarit temporaire impossible à créer (${erreur && erreur.code}) : ${GABARIT}`);
  }
  for (const [attendu, agentType, cwd, outil, entree] of CAS) {
    const { status } = lancer(JSON.stringify({ agent_type: agentType, cwd, tool_name: outil, tool_input: entree }));
    if (status !== attendu) {
      echecs += 1;
      console.log(`ÉCHEC (attendu ${attendu}, obtenu ${status}) : ${agentType ?? "principal"} cwd=${cwd} ${outil} ${JSON.stringify(entree)}`);
    } else {
      conformes += 1;
    }
  }
  for (const [entree, attenduMessage] of CAS_MESSAGE) {
    const sortie = lancer(JSON.stringify(entree));
    if (sortie.status === 2 && attenduMessage.test(sortie.stderr)) {
      conformes += 1;
    } else {
      echecs += 1;
      console.log(`ÉCHEC (attendu 2, message ${attenduMessage} ; obtenu ${sortie.status}) : ${JSON.stringify(entree)} — ${sortie.stderr.trim()}`);
    }
  }
} finally {
  supprimerGabarit();
}
if (fs.existsSync(GABARIT)) { echecs += 1; console.log(`ÉCHEC : gabarit temporaire non supprimé : ${GABARIT}`); }

// Lecteur absent : refus attendu (échec fermé), pour les deux agents ; aucun lecteur absent → « sans objet ».
let sansObjetLecteur = 0;
for (const A of RELECTEURS) {
  if (!LECTEUR_ABSENT) {
    sansObjetLecteur += 1;
    console.log(`SANS OBJET (aucun lecteur absent de Z à H) : ${A} Glob racine sur un lecteur absent`);
    continue;
  }
  for (const outil of ["Glob", "Grep"]) {
    const { status } = lancer(JSON.stringify({ agent_type: A, cwd: RACINE, tool_name: outil,
      tool_input: { pattern: "*", path: `${LECTEUR_ABSENT}:/x` } }));
    if (status === 2) conformes += 1;
    else { echecs += 1; console.log(`ÉCHEC (attendu 2, obtenu ${status}) : ${A} ${outil} racine ${LECTEUR_ABSENT}:/x`); }
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

// Dossiers d'état : chemins absents du disque, refusés par R1 (le refus ne dépend pas de l'existence) ; un chemin
// présent sur le disque fait échouer le cas (il ne prouverait plus rien).
for (const A of RELECTEURS) {
  for (const chemin of CHEMINS_ABSENTS) {
    if (fs.existsSync(chemin)) {
      echecs += 1;
      console.log(`ÉCHEC : chemin censé absent présent sur le disque : ${chemin}`);
      continue;
    }
    const sortie = lancer(JSON.stringify({ agent_type: A, cwd: RACINE, tool_name: "Read", tool_input: { file_path: chemin } }));
    if (sortie.status === 2 && /file_path dans un dossier interdit : C:\/Users\/romai\/\.(claude|codex) \(R1\)/.test(sortie.stderr)) {
      conformes += 1;
    } else {
      echecs += 1;
      console.log(`ÉCHEC (attendu 2, R1, chemin absent ; obtenu ${sortie.status}) : ${A} Read ${chemin} — ${sortie.stderr.trim()}`);
    }
  }
}
const p7Absents = P7_CHEMINS.filter((chemin) => !fs.existsSync(chemin));
console.log(`Chemins de P7 absents du disque pendant ce lancement : ${p7Absents.length}/${P7_CHEMINS.length}` +
  (p7Absents.length ? ` (${p7Absents.join(", ")})` : ""));

// Entrée illisible : refusée (on ne sait pas qui appelle).
if (lancer("illisible").status !== 2) { echecs += 1; console.log("ÉCHEC : entrée illisible"); } else { conformes += 1; }

const total = conformes + echecs;
const sansObjetTotal = sansObjet + sansObjetLecteur;
console.log(`${conformes}/${total} cas conformes${sansObjetTotal ? ` ; ${sansObjetTotal} cas sans objet (non comptés)` : ""}`);
process.exit(echecs === 0 ? 0 : 1);
