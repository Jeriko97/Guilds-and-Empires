#!/usr/bin/env node
// Hook PreToolUse du projet (.claude/settings.json) : filtre de lecture commun aux relecteurs Claude, les agents
// `auditeur` et `arbitre-strategique` (D-REPRISE-007, D-REPRISE-013 item (i), arbitrages de l'arbitre du 2026-11-08 :
// Q3, Q5, remarque 4 ; ticket L1). Nom du fichier gardé (`.claude/agents/arbitre-strategique.md` le cite).
// Il ne s'applique qu'aux appels dont `agent_type` est l'un de ces deux agents ; tout autre appel passe (session
// principale comprise : l'orchestrateur garde l'accès aux transcriptions, contrôle `systemHash`, `CLAUDE.md` §d).
// Ces deux agents n'ont que Read, Grep et Glob ; le matcher de settings.json ne transmet que Read|Grep|Glob : le
// refus de tout autre outil ne sert que si ce matcher est élargi (défense en profondeur, testée sur le script).
// Entrée : JSON du hook sur stdin ({ agent_type, cwd, tool_name, tool_input }).
// Sortie : code 0 = appel autorisé ; code 2 = refusé (le message sur stderr est renvoyé à l'agent).
// Échec fermé : toute erreur donne le code 2 (et l'appel de settings.json ajoute « || exit 2 » et `onFailure: block`).
//
// Règles (ticket L1, §1 A.1) :
// - formes admises, liste fermée, pour `file_path`, `path` et `cwd` : chemin absolu `X:/…` ou `X:\…`, ou chemin
//   relatif sans séparateur en tête et sans `:` ; tout le reste est refusé avant toute normalisation (`~` en tête,
//   `\…` et `/…`, `X:` sans séparateur, `:` ailleurs qu'en deuxième caractère, `?` ou `*`) ; pour toute valeur
//   (chemin ou motif), un segment terminé par `.` ou par une espace, autre que `.` et `..`, est refusé ;
// - normalisation : sans casse, `\` lu comme `/`, chemin relatif résolu contre le `cwd`, `.`, `..` et `//` résolus ;
//   puis chemin réel (`fs.realpathSync.native` sur l'ancêtre existant le plus profond, reste rajouté tel quel) pour
//   couvrir jonctions et liens ; R1 et R2 s'appliquent au chemin normalisé ET au chemin réel ; échec → refus ;
// - Read, R1 : refus si le chemin est un dossier interdit ou se trouve dedans ;
// - Glob et Grep : racine de recherche = `path`, à défaut le `cwd` ; R1 : racine dans un dossier interdit ;
//   R2 : racine parente d'un dossier interdit (dont la racine du dépôt principal et ses parents) ; R3 : motif
//   (`pattern` de Glob, `glob` de Grep, chaque alternative après développement des accolades) absolu, commençant
//   par un lecteur, `/` ou `\`, ou contenant un segment `..` ;
// - tous les appels, R4 : motif ou chemin contenant `.revue-croisee`, `.claude/instantanes/executant` ou un nom
//   court `~` suivi d'un chiffre, ou motif dont un segment à jokers (autre que `*` ou `**` seuls) peut désigner
//   `.revue-croisee`, `instantanes` ou `executant` ; R5 : `cwd` dans un dossier interdit ;
// - motifs : `~` en tête refusé ; négation `!` toujours refusée ; accolades développées (non appariées, à une seule
//   alternative, ou plus de 256 alternatives → refus) ; le `pattern` de Grep (expression cherchée dans le contenu)
//   n'est pas contrôlé ; le paramètre `type` de Grep ne change pas la racine.
// Hors de R3 et R4, aucun autre examen du motif : un outil ne cherche que sous sa racine, et une racine qui n'est
// parente d'aucun dossier interdit ne peut pas en atteindre un.

const fs = require("fs");

const AGENTS_FILTRES = ["auditeur", "arbitre-strategique"];

// Dossiers interdits — chemins absolus propres à CE poste et à CE compte Windows (`romai`) : à refaire sur tout
// nouveau poste (TD-031 ; même logique que D-REPRISE-006). Sur un autre poste, le filtre serait silencieusement
// incomplet.
const DEPOT_PRINCIPAL = "G:/Unity/GuildsAndEmpires";
const DOSSIER_SORTIES_RELECTEURS = "G:/Unity/GuildsAndEmpires/.revue-croisee";
const DOSSIER_EXECUTANT = "G:/Unity/GuildsAndEmpires/.claude/instantanes/executant";
const DOSSIER_HORS_REVUE = "G:/Unity/_hors-revue";
const DOSSIER_NOTES_SESSIONS = "C:/Users/romai/AppData/Roaming/Claude/side-session-notes";
const DOSSIER_TRANSCRIPTIONS_CODEX = "C:/Users/romai/.codex/sessions";
const DOSSIER_TRANSCRIPTIONS_CLAUDE = "C:/Users/romai/.claude/projects";
const DOSSIER_TEMPORAIRE_SESSIONS = "C:/Users/romai/AppData/Local/Temp/claude";
// Dossier de travail des fichiers protégés (consigne 1 du founder du 2026-11-10, D-REPRISE-017), partie du dossier de
// l'exécutant élargi (ticket L1 v18, §0 et §2 A.1) : constante absolue, jamais déduite de l'emplacement du script.
const DOSSIER_TRAVAIL_PROTEGES = "G:/Unity/GuildsAndEmpires/.claude/hooks-dev";
const DOSSIERS_INTERDITS = [
  DOSSIER_SORTIES_RELECTEURS,
  DOSSIER_EXECUTANT,
  DOSSIER_HORS_REVUE,
  DOSSIER_NOTES_SESSIONS,
  DOSSIER_TRANSCRIPTIONS_CODEX,
  DOSSIER_TRANSCRIPTIONS_CLAUDE,
  DOSSIER_TEMPORAIRE_SESSIONS,
  DOSSIER_TRAVAIL_PROTEGES,
];
// Noms interdits à toute profondeur (R4), et noms qu'un segment à jokers ne doit pas pouvoir désigner.
const NOMS_INTERDITS = [".revue-croisee", ".claude/instantanes/executant"];
const NOMS_VISES_PAR_JOKER = [".revue-croisee", "instantanes", "executant"];
const MAX_ALTERNATIVES = 256;

// Seuls outils admis pour ces deux agents. Champs contrôlés : `file_path` (Read), `path` et `pattern` (Glob), `path`
// et `glob` (Grep) ; le `pattern` de Grep, expression cherchée dans le contenu, ne l'est pas.
const OUTILS = ["Read", "Grep", "Glob"];

class Refus extends Error {}

function refuser(raison) {
  throw new Refus(raison);
}

function ecrireRefus(raison) {
  process.stderr.write(
    `Refusé par le filtre de lecture des relecteurs (auditeur, arbitre) : ${raison}. ` +
    "Interdits : sorties des relecteurs (.revue-croisee), dossier de l'exécutant (dont .claude/hooks-dev), " +
    "dossier déplacé hors revue, " +
    "transcriptions et dossiers temporaires des sessions. Glob et Grep : donner un `path` précis — racine du " +
    "worktree de revue, ou sous-dossier du dépôt (docs, Assets, firebase, .claude/skills, .claude/hooks, " +
    ".claude/agents, .claude/instantanes/revue, .claude/instantanes/cloture…) —, jamais la racine du dépôt ni un de " +
    "ses parents ; motif relatif, sans `..` ni `!`. Agents, hooks et skills : les lire par Read.\n");
  process.exit(2);
}

// Formes admises (liste fermée) pour `file_path`, `path` et `cwd`, contrôlées avant toute normalisation.
function controlerFormeChemin(champ, valeur) {
  if (typeof valeur !== "string" || valeur === "") refuser(`${champ} absent ou vide`);
  if (valeur.startsWith("~")) refuser(`${champ} commençant par ~`);
  if (/^[\\/]/.test(valeur)) refuser(`${champ} commençant par \\ ou / (chemin réseau, préfixe \\\\?\\ ou racine du lecteur courant)`);
  if (/[?*]/.test(valeur)) refuser(`${champ} contenant ? ou *`);
  if (/^[A-Za-z]:/.test(valeur)) {
    if (!/^[A-Za-z]:[\\/]/.test(valeur)) refuser(`${champ} relatif à un lecteur (X: sans séparateur)`);
    if (valeur.indexOf(":", 2) !== -1) refuser(`${champ} avec « : » ailleurs qu'en deuxième caractère`);
  } else if (valeur.includes(":")) {
    refuser(`${champ} relatif contenant « : »`);
  }
  controlerSegments(champ, valeur);
}

// Pour toute valeur : segment terminé par `.` ou par une espace (autre que `.` et `..`) refusé, avant résolution.
function controlerSegments(champ, valeur) {
  for (const segment of valeur.split(/[\\/]/)) {
    if (segment !== "." && segment !== ".." && /[. ]$/.test(segment)) {
      refuser(`${champ} : segment « ${segment} » terminé par un point ou une espace`);
    }
  }
}

// Segments en minuscules, `\` lu comme `/`, segments vides (`//`) retirés.
function segmentsBruts(valeur) {
  return String(valeur).replace(/\\/g, "/").toLowerCase().split("/").filter((s) => s !== "");
}

// Résolution de `.` et `..` (au-delà de la racine du lecteur → refus).
function resoudreSegments(segments, champ) {
  const resultat = [];
  for (const segment of segments) {
    if (segment === ".") continue;
    if (segment === "..") {
      if (resultat.length <= 1) refuser(`${champ} : « .. » au-delà de la racine du lecteur`);
      resultat.pop();
      continue;
    }
    resultat.push(segment);
  }
  return resultat;
}

function estAbsolu(valeur) {
  return /^[A-Za-z]:[\\/]/.test(valeur);
}

// Chemin normalisé (segments) d'une valeur de forme admise, résolue contre le cwd si elle est relative.
function normaliser(valeur, segmentsCwd, champ) {
  const segments = estAbsolu(valeur) ? segmentsBruts(valeur) : [...segmentsCwd, ...segmentsBruts(valeur)];
  return resoudreSegments(segments, champ);
}

function cheminWindows(segments) {
  return segments.length === 1 ? `${segments[0]}\\` : segments.join("\\");
}

// Chemin réel : `fs.realpathSync.native` sur l'ancêtre existant le plus profond, le reste rajouté tel quel.
// Toute erreur autre que « n'existe pas » → refus (échec fermé).
function cheminReel(segments, champ) {
  for (let i = segments.length; i >= 1; i -= 1) {
    const candidat = cheminWindows(segments.slice(0, i));
    try {
      fs.statSync(candidat);
    } catch (erreur) {
      if (erreur && (erreur.code === "ENOENT" || erreur.code === "ENOTDIR")) continue;
      refuser(`${champ} : résolution du chemin réel impossible (${erreur && erreur.code})`);
    }
    let reel;
    try {
      reel = fs.realpathSync.native(candidat);
    } catch (erreur) {
      refuser(`${champ} : résolution du chemin réel impossible (${erreur && erreur.code})`);
    }
    reel = String(reel).replace(/^\\\\\?\\/, "");
    if (!estAbsolu(reel)) refuser(`${champ} : chemin réel hors des formes admises`);
    return [...resoudreSegments(segmentsBruts(reel), champ), ...segments.slice(i)];
  }
  refuser(`${champ} : aucun ancêtre existant, chemin réel introuvable`);
}

function dansOuEgal(segments, base) {
  return base.length <= segments.length && base.every((s, i) => segments[i] === s);
}

function parentStrict(segments, base) {
  return segments.length < base.length && segments.every((s, i) => base[i] === s);
}

// Dossiers interdits normalisés, et leur chemin réel quand il diffère (jonction ou lien).
function dossiersInterditsResolus() {
  const liste = [];
  for (const dossier of DOSSIERS_INTERDITS) {
    const segments = segmentsBruts(dossier);
    liste.push({ nom: dossier, segments });
    try {
      const reel = cheminReel(segments, "dossier interdit");
      if (reel.join("/") !== segments.join("/")) liste.push({ nom: `${dossier} (chemin réel)`, segments: reel });
    } catch {
      // Constante sans chemin réel résoluble : seule sa forme écrite est comparée.
    }
  }
  return liste;
}

// R4 sur un chemin : nom interdit (brut ou résolu) ou nom court Windows.
function controlerNomsChemin(champ, valeur, segmentsResolus) {
  const formes = [segmentsBruts(valeur).join("/"), segmentsResolus.join("/")];
  for (const forme of formes) {
    for (const nom of NOMS_INTERDITS) if (forme.includes(nom)) refuser(`${champ} contenant ${nom} (R4)`);
    if (/~\d/.test(forme)) refuser(`${champ} contenant un nom court Windows (~ suivi d'un chiffre, R4)`);
  }
}

// R1 : chemin (normalisé et réel) dans un dossier interdit ou égal à lui.
function controlerR1(champ, variantes, interdits) {
  variantes.forEach((segments, rang) => {
    const libelle = rang === 0 ? champ : `${champ} (chemin réel)`;
    for (const interdit of interdits) {
      if (dansOuEgal(segments, interdit.segments)) refuser(`${libelle} dans un dossier interdit : ${interdit.nom} (R1)`);
    }
  });
}

// R2 : racine de recherche (normalisée et réelle) parente d'un dossier interdit ou de la racine du dépôt principal.
function controlerR2(variantes, interdits) {
  const depot = segmentsBruts(DEPOT_PRINCIPAL);
  variantes.forEach((segments, rang) => {
    const libelle = rang === 0 ? "racine de recherche" : "racine de recherche (chemin réel)";
    if (dansOuEgal(depot, segments)) {
      refuser(`${libelle} égale à la racine du dépôt principal ou à un de ses parents (R2)`);
    }
    for (const interdit of interdits) {
      if (parentStrict(segments, interdit.segments)) {
        refuser(`${libelle} parente d'un dossier interdit : ${interdit.nom} (R2)`);
      }
    }
  });
}

// Développement des accolades : `a{b,c}d` → `abd`, `acd` ; imbrication admise ; non appariées, à une seule
// alternative, ou plus de MAX_ALTERNATIVES alternatives → refus.
function developperAccolades(motif) {
  const ouverture = motif.indexOf("{");
  if (ouverture === -1) {
    if (motif.includes("}")) refuser("motif à accolades non appariées");
    return [motif];
  }
  if (motif.slice(0, ouverture).includes("}")) refuser("motif à accolades non appariées");
  let profondeur = 0;
  let fermeture = -1;
  const virgules = [];
  for (let i = ouverture; i < motif.length; i += 1) {
    const c = motif[i];
    if (c === "{") profondeur += 1;
    else if (c === "}") {
      profondeur -= 1;
      if (profondeur === 0) { fermeture = i; break; }
    } else if (c === "," && profondeur === 1) virgules.push(i);
  }
  if (fermeture === -1) refuser("motif à accolades non appariées");
  if (virgules.length === 0) refuser("motif à accolades à une seule alternative (non développable)");
  const bornes = [ouverture, ...virgules, fermeture];
  const avant = motif.slice(0, ouverture);
  const apres = motif.slice(fermeture + 1);
  const resultat = [];
  for (let k = 0; k + 1 < bornes.length; k += 1) {
    const alternative = motif.slice(bornes[k] + 1, bornes[k + 1]);
    for (const developpe of developperAccolades(avant + alternative + apres)) {
      resultat.push(developpe);
      if (resultat.length > MAX_ALTERNATIVES) refuser(`motif à plus de ${MAX_ALTERNATIVES} alternatives`);
    }
  }
  return resultat;
}

// Un segment à jokers (`*`, `?`, `[…]`), autre que `*` ou `**` seuls, peut-il désigner un nom visé ?
function segmentPeutViser(segment) {
  if (segment === "*" || segment === "**" || !/[*?[]/.test(segment)) return false;
  const motif = segment.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  let expression;
  try { expression = new RegExp(`^${motif}$`); } catch { return true; }
  return NOMS_VISES_PAR_JOKER.some((nom) => expression.test(nom));
}

// Motif (`pattern` de Glob, `glob` de Grep) : `~` en tête, `!`, accolades, R3, R4.
function controlerMotif(champ, motif) {
  if (typeof motif !== "string" || motif === "") refuser(`${champ} absent ou vide`);
  if (motif.startsWith("~")) refuser(`${champ} commençant par ~`);
  if (motif.includes("!")) refuser(`${champ} : négation « ! » toujours refusée`);
  for (const alternative of developperAccolades(motif)) {
    const a = alternative.replace(/\\/g, "/");
    if (/^[A-Za-z]:/.test(a) || a.startsWith("/")) refuser(`${champ} absolu ou commençant par un lecteur, / ou \\ (R3)`);
    const segments = a.split("/");
    if (segments.includes("..")) refuser(`${champ} contenant un segment « .. » (R3)`);
    controlerSegments(champ, a);
    const minuscule = a.toLowerCase();
    for (const nom of NOMS_INTERDITS) if (minuscule.includes(nom)) refuser(`${champ} contenant ${nom} (R4)`);
    if (/~\d/.test(minuscule)) refuser(`${champ} contenant un nom court Windows (~ suivi d'un chiffre, R4)`);
    for (const segment of minuscule.split("/")) {
      if (segmentPeutViser(segment)) refuser(`${champ} : segment à jokers « ${segment} » pouvant désigner un dossier interdit (R4)`);
    }
  }
}

// Contrôle d'un chemin (`file_path`, `path`, `cwd`) : forme, normalisation, chemin réel, R4 ; renvoie les variantes.
function cheminControle(champ, valeur, segmentsCwd) {
  controlerFormeChemin(champ, valeur);
  if (!estAbsolu(valeur) && !segmentsCwd) refuser(`${champ} relatif sans cwd absolu`);
  const normalise = normaliser(valeur, segmentsCwd, champ);
  controlerNomsChemin(champ, valeur, normalise);
  const reel = cheminReel(normalise, champ);
  controlerNomsChemin(`${champ} (chemin réel)`, reel.join("/"), reel);
  return [normalise, reel];
}

function filtrer(donnees) {
  if (!AGENTS_FILTRES.includes(donnees.agent_type)) return;
  const outil = donnees.tool_name;
  if (!OUTILS.includes(outil)) refuser(`outil « ${outil} » non autorisé`);
  const entree = donnees.tool_input && typeof donnees.tool_input === "object" ? donnees.tool_input : {};
  const interdits = dossiersInterditsResolus();

  // cwd : forme absolue obligatoire, R4, R5.
  const cwd = donnees.cwd;
  if (typeof cwd !== "string" || !estAbsolu(cwd)) refuser("cwd absent ou non absolu");
  const variantesCwd = cheminControle("cwd", cwd, null);
  variantesCwd.forEach((segments, rang) => {
    const libelle = rang === 0 ? "dossier courant" : "dossier courant (chemin réel)";
    for (const interdit of interdits) {
      if (dansOuEgal(segments, interdit.segments)) refuser(`${libelle} dans un dossier interdit : ${interdit.nom} (R5)`);
    }
  });
  const segmentsCwd = variantesCwd[0];

  if (outil === "Read") {
    const variantes = cheminControle("file_path", entree.file_path, segmentsCwd);
    controlerR1("file_path", variantes, interdits);
    return;
  }

  // Glob et Grep.
  let racine = variantesCwd;
  if (entree.path !== undefined) {
    racine = cheminControle("path", entree.path, segmentsCwd);
  }
  controlerR1("racine de recherche", racine, interdits);
  controlerR2(racine, interdits);
  if (outil === "Glob") controlerMotif("pattern", entree.pattern);
  if (outil === "Grep" && entree.glob !== undefined) controlerMotif("glob", entree.glob);
}

let entree = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (morceau) => { entree += morceau; });
process.stdin.on("end", () => {
  try {
    filtrer(JSON.parse(entree));
    process.exit(0);
  } catch (erreur) {
    ecrireRefus(erreur instanceof Refus ? erreur.message : "entrée du hook illisible ou erreur du filtre");
  }
});
process.on("uncaughtException", () => ecrireRefus("erreur du filtre"));
