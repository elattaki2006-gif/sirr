// Tests du moteur : node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const Sirr = require("../js/sirr-crypto.js");
const Cesar = require("../js/cesar.js");

const MESSAGE = "Rendez-vous à 18h devant la fac 🎓 — مرحبا";

test("aller-retour en texte", async () => {
  const cle = Sirr.genererCle();
  const chiffre = await Sirr.chiffrer(MESSAGE, cle);
  assert.ok(chiffre.startsWith("sirr1:"));
  assert.match(chiffre.slice(6), /^[1-9A-HJ-NP-Za-km-z]+$/); // que du Base58
  assert.equal(await Sirr.dechiffrer(chiffre, cle), MESSAGE);
});

test("aller-retour en emojis", async () => {
  const chiffre = await Sirr.chiffrer(MESSAGE, "mon mot de passe très long 2026", "emoji");
  assert.ok(chiffre.startsWith("🔐"));
  assert.equal(await Sirr.dechiffrer(chiffre, "mon mot de passe très long 2026"), MESSAGE);
});

test("le même message donne un résultat différent à chaque fois (sel et IV aléatoires)", async () => {
  const a = await Sirr.chiffrer("salut", "cle");
  const b = await Sirr.chiffrer("salut", "cle");
  assert.notEqual(a, b);
});

test("mauvaise clé : refus", async () => {
  const chiffre = await Sirr.chiffrer(MESSAGE, "bonne clé");
  await assert.rejects(Sirr.dechiffrer(chiffre, "mauvaise clé"), /Mauvaise clé/);
});

test("message modifié en route : refus (intégrité AES-GCM)", async () => {
  const chiffre = await Sirr.chiffrer(MESSAGE, "cle");
  const dernier = chiffre.at(-1);
  const modifie = chiffre.slice(0, -1) + (dernier === "a" ? "b" : "a");
  await assert.rejects(Sirr.dechiffrer(modifie, "cle"), /Mauvaise clé|modifié|incomplet/);
});

test("résiste aux espaces, retours à la ligne et variantes d'emoji ajoutés par les applis", async () => {
  const cle = Sirr.genererCle();
  const texte = await Sirr.chiffrer("test", cle);
  const emoji = await Sirr.chiffrer("test", cle, "emoji");
  const abime = texte.slice(0, 20) + "\n " + texte.slice(20);
  const emojiAbime = Array.from(emoji).join("️");
  assert.equal(await Sirr.dechiffrer(abime, cle), "test");
  assert.equal(await Sirr.dechiffrer(emojiAbime, cle), "test");
});

test("lien de partage", async () => {
  const chiffre = await Sirr.chiffrer("lien", "cle", "emoji");
  const lien = Sirr.lienDePartage(chiffre, "https://exemple.github.io/sirr/");
  assert.ok(lien.includes("#m="));
  assert.equal(await Sirr.dechiffrer(lien, "cle"), "lien");
});

test("clé générée : format, force et saisie souple", async () => {
  const cle = Sirr.genererCle();
  assert.match(cle, /^([0-9A-HJKMNP-TV-Z]{5}-){4}[0-9A-HJKMNP-TV-Z]{5}$/);
  assert.equal(Sirr.forceCle(cle).bits, 125);
  const chiffre = await Sirr.chiffrer("souple", cle);
  // Ton ami peut taper la clé en minuscules et sans tirets
  assert.equal(await Sirr.dechiffrer(chiffre, cle.toLowerCase().replace(/-/g, " ")), "souple");
});

test("force des clés choisies", () => {
  assert.equal(Sirr.forceCle("1234").niveau, "faible");
  assert.equal(Sirr.forceCle("Mon-Secret-Marrakech-2026!").niveau, "forte");
});

test("base58 aller-retour, y compris zéros de tête", () => {
  const octets = new Uint8Array([0, 0, 1, 2, 255, 128]);
  assert.deepEqual(Sirr.depuisBase58(Sirr.versBase58(octets)), octets);
});

test("anatomie du message", async () => {
  const chiffre = await Sirr.chiffrer("abc", "cle");
  const a = Sirr.anatomie(chiffre);
  assert.equal(a.version, 1);
  assert.equal(a.sel.length, 32);      // 16 octets en hexadécimal
  assert.equal(a.iv.length, 24);       // 12 octets
  assert.equal(a.etiquette.length, 32);
  assert.equal(a.chiffre.length, 6);   // "abc" = 3 octets
});

test("compatibilité réseaux : un message court rentre dans un commentaire TikTok", async () => {
  const chiffre = await Sirr.chiffrer("On se voit à 18h", Sirr.genererCle());
  const tiktok = Sirr.compatibilite(chiffre).find(r => r.nom === "TikTok");
  assert.ok(tiktok.ok, `longueur ${chiffre.length}`);
});

test("256 emojis tous différents", () => {
  assert.equal(Sirr.EMOJIS.length, 256);
  assert.equal(new Set(Sirr.EMOJIS).size, 256);
});

test("César : chiffrer, puis casser sans la clé", () => {
  const clair = "Rendez-vous a dix-huit heures devant la bibliotheque";
  const chiffre = Cesar.cesar(clair, 7);
  assert.notEqual(chiffre, clair);
  const { meilleur } = Cesar.casser(chiffre);
  assert.equal(meilleur.decalage, 7);
  assert.equal(meilleur.texte, clair);
});
