#!/usr/bin/env node
// Jeu de tests du contrôle du journal de Codex (controle-journal-codex.js) : à rejouer à chaque modification.
// Lancement : node .claude/hooks/controle-journal-codex.test.js  → code 0 si tous les cas donnent le code attendu.
// Ticket L1 v18, §2 A.2 : un cas au moins par règle. Journaux d'essai construits ici : préambule, en-têtes, blocs
// `exec` (commande, « in <dossier> », statut, sortie d'essai) ; aucun message, verdict ni contenu relu de Codex.
// Les commandes sont écrites comme dans le journal réel : interpréteur entre guillemets, barres doublées.

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPT = path.join(__dirname, "controle-journal-codex.js");
const WT = String.raw`G:\Unity\_revues\GuildsAndEmpires\essai-L1s`;
const PS = String.raw`"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"`;

// Préambule réel, copié tel quel de l'extrait des en-têtes du journal de Codex (`entetes-journal-codex.txt`,
// orchestrateur, 2026-11-08 ; structure seulement).
const PREAMBULE_REEL = String.raw`Reading additional input from stdin...
OpenAI Codex v0.167.0-alpha.3.2
--------
workdir: G:\Unity\GuildsAndEmpires
model: gpt-6.1-sol
provider: openai
approval: never
sandbox: read-only
reasoning effort: high
reasoning summaries: none
session id: <uuid>
--------`;
const PREAMBULE = PREAMBULE_REEL.replace("workdir: G:\\Unity\\GuildsAndEmpires", `workdir: ${WT}`).split("\n");

// Ligne `exec` réelle, recopiée telle quelle du journal `codex-diff-L1.log` (casse et guillemets d'origine ; remise
// par l'orchestrateur dans `ligne-exec-reelle.txt`) ; sa copie de revue est `L1-diff-1`.
const LIGNE_REELLE = String.raw`"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command "Get-Content -LiteralPath 'docs/sessions/BRIEFING-claude-code.md' -Encoding UTF8 -TotalCount 220; Get-Content -LiteralPath 'docs/skills/unity-mobile-gameplay-engineer/SKILL.md' -Encoding UTF8; Get-Content -LiteralPath 'docs/design/phase-1-economy-values.md' -Encoding UTF8; Get-Content -LiteralPath 'CLAUDE.md' -Encoding UTF8; rg --files docs/skills/unity-firebase-architect/references" in G:\Unity\_revues\GuildsAndEmpires\L1-diff-1`;
const WT_REEL = String.raw`G:\Unity\_revues\GuildsAndEmpires\L1-diff-1`;

const EN_TETE_USER = "user";
const EN_TETE_CODEX = "codex";
const EN_TETE_EXEC = "exec";
const EN_TETE_FIN = "tokens used";

// Commande dans l'enveloppe réelle.
const cmd = (script) => `${PS} -NoProfile -Command "${script}"`;

// Journal : préambule, `user` + consigne d'essai, puis pour chaque élément un bloc `exec` (commande en une ou
// plusieurs lignes, « in <dossier> », statut, sortie), `codex`, `tokens used`.
// Élément : chaîne (commande), ou { lignes: [...], dossier, sortie: [...] }.
function journal(elements, extra = {}) {
  const lignes = [...(extra.preambule ?? PREAMBULE), EN_TETE_USER, "consigne d'essai", "<stdin>", "contenu d'essai", "</stdin>"];
  for (const e of elements) {
    const el = typeof e === "string" ? { lignes: [e] } : e;
    const corps = [...el.lignes];
    corps[corps.length - 1] = `${corps[corps.length - 1]} in ${el.dossier ?? WT}`;
    lignes.push(EN_TETE_EXEC, ...corps, " succeeded in 12ms:", ...(el.sortie ?? ["sortie d'essai"]));
  }
  lignes.push(EN_TETE_CODEX, "message d'essai", EN_TETE_FIN, "1234");
  return `${lignes.join("\n")}\n`;
}

const dossierEssai = fs.mkdtempSync(path.join(os.tmpdir(), "controle-journal-"));
let numero = 0;
function lancer(texte, copie) {
  numero += 1;
  const fichier = path.join(dossierEssai, `codex-essai-${numero}.log`);
  if (texte !== null) fs.writeFileSync(fichier, texte, "utf8");
  return spawnSync(process.execPath, [SCRIPT, fichier, copie], { encoding: "utf8" });
}

// [code attendu, libellé, journal, copie, textes attendus dans la sortie]
const CAS = [];
const cas = (code, libelle, texte, attendus = [], copie = WT) => CAS.push([code, libelle, texte, copie, attendus]);
const admis = (libelle, script) => cas(0, libelle, journal([cmd(script)]), ["Blocs exec analysés : 1", "Commandes signalées : 0"]);
const signale = (libelle, script, motif) => cas(1, libelle, journal([cmd(script)]), ["Commandes signalées : 1", motif]);

// --- En-tête réel, journal sans bloc `exec`, ligne réelle (code 0).
cas(0, "préambule réel, en-tête codex, zéro bloc exec", `${PREAMBULE_REEL}\n${EN_TETE_USER}\nconsigne\n${EN_TETE_CODEX}\nmessage\n${EN_TETE_FIN}\n1234\n`,
  ["Version de Codex : 0.167.0-alpha.3.2", "Blocs exec analysés : 0", "Commandes signalées : 0"]);
cas(0, "ligne exec réelle (codex-diff-L1.log)", journal([{ lignes: [LIGNE_REELLE.replace(/ in G:\\Unity\\_revues\\GuildsAndEmpires\\L1-diff-1$/, "")], dossier: WT_REEL }]),
  ["Blocs exec analysés : 1", "Commandes signalées : 0"], WT_REEL);
cas(0, "ligne exec réelle, copiée telle quelle", `${PREAMBULE.join("\n")}\n${EN_TETE_USER}\nconsigne\n${EN_TETE_EXEC}\n${LIGNE_REELLE}\n succeeded in 12ms:\nsortie\n${EN_TETE_FIN}\n1\n`,
  ["Blocs exec analysés : 1", "Commandes signalées : 0"], WT_REEL);

// --- Admis : chemins relatifs, chemin absolu dans la copie (`\`, `\\` du journal, `/`, lettre minuscule).
admis("chemin relatif", "Get-Content -LiteralPath 'docs/a.md'; rg --files docs/skills");
admis("chemin absolu dans la copie, barres doublées du journal", String.raw`Get-Content 'G:\\Unity\\_revues\\GuildsAndEmpires\\essai-L1s\\docs\\a.md'`);
admis("chemin absolu dans la copie, barre simple", String.raw`Get-Content 'G:\Unity\_revues\GuildsAndEmpires\essai-L1s\docs\a.md'`);
admis("chemin absolu dans la copie, /", "Get-Content 'G:/Unity/_revues/GuildsAndEmpires/essai-L1s/docs/a.md'");
admis("chemin absolu dans la copie, lettre minuscule", "Get-Content 'g:/unity/_revues/guildsandempires/essai-l1s/docs/a.md'");
admis("racine de la copie suivie de /", "Get-ChildItem G:/Unity/_revues/GuildsAndEmpires/essai-L1s/");
admis("options de l'interpréteur gardées dans le texte", "Select-String -Path 'docs/a.md' -Pattern 'v1.0' -SimpleMatch");
cas(0, "préfixe sans guillemets", journal([String.raw`C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -Command "Get-Content docs/a.md"`]), ["Commandes signalées : 0"]);
cas(0, "préfixe en minuscules", journal([String.raw`"c:\\windows\\system32\\windowspowershell\\v1.0\\powershell.exe" -Command "Get-Content docs/a.md"`]), ["Commandes signalées : 0"]);
cas(0, "dossier « in » = sous-dossier de la copie", journal([{ lignes: [cmd("Get-Content a.md")], dossier: `${WT}\\docs` }]), ["Commandes signalées : 0"]);
cas(0, "texte interdit seulement dans la sortie", journal([{ lignes: [cmd("Get-Content docs/a.md")], sortie: ["C:\\Users\\romai\\x", "..\\..\\_hors-revue", "~ $HOME $env:USERPROFILE %TEMP% .revue-croisee hooks-dev", "//serveur/x /g/x"] }]),
  ["Blocs exec analysés : 1", "Commandes signalées : 0"]);
cas(0, "deux exec en parallèle (exec, commande, exec, commande, statuts, sorties)",
  `${PREAMBULE.join("\n")}\n${EN_TETE_USER}\nc\n${EN_TETE_EXEC}\n${cmd("Get-Content docs/a.md")} in ${WT}\n${EN_TETE_EXEC}\n${cmd("Get-Content docs/b.md")} in ${WT}\n succeeded in 1ms:\na\n succeeded in 2ms:\nb\n${EN_TETE_FIN}\n1\n`,
  ["Blocs exec analysés : 2", "Commandes signalées : 0"]);
cas(0, "en-tête exec juste après une ligne de sortie non vide",
  `${PREAMBULE.join("\n")}\n${EN_TETE_USER}\nc\n${EN_TETE_EXEC}\n${cmd("Get-Content docs/a.md")} in ${WT}\n succeeded in 1ms:\nligne de sortie\n${EN_TETE_EXEC}\n${cmd("Get-Content docs/b.md")} in ${WT}\n exited 1 in 2ms:\nb\n${EN_TETE_FIN}\n1\n`,
  ["Blocs exec analysés : 2", "Commandes signalées : 0"]);

// --- Signalé (code 1) : chemin absolu hors de la copie.
signale("autre lecteur", String.raw`Get-Content C:\\Users\\romai\\x.md`, "chemin absolu hors de la copie (c:/)");
signale("autre lecteur, barre simple", String.raw`Get-Content C:\Users\romai\x.md`, "chemin absolu hors de la copie (c:/)");
signale("autre lecteur, /", "Get-Content C:/x.md", "chemin absolu hors de la copie (c:/)");
signale("même lecteur hors de la copie", "Get-Content G:/Unity/GuildsAndEmpires/CLAUDE.md", "chemin absolu hors de la copie (g:/)");
signale("dossier frère <id>-x", "Get-Content G:/Unity/_revues/GuildsAndEmpires/essai-L1s-x/a.md", "chemin absolu hors de la copie (g:/)");
signale("dossier frère <id>x, barres doublées", String.raw`Get-Content G:\\Unity\\_revues\\GuildsAndEmpires\\essai-L1sx\\a.md`, "chemin absolu hors de la copie (g:/)");
signale("copie suivie d'une guillemet (faux positif accepté)", "Get-ChildItem 'G:/Unity/_revues/GuildsAndEmpires/essai-L1s'", "chemin absolu hors de la copie (g:/)");
signale("chemin réseau \\\\serveur, forme échappée du journal", String.raw`Get-Content \\\\serveur\\x`, "chemin réseau");
signale("chemin réseau //serveur/x", "Get-Content //serveur/x", "chemin réseau");
signale("préfixe \\\\?\\ échappé", String.raw`Get-Content \\\\?\\G:\\Unity\\x`, "chemin réseau");
signale("adresse web (faux positif accepté)", "Invoke-WebRequest https://exemple.org/a", "chemin réseau");
signale("forme Git Bash /g/", "Get-Content /g/Unity/x.md", "forme /x/");
signale("forme Git Bash vers la copie (toujours signalée)", "Get-Content /g/Unity/_revues/GuildsAndEmpires/essai-L1s/a.md", "forme /x/");
signale("forme /x/ avec barres inverses", String.raw`Get-Content \\c\\x.md`, "forme /x/");
// `..`.
signale("..", "Get-Content docs/../CLAUDE.md", "..");
signale(".. dans un motif", "Select-String -Path docs/a.md -Pattern 'a..b'", "..");
signale(".. opérateur d'intervalle (faux positif accepté)", "(Get-Content docs/a.md)[0..200]", "..");
// Graphies d'un chemin absolu.
signale("~", "Get-Content ~/x.md", "~");
signale("$HOME", "Get-Content $HOME/x.md", "$HOME");
signale("$home, casse", "Get-Content $Home/x.md", "$HOME");
signale("$env:", "Get-Content $env:USERPROFILE/x.md", "$env:");
signale("$ENV:, casse", "Get-Content $ENV:TEMP/x.md", "$env:");
signale("%nom%", "type %USERPROFILE%\\x.md", "%nom%");
signale("%nom% avec chiffre et _", "type %MA_VAR2%", "%nom%");
signale("~ dans un motif (faux positif accepté)", "Select-String -Path docs/a.md -Pattern '~'", "~");
// Noms interdits, n'importe où (motif de recherche compris).
signale("nom .revue-croisee", "Get-ChildItem .revue-croisee", "nom interdit .revue-croisee");
signale("nom .revue-croisee dans un motif", "Select-String -Path docs/a.md -Pattern '.revue-croisee' -SimpleMatch", "nom interdit .revue-croisee");
signale("nom instantanes/executant", "Get-Content .claude/instantanes/executant/x.md", "nom interdit instantanes/executant");
signale("nom instantanes\\executant", String.raw`Get-Content .claude\\instantanes\\executant\\x.md`, "nom interdit instantanes/executant");
signale("nom _hors-revue", "Select-String -Path docs/a.md -Pattern '_hors-revue'", "nom interdit _hors-revue");
signale("nom hooks-dev", "Get-ChildItem .claude/hooks-dev", "nom interdit hooks-dev");
signale("nom side-session-notes, casse", "Select-String -Path docs/a.md -Pattern 'Side-Session-Notes'", "nom interdit side-session-notes");
// Préfixe d'interpréteur.
signale("préfixe ailleurs qu'en tête", `Get-Content docs/a.md; & ${PS} -Command 'x'`, "chemin absolu hors de la copie (c:/)");
cas(1, "autre interpréteur en tête (pwsh.exe)", journal([String.raw`"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Get-Content docs/a.md"`]),
  ["Commandes signalées : 1", "chemin absolu hors de la copie (c:/)"]);
cas(1, "préfixe collé à un autre nom", journal([String.raw`"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"x -Command "Get-Content docs/a.md"`]),
  ["Commandes signalées : 1"]);
cas(1, "préfixe précédé d'une espace (pas en tête)", journal([` ${cmd("Get-Content docs/a.md")}`]), ["Commandes signalées : 1"]);
// Dossier « in ».
cas(1, "dossier « in » hors de la copie", journal([{ lignes: [cmd("Get-Content docs/a.md")], dossier: "C:\\Users\\romai" }]),
  ["Commandes signalées : 1", "dossier hors de la copie"]);
cas(1, "dossier « in » = dossier frère <id>-x", journal([{ lignes: [cmd("Get-Content docs/a.md")], dossier: `${WT}-x` }]),
  ["Commandes signalées : 1", "dossier hors de la copie"]);
cas(1, "dossier « in » = dépôt principal", journal([{ lignes: [cmd("Get-Content docs/a.md")], dossier: "G:\\Unity\\GuildsAndEmpires" }]),
  ["Commandes signalées : 1", "dossier hors de la copie"]);
cas(1, "dossier « in » avec ..", journal([{ lignes: [cmd("Get-Content a.md")], dossier: `${WT}\\..\\x` }]),
  ["Commandes signalées : 1", "dossier hors de la copie"]);
cas(1, "texte après la dernière occurrence de « in X:\\ »", journal([{ lignes: [cmd("Get-Content a.md")], dossier: `${WT}\\docs;Get-Content C:\\x` }]),
  ["Commandes signalées : 1", "chemin absolu hors de la copie (c:/)"]);
// Commande sur plusieurs lignes : seule une ligne intérieure contient `..`.
cas(1, "commande sur plusieurs lignes, .. sur une ligne intérieure",
  journal([{ lignes: [`${PS} -NoProfile -Command "Get-Content docs/a.md`, "Get-Content docs/../x.md", "Get-Content docs/b.md\""] }]),
  ["Blocs exec analysés : 1", "Commandes signalées : 1", ".."]);
// Plusieurs blocs dont un seul signalé : compte exact.
cas(1, "trois blocs, un seul signalé", journal([cmd("Get-Content docs/a.md"), cmd("Get-Content C:/x.md"), cmd("Get-Content docs/b.md")]),
  ["Blocs exec analysés : 3", "Commandes signalées : 1"]);
cas(1, "deux exec en parallèle, le second hors de la copie",
  `${PREAMBULE.join("\n")}\n${EN_TETE_USER}\nc\n${EN_TETE_EXEC}\n${cmd("Get-Content docs/a.md")} in ${WT}\n${EN_TETE_EXEC}\n${cmd(String.raw`Get-Content C:\\x\\a.md`)} in ${WT}\n succeeded in 1ms:\na\n succeeded in 2ms:\nb\n${EN_TETE_FIN}\n1\n`,
  ["Blocs exec analysés : 2", "Commandes signalées : 1"]);

// --- Échec fermé (code 2).
cas(2, "version de Codex autre", journal([cmd("Get-Content docs/a.md")], { preambule: PREAMBULE.map((l) => l.replace("0.167.0-alpha.3.2", "0.0.0-essai")) }),
  ["version de Codex non validée : 0.0.0-essai"]);
cas(2, "version de Codex absente", journal([cmd("Get-Content docs/a.md")], { preambule: PREAMBULE.filter((l) => !l.startsWith("OpenAI Codex")) }),
  ["version de Codex absente du préambule"]);
cas(2, "ligne sandbox autre", journal([cmd("Get-Content docs/a.md")], { preambule: PREAMBULE.map((l) => (l === "sandbox: read-only" ? "sandbox: workspace-write" : l)) }),
  ["sandbox: read-only"]);
cas(2, "ligne sandbox absente", journal([cmd("Get-Content docs/a.md")], { preambule: PREAMBULE.filter((l) => !l.startsWith("sandbox")) }),
  ["sandbox: read-only"]);
cas(2, "journal vide", "", ["Journal vide"]);
cas(2, "journal fait de blancs", "\n  \n", ["Journal vide"]);
cas(2, "journal illisible", null, ["Journal illisible"]);
cas(2, "aucun en-tête reconnu", `${PREAMBULE.join("\n")}\nUser\nexec x\nTokens Used\n`, ["aucun en-tête de bloc reconnu"]);
cas(2, "bloc exec incomplet (fin du journal)", `${PREAMBULE.join("\n")}\n${EN_TETE_USER}\nc\n${EN_TETE_EXEC}\n${cmd("Get-Content docs/a.md")}\n`, ["bloc exec incomplet"]);
cas(2, "bloc exec incomplet (en-tête suivant)", `${PREAMBULE.join("\n")}\n${EN_TETE_USER}\nc\n${EN_TETE_EXEC}\n${cmd("Get-Content docs/a.md")}\n${EN_TETE_CODEX}\nm\n${EN_TETE_FIN}\n1\n`, ["bloc exec incomplet"]);
cas(2, "bloc exec incomplet (dossier sans lettre de lecteur)", journal([{ lignes: [cmd("Get-Content docs/a.md")], dossier: "docs" }]), ["bloc exec incomplet"]);
cas(2, "copie de revue relative", journal([cmd("Get-Content docs/a.md")]), ["Copie de revue non absolue"], "essai-L1s");
cas(2, "copie de revue avec ..", journal([cmd("Get-Content docs/a.md")]), ["Copie de revue non absolue"], `${WT}\\..\\essai-L1s`);

// ---------------------------------------------------------------------------------------------------------------
let conformes = 0;
for (const [attendu, libelle, texte, copie, attendus] of CAS) {
  const r = lancer(texte, copie);
  const sortie = r.stdout || "";
  const manquants = attendus.filter((a) => !sortie.includes(a));
  const ok = r.status === attendu && manquants.length === 0 && sortie.includes(`Code : ${attendu}`);
  if (ok) conformes += 1;
  else {
    console.log(`ÉCART : ${libelle} — attendu ${attendu}, obtenu ${r.status}${manquants.length ? ` ; absent de la sortie : ${manquants.join(" | ")}` : ""}`);
    console.log(sortie.split("\n").map((l) => `    ${l}`).join("\n"));
  }
}
fs.rmSync(dossierEssai, { recursive: true, force: true });
console.log(`${conformes}/${CAS.length} cas conformes`);
process.exit(conformes === CAS.length ? 0 : 1);
