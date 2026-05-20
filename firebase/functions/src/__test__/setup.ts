// Configure les variables d'environnement avant l'init du SDK Admin.
// Le préfixe "demo-" évite toute connexion à un projet Firebase réel.
process.env["FIRESTORE_EMULATOR_HOST"] = "127.0.0.1:8080";
process.env["GCLOUD_PROJECT"] = "demo-guilds-empires";
process.env["FIREBASE_AUTH_EMULATOR_HOST"] = "127.0.0.1:9099";
