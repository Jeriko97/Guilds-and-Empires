#!/usr/bin/env node
// Contrôle automatique du journal de Codex après chaque relecture (décision F4 du founder du 2026-11-08, option 1 ;
// consigne 2 du founder du 2026-11-10 et arbitrage de l'arbitre du 2026-11-11, D-REPRISE-017 ; ticket L1 v18, §2 A.2).
//
// Script de contrôle, pas un hook ; rangé dans `.claude/hooks/` parce que `.gitignore` n'en versionne pas d'autre ;
// ne jamais le brancher dans `.claude/settings.json`.
//
// Limite (arbitrage de l'arbitre du 2026-11-11, Q3, citée telle quelle) : « Le contrôle cherche du texte dans les
// commandes de Codex : un chemin absolu hors de la copie de revue (lettre de lecteur, chemin réseau, forme `/x/`, `~`,
// `$HOME`, variable d'environnement), `..`, ou le nom d'un dossier interdit. Il est conservateur : les faux positifs
// sont acceptés (founder, D-REPRISE-017). Il ne voit pas un chemin construit (concaténation, encodage) ni ce qu'un
// programme lit en interne : il détecte un relecteur qui se trompe ou qui s'écarte des consignes, pas un relecteur
// qui chercherait délibérément à cacher une lecture. La garantie contre ce dernier cas est TD-039 (isolation par
// conteneur), déjà ouverte par le founder. »
//
// Liste des formes close (arbitrage du 2026-11-11, Q1.3) : aucune autre forme n'est ajoutée à ce contrôle ; une forme
// nouvelle rencontrée ensuite n'est pas un bloquant et va dans TD-039.
//
// Usage :
//   node .claude/hooks/controle-journal-codex.js <journal codex-<mode>.log> <chemin absolu de la copie de revue>
//
// Codes de sortie :
//   0 = aucune commande signalée ;
//   1 = au moins une commande signalée → relecture écartée, refaite par un Codex neuf (décision du founder) ;
//   2 = échec fermé → relecture non retenue, arbitre saisi, pas de relance : arguments manquants ou copie de revue
//       non absolue ou non normalisée, journal vide ou illisible, préambule sans la ligne
//       `OpenAI Codex v<VERSION_CODEX_VALIDEE>` (version absente ou autre) ou sans la ligne `sandbox: read-only`,
//       aucun en-tête de bloc reconnu, bloc `exec` incomplet.
//
// Format lu (relevé de l'orchestrateur sur les journaux réels ; arbitrage « rejeu » du 2026-11-09) : préambule, puis
// des blocs dont l'en-tête est une ligne seule, `user`, `codex`, `exec` ou `tokens used`, reconnue sur toute ligne,
// quelle que soit la précédente (aucune détection d'en-tête inconnu par la forme). Préambule = lignes qui précèdent
// le premier en-tête reconnu. Seuls les blocs `exec` sont analysés ; le contenu relu suit `user` et n'est jamais lu
// comme des commandes.
// Commande d'un bloc `exec` : toutes les lignes qui suivent l'en-tête, jusqu'à la première ligne terminée par
// ` in <dossier>` comprise (`<dossier>` : chemin à lettre de lecteur, `X:\…` ou `X:/…`) ; la ligne de statut et la
// sortie qui suivent ne sont jamais cherchées. Aucune ligne terminée par ` in <dossier>` avant l'en-tête suivant ou la
// fin du journal : bloc incomplet (code 2). Le texte cherché (règle (iv)) est la commande suivie de ` in <dossier>` :
// un texte placé après la dernière occurrence de ` in X:\` n'échappe pas à la recherche.
//
// Règle (arbitrage du 2026-11-11, Q1 ; ticket L1 v18, §2 A.2) :
//   (ii)  le dossier ` in <dossier>` est la copie de revue ou un de ses sous-dossiers (comparaison dossier par
//         dossier ; `<id>` ne couvre pas `<id>-x`), sinon la commande est signalée ;
//   (iii) seul préfixe exempté : le chemin exact de l'interpréteur (`PREFIXE_INTERPRETEUR`, forme brute du journal,
//         barres doublées), comparé sans casse à la ligne brute, avec ou sans guillemets, en tête de commande, avant
//         l'étape (1) ci-dessous, puis retiré une fois ; les options qui suivent restent dans le texte cherché ;
//   (iv)  recherche de texte dans le reste de la commande, n'importe où (motif de recherche compris), dans cet ordre
//         de lecture : (1) une seule fois, chaque paire `\\` du journal devient `\` ; (2) chemin réseau `\\` ou `//` ;
//         (3) ensuite seulement, `\` lu comme `/`, sans casse (une suite de plusieurs barres n'est jamais réduite) :
//         `X:/` non suivi du chemin de la copie de revue, forme Git Bash `/x/` (toujours signalée), `~`, `$home`,
//         `$env:`, `%<nom>%`, `..`, et les noms `.revue-croisee`, `instantanes/executant`, `_hors-revue`,
//         `hooks-dev`, `side-session-notes`.
// Aucune autre analyse (ni jeton, ni commande admise, ni variable).

const fs = require("fs");

// Version de Codex dont le format a été relevé (arbitrage « rejeu » du 2026-11-09) : jamais modifiée sans arbitrage.
const VERSION_CODEX_VALIDEE = "0.167.0-alpha.3.2";
const LIGNE_VERSION = /^OpenAI Codex v(\S+)$/;
const LIGNE_BAC_A_SABLE = "sandbox: read-only";
const ENTETES = ["user", "codex", "exec", "tokens used"];

// Chemin exact de l'interpréteur, tel qu'écrit dans le journal réel `codex-diff-L1.log` (relevé de l'orchestrateur,
// fait de structure ; barres doublées). Comparé sans casse, avec ou sans guillemets doubles autour.
const PREFIXE_INTERPRETEUR = "C:\\\\WINDOWS\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe";

const NOMS_INTERDITS = [".revue-croisee", "instantanes/executant", "_hors-revue", "hooks-dev", "side-session-notes"];

// Ligne terminée par ` in <dossier>` ; le `<dossier>` commence à la dernière occurrence de ` in X:\` ou ` in X:/`.
const FIN_COMMANDE = /^(.*) in ([A-Za-z]:[\\/].*)$/;

// ---------------------------------------------------------------------------------------------------------------
// Ordre de lecture du texte.

// Étape (1) : une seule fois, chaque paire `\\` devient `\` (de gauche à droite, sans chevauchement).
function desechapper(texte) {
  return texte.replace(/\\\\/g, "\\");
}

// Étape (3) : `\` lu comme `/`, sans casse. Aucune suite de barres n'est réduite.
function normaliser(texte) {
  return texte.replace(/\\/g, "/").toLowerCase();
}

// Copie de revue normalisée (argument) : `x:/a/b`, sans barre finale.
function normaliserCopie(chemin) {
  return normaliser(chemin).replace(/\/+$/, "");
}

// Le texte qui commence à `debut` est-il le chemin de la copie de revue, suivi de la fin du texte ou de `/` ?
// (comparaison dossier par dossier : `<id>` ne couvre pas `<id>-x`).
function suiviDeLaCopie(texte, debut, copie) {
  if (!texte.startsWith(copie, debut)) return false;
  const suite = texte.charAt(debut + copie.length);
  return suite === "" || suite === "/";
}

// Retire le préfixe d'interpréteur exempté, s'il est en tête de la commande brute (étape (iii)).
function retirerPrefixe(brut) {
  const minuscule = brut.toLowerCase();
  const prefixe = PREFIXE_INTERPRETEUR.toLowerCase();
  for (const forme of [`"${prefixe}"`, prefixe]) {
    if (!minuscule.startsWith(forme)) continue;
    const suite = brut.charAt(forme.length);
    if (suite === "" || /\s/.test(suite)) return { reste: brut.slice(forme.length), retire: true };
  }
  return { reste: brut, retire: false };
}

// Motifs trouvés dans un texte de commande (après retrait éventuel du préfixe), selon l'ordre de lecture.
function motifsCommande(brut, copie) {
  const motifs = [];
  const etape1 = desechapper(brut);
  if (etape1.includes("\\\\") || etape1.includes("//")) motifs.push("chemin réseau (\\\\ ou //)");
  const t = normaliser(etape1);
  const lecteur = /[a-z]:\//g;
  let m;
  while ((m = lecteur.exec(t)) !== null) {
    if (!suiviDeLaCopie(t, m.index, copie)) {
      motifs.push(`chemin absolu hors de la copie (${t.slice(m.index, m.index + 3)})`);
      break;
    }
  }
  if (/\/[a-z]\//.test(t)) motifs.push("forme /x/ (Git Bash)");
  if (t.includes("~")) motifs.push("~");
  if (t.includes("$home")) motifs.push("$HOME");
  if (t.includes("$env:")) motifs.push("$env:");
  if (/%[\p{L}\p{N}_]+%/u.test(t)) motifs.push("%nom%");
  if (t.includes("..")) motifs.push("..");
  for (const nom of NOMS_INTERDITS) if (t.includes(nom)) motifs.push(`nom interdit ${nom}`);
  return motifs;
}

// Le dossier ` in <dossier>` est-il la copie de revue ou un de ses sous-dossiers (règle (ii)) ?
function dossierDansCopie(dossierBrut, copie) {
  const etape1 = desechapper(dossierBrut);
  if (etape1.includes("\\\\") || etape1.includes("//")) return false;
  const d = normaliser(etape1).replace(/\/+$/, "");
  if (d.split("/").some((s) => s === "." || s === "..")) return false;
  return suiviDeLaCopie(d, 0, copie);
}

// ---------------------------------------------------------------------------------------------------------------
// Lecture du journal.

function controlerJournal(texte, copie) {
  const lignes = texte.split(/\r?\n/);
  const signalements = [];
  const echecs = [];
  let blocs = 0;
  const premier = lignes.findIndex((l) => ENTETES.includes(l));
  if (premier === -1) echecs.push("aucun en-tête de bloc reconnu (user, codex, exec, tokens used)");
  const preambule = premier === -1 ? lignes : lignes.slice(0, premier);
  // Préambule : version de Codex (verrou) et bac à sable.
  const versions = [];
  preambule.forEach((l, rang) => {
    const v = LIGNE_VERSION.exec(l);
    if (v) versions.push({ valeur: v[1], ligne: rang + 1 });
  });
  if (versions.length === 0) echecs.push("version de Codex absente du préambule");
  for (const v of versions) {
    if (v.valeur !== VERSION_CODEX_VALIDEE) {
      echecs.push(`ligne ${v.ligne} : version de Codex non validée : ${v.valeur} (validée : ${VERSION_CODEX_VALIDEE})`);
    }
  }
  if (!preambule.includes(LIGNE_BAC_A_SABLE)) echecs.push(`ligne « ${LIGNE_BAC_A_SABLE} » absente du préambule`);

  // Blocs `exec` : en-tête reconnu sur toute ligne, quelle que soit la précédente.
  for (let i = 0; i < lignes.length; i += 1) {
    if (lignes[i] !== "exec") continue;
    const commande = [];
    let fin = null;
    let j = i + 1;
    for (; j < lignes.length; j += 1) {
      const l = lignes[j];
      if (ENTETES.includes(l)) break;
      const m = FIN_COMMANDE.exec(l);
      if (m) {
        commande.push(m[1]);
        fin = { dossier: m[2], ligne: j + 1 };
        break;
      }
      commande.push(l);
    }
    if (fin === null) {
      echecs.push(`ligne ${i + 1} : bloc exec incomplet (aucune ligne terminée par « in <dossier> » avant l'en-tête suivant ou la fin du journal)`);
      continue;
    }
    blocs += 1;
    const brut = commande.join("\n");
    const { reste } = retirerPrefixe(brut);
    // Le texte cherché comprend le dossier : rien de ce qui suit ` in ` n'échappe à la recherche (règle (iv)).
    const motifs = motifsCommande(`${reste} in ${fin.dossier}`, copie);
    if (!dossierDansCopie(fin.dossier, copie)) motifs.unshift(`dossier hors de la copie (${fin.dossier})`);
    if (motifs.length) {
      signalements.push(`ligne ${i + 2} : ${motifs.join(" ; ")} — ${brut.replace(/\n/g, "⏎")} in ${fin.dossier}`);
    }
    i = j;
  }
  const version = versions.length ? [...new Set(versions.map((v) => v.valeur))].join(", ") : "(absente)";
  return { blocs, signalements, echecs, version };
}

// Copie de revue admise en argument : chemin absolu `X:\…` ou `X:/…`, sans segment `.` ni `..`, sans `//` intérieur.
function copieValide(chemin) {
  if (!/^[A-Za-z]:[\\/]/.test(chemin)) return false;
  const n = normaliser(chemin).replace(/\/+$/, "");
  if (n.slice(2).includes("//")) return false;
  return !n.split("/").some((s) => s === "." || s === "..");
}

function principal(argv) {
  const [journal, copie] = argv;
  if (!journal || !copie || argv.length !== 2) {
    process.stdout.write("Usage : node controle-journal-codex.js <journal> <copie de revue>\nCode : 2 (arguments)\n");
    return 2;
  }
  if (!copieValide(copie)) {
    process.stdout.write(`Copie de revue non absolue ou non normalisée : ${copie}\nCode : 2\n`);
    return 2;
  }
  let texte;
  try {
    texte = fs.readFileSync(journal, "utf8");
  } catch (erreur) {
    process.stdout.write(`Journal illisible : ${journal} (${erreur && erreur.code})\nCode : 2\n`);
    return 2;
  }
  if (texte.trim() === "") {
    process.stdout.write(`Journal vide : ${journal}\nCode : 2\n`);
    return 2;
  }
  const { blocs, signalements, echecs, version } = controlerJournal(texte, normaliserCopie(copie));
  const code = echecs.length ? 2 : signalements.length ? 1 : 0;
  const sortie = [
    `Contrôle du journal de Codex : ${journal}`,
    `Copie de revue : ${copie}`,
    `Version de Codex : ${version}`,
    ...signalements,
    `Blocs exec analysés : ${blocs}`,
    `Commandes signalées : ${signalements.length}`,
  ];
  if (echecs.length) sortie.push(`Échecs fermés : ${echecs.length}`, ...echecs);
  sortie.push(`Code : ${code}`);
  process.stdout.write(`${sortie.join("\n")}\n`);
  return code;
}

if (require.main === module) {
  let code;
  try {
    code = principal(process.argv.slice(2));
  } catch (erreur) {
    process.stdout.write(`Erreur du contrôle : ${erreur && erreur.message}\nCode : 2\n`);
    code = 2;
  }
  process.exit(code);
}

module.exports = { controlerJournal, motifsCommande, retirerPrefixe, dossierDansCopie, normaliserCopie };
