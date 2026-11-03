#!/usr/bin/env node
// Hook PreToolUse du projet (.claude/settings.json), filtre de l'agent arbitre-strategique (D-REPRISE-007).
// Il ne s'applique qu'aux appels de l'arbitre (champ `agent_type` de l'entrée) ; tout autre appel passe.
// L'arbitre n'a que Read, Grep et Glob ; ce filtre lui interdit en plus de lire `.revue-croisee/` (sorties des autres
// relecteurs). Le matcher de settings.json ne lui transmet que Read|Grep|Glob : le refus de tout autre outil ne sert
// que si ce matcher est élargi (défense en profondeur, testée seulement sur le script).
// Entrée : JSON du hook sur stdin ({ agent_type, cwd, tool_name, tool_input }).
// Sortie : code 0 = appel autorisé ; code 2 = refusé (le message sur stderr est renvoyé à l'agent).
// Échec fermé : toute erreur donne le code 2 (et l'appel de settings.json ajoute « || exit 2 » et `onFailure: block`).

const AGENT = "arbitre-strategique";
// Dossier des sorties des relecteurs, interdit de lecture à l'arbitre.
const DOSSIER_INTERDIT = ".revue-croisee";
// Champs de chemin contrôlés, par outil de lecture (le `pattern` de Grep, expression sur le contenu, ne l'est pas).
const CHAMPS_DE_CHEMIN = {
  Read: ["file_path"],
  Grep: ["path", "glob"],
  Glob: ["path", "pattern"],
};

function refuser(raison) {
  process.stderr.write(`Refusé par le filtre de l'arbitre : ${raison}. L'arbitre lit le dépôt avec Read, Grep et ` +
    `Glob, jamais ${DOSSIER_INTERDIT}/ (sorties des autres relecteurs).\n`);
  process.exit(2);
}

// Sans tenir compte de la casse, `\` lu comme `/`.
function normaliser(valeur) {
  return String(valeur).replace(/\\/g, "/").toLowerCase();
}

// Un chemin ou un motif vise le dossier interdit s'il le contient, s'il contient un nom court Windows (`~` suivi
// d'un chiffre, ex. `REVUE-~1`), une accolade ou une négation `!` (motifs non analysés), ou si l'un de ses segments
// à jokers (`*`, `?`, `[…]`), autre que `*` ou `**` seuls, peut le désigner.
function viseDossierInterdit(valeur) {
  const v = normaliser(valeur);
  if (v.includes(DOSSIER_INTERDIT) || /~\d/.test(v) || /[{}!]/.test(v)) return true;
  return v.split("/").some((segment) => {
    if (segment === "*" || segment === "**" || !/[*?[]/.test(segment)) return false;
    const motif = segment.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
    try { return new RegExp(`^${motif}$`).test(DOSSIER_INTERDIT); } catch { return true; }
  });
}

let entree = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (morceau) => { entree += morceau; });
process.stdin.on("end", () => {
  try {
    const donnees = JSON.parse(entree);
    if (donnees.agent_type !== AGENT) process.exit(0);
    const outil = donnees.tool_name;
    if (!CHAMPS_DE_CHEMIN[outil]) refuser(`outil « ${outil} » non autorisé`);
    if (normaliser(donnees.cwd ?? "").includes(DOSSIER_INTERDIT)) refuser(`dossier courant dans ${DOSSIER_INTERDIT}/`);
    const champs = CHAMPS_DE_CHEMIN[outil].map((c) => donnees.tool_input?.[c]).filter((v) => typeof v === "string");
    if (champs.some(viseDossierInterdit)) refuser(`${outil} sur ${DOSSIER_INTERDIT}/`);
    process.exit(0);
  } catch {
    refuser("entrée du hook illisible ou erreur du filtre");
  }
});
process.on("uncaughtException", () => refuser("erreur du filtre"));
