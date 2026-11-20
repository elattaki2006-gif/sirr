/*
 * Sirr — moteur de chiffrement
 * -----------------------------------------------------------------------------
 * Chiffrement : AES-256-GCM (Web Crypto API, intégrée au navigateur)
 * Clé         : PBKDF2-HMAC-SHA256, 600 000 itérations, sel aléatoire de 16 octets
 * Format      : version (1) | sel (16) | IV (12) | message chiffré + étiquette (16)
 *               → texte  : "sirr1:" + Base58(paquet)
 *               → emojis : "🔐" + un emoji par octet
 * Tout se passe dans le navigateur : aucun message ni aucune clé n'est envoyé à un serveur.
 */
(function (racine) {
  "use strict";

  const crypto = racine.crypto;
  const subtle = crypto.subtle;

  const VERSION = 1;
  const TAILLE_SEL = 16;
  const TAILLE_IV = 12;
  const TAILLE_ETIQUETTE = 16;
  const TAILLE_ENTETE = 1 + TAILLE_SEL + TAILLE_IV;
  const ITERATIONS = 600000; // recommandation OWASP pour PBKDF2-HMAC-SHA256

  const PREFIXE_TEXTE = "sirr1:";
  const PREFIXE_EMOJI = "🔐";

  // Base58 (alphabet de Bitcoin) : seulement des lettres et des chiffres,
  // sans 0/O ni I/l qui se confondent. Rien que les réseaux sociaux puissent abîmer.
  const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

  // Alphabet de Crockford pour les clés générées : facile à lire à voix haute.
  const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const MOTIF_CLE_SIRR = /^[0-9A-HJKMNP-TV-Z]{25}$/;

  // 256 emojis simples (un seul caractère Unicode chacun) : un emoji = un octet.
  const EMOJIS = Array.from("😀😁😂😃😄😅😆😇😉😊😋😌😍😎😏😐😑😒😓😔😕😖😗😘😙😚😛😜😝😞😟😠😡😢😣😤😥😦😧😨😩😪😫😬😭😮😯😰😱😲😳😴😵😶😷😸😹😺😻😼😽😾😿🙀🙁🙂🙃🙄🙈🙉🙊🚀🚁🚂🚃🚄🚅🚆🚇🚈🚉🚊🚋🚌🚍🚎🚏🚐🚑🚒🚓🚔🚕🚖🚗🚘🚙🚚🚛🚜🚝🚞🚟🚠🚡🚢🚤🚥🚦🚧🚨🚩🚪🚫🚭🚮🚯🚰🚱🚲🚳🚷🚸🚹🚺🚻🚼🚽🚾🚿🛁🛂🛃🛄🛅🐀🐁🐂🐃🐄🐅🐆🐇🐈🐉🐊🐋🐌🐍🐎🐏🐐🐑🐒🐓🐔🐕🐖🐗🐘🐙🐚🐛🐜🐝🐞🐟🐠🐡🐢🐣🐤🐥🐦🐧🐨🐩🐪🐫🐬🐭🐮🐯🐰🐱🐲🐳🐴🐵🐶🐷🐸🐹🐺🐻🐼🐽🐾🌷🌸🌹🌺🌻🌼🌽🌾🌿🍀🍁🍂🍃🍄🍅🍇🍈🍉🍊🍋🍌🍍🍎🍏🍐🍒🍓🍔🍕🍖🍗🍘🍙🍚🍛🍜🍝🍞🍟🍠🍡🍢🍣🍤🍥🍦🍧🍨🍩🍪🍫🍬🍭🍮🍯🍰🍱🍲");
  const INDEX_EMOJI = new Map(EMOJIS.map((e, i) => [e, i]));

  // Limites indicatives de longueur (caractères) — les plateformes les changent parfois.
  const LIMITES = [
    { nom: "WhatsApp", max: 65536 },
    { nom: "YouTube", detail: "commentaire", max: 10000 },
    { nom: "Instagram", detail: "commentaire", max: 2200 },
    { nom: "TikTok", detail: "commentaire", max: 150 },
  ];

  class ErreurSirr extends Error {}

  // --------------------------------------------------------------------------
  // Outils
  // --------------------------------------------------------------------------
  function aleatoire(n) {
    const t = new Uint8Array(n);
    crypto.getRandomValues(t);
    return t;
  }

  function concat(...parties) {
    const total = parties.reduce((s, p) => s + p.length, 0);
    const res = new Uint8Array(total);
    let pos = 0;
    for (const p of parties) { res.set(p, pos); pos += p.length; }
    return res;
  }

  function versHex(octets) {
    return Array.from(octets, o => o.toString(16).padStart(2, "0")).join("");
  }

  // --------------------------------------------------------------------------
  // Base58
  // --------------------------------------------------------------------------
  function versBase58(octets) {
    let zeros = 0;
    while (zeros < octets.length && octets[zeros] === 0) zeros++;
    let n = 0n;
    for (const o of octets) n = n * 256n + BigInt(o);
    let s = "";
    while (n > 0n) { s = BASE58[Number(n % 58n)] + s; n /= 58n; }
    return "1".repeat(zeros) + s;
  }

  function depuisBase58(texte) {
    let zeros = 0;
    while (zeros < texte.length && texte[zeros] === "1") zeros++;
    let n = 0n;
    for (const c of texte) {
      const v = BASE58.indexOf(c);
      if (v < 0) throw new ErreurSirr("Le message contient un caractère inattendu (« " + c + " ») : il a peut-être été modifié en route.");
      n = n * 58n + BigInt(v);
    }
    const octets = [];
    while (n > 0n) { octets.unshift(Number(n % 256n)); n /= 256n; }
    return new Uint8Array([...new Array(zeros).fill(0), ...octets]);
  }

  // --------------------------------------------------------------------------
  // Emojis
  // --------------------------------------------------------------------------
  function versEmojis(octets) {
    return PREFIXE_EMOJI + Array.from(octets, o => EMOJIS[o]).join("");
  }

  function depuisEmojis(texte) {
    const octets = [];
    for (const ch of Array.from(texte.slice(PREFIXE_EMOJI.length))) {
      if (/\s/.test(ch) || ch === "️") continue; // espaces et variantes ajoutés par certaines applis
      const v = INDEX_EMOJI.get(ch);
      if (v === undefined) throw new ErreurSirr("Le message contient un emoji inattendu (" + ch + ") : il a peut-être été modifié en route.");
      octets.push(v);
    }
    return new Uint8Array(octets);
  }

  // --------------------------------------------------------------------------
  // Clés
  // --------------------------------------------------------------------------

  /** Clé aléatoire de 25 caractères (125 bits), en 5 groupes : "K7F2Q-9XAMB-…". */
  function genererCle() {
    // 256 est un multiple de 32 : prendre les 5 bits de poids faible ne crée aucun biais.
    const c = Array.from(aleatoire(25), o => CROCKFORD[o & 31]).join("");
    return c.match(/.{5}/g).join("-");
  }

  /** Les clés Sirr se tapent sans se soucier des tirets, espaces, majuscules ou O/0, I/1. */
  function normaliserCle(cle) {
    const brute = String(cle || "").normalize("NFC");
    const compacte = brute.trim().toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
    return MOTIF_CLE_SIRR.test(compacte) ? compacte : brute;
  }

  /** Estimation simple de la force d'une clé, en bits. */
  function forceCle(cle) {
    if (!cle) return { bits: 0, niveau: "vide" };
    const n = normaliserCle(cle);
    if (MOTIF_CLE_SIRR.test(n)) return { bits: 125, niveau: "forte" };
    let pool = 0;
    if (/[a-z]/.test(n)) pool += 26;
    if (/[A-Z]/.test(n)) pool += 26;
    if (/[0-9]/.test(n)) pool += 10;
    if (/[^a-zA-Z0-9]/.test(n)) pool += 33;
    const bits = Math.round(Array.from(n).length * Math.log2(Math.max(pool, 2)));
    return { bits, niveau: bits < 40 ? "faible" : bits < 70 ? "moyenne" : "forte" };
  }

  async function deriverCle(cle, sel) {
    const materiel = await subtle.importKey(
      "raw", new TextEncoder().encode(normaliserCle(cle)), "PBKDF2", false, ["deriveKey"]);
    return subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: sel, iterations: ITERATIONS },
      materiel, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  // --------------------------------------------------------------------------
  // Chiffrer / déchiffrer
  // --------------------------------------------------------------------------
  async function chiffrer(message, cle, format = "texte") {
    if (!message) throw new ErreurSirr("Écris d'abord le message à chiffrer.");
    if (!cle) throw new ErreurSirr("Il faut une clé : génère-en une ou écris la tienne.");
    const sel = aleatoire(TAILLE_SEL);
    const iv = aleatoire(TAILLE_IV);
    const entete = concat([VERSION], sel, iv);
    const k = await deriverCle(cle, sel);
    const chiffre = new Uint8Array(await subtle.encrypt(
      // L'en-tête est "authentifié" : si quelqu'un le modifie, le déchiffrement échoue.
      { name: "AES-GCM", iv, additionalData: entete, tagLength: TAILLE_ETIQUETTE * 8 },
      k, new TextEncoder().encode(message)));
    const paquet = concat(entete, chiffre);
    return format === "emoji" ? versEmojis(paquet) : PREFIXE_TEXTE + versBase58(paquet);
  }

  /** Accepte le texte "sirr1:…", la version emojis "🔐…" ou un lien de partage "…#m=…". */
  function lirePaquet(texte) {
    let t = String(texte || "").trim();
    const i = t.indexOf("#m=");
    if (i >= 0) t = decodeURIComponent(t.slice(i + 3)).trim();
    if (!t) throw new ErreurSirr("Colle d'abord le message chiffré que tu as reçu.");
    if (t.startsWith(PREFIXE_EMOJI)) return depuisEmojis(t);
    t = t.replace(/\s+/g, "");
    if (t.toLowerCase().startsWith(PREFIXE_TEXTE)) t = t.slice(PREFIXE_TEXTE.length);
    return depuisBase58(t);
  }

  async function dechiffrer(texte, cle) {
    const p = lirePaquet(texte);
    if (!cle) throw new ErreurSirr("Il faut la clé que l'expéditeur t'a donnée.");
    if (p.length < TAILLE_ENTETE + TAILLE_ETIQUETTE) throw new ErreurSirr("Ce message est incomplet : copie-le en entier.");
    if (p[0] !== VERSION) throw new ErreurSirr("Ce message ne vient pas de Sirr, ou d'une version inconnue.");
    const entete = p.slice(0, TAILLE_ENTETE);
    const sel = p.slice(1, 1 + TAILLE_SEL);
    const iv = p.slice(1 + TAILLE_SEL, TAILLE_ENTETE);
    const k = await deriverCle(cle, sel);
    try {
      const clair = await subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: entete, tagLength: TAILLE_ETIQUETTE * 8 }, k, p.slice(TAILLE_ENTETE));
      return new TextDecoder("utf-8", { fatal: true }).decode(clair);
    } catch {
      throw new ErreurSirr("Mauvaise clé, ou message modifié en route. Vérifie la clé et recopie le message en entier.");
    }
  }

  /** Découpe un message chiffré en ses morceaux, pour le montrer (radiographie). */
  function anatomie(texte) {
    const p = lirePaquet(texte);
    return {
      version: p[0],
      sel: versHex(p.slice(1, 1 + TAILLE_SEL)),
      iv: versHex(p.slice(1 + TAILLE_SEL, TAILLE_ENTETE)),
      chiffre: versHex(p.slice(TAILLE_ENTETE, p.length - TAILLE_ETIQUETTE)),
      etiquette: versHex(p.slice(p.length - TAILLE_ETIQUETTE)),
      octets: p.length,
    };
  }

  function lienDePartage(chiffre, adressePage) {
    return adressePage.split("#")[0] + "#m=" + encodeURIComponent(chiffre);
  }

  /** Pour chaque réseau : le message rentre-t-il ? (longueur comptée comme les applis : UTF-16) */
  function compatibilite(chiffre) {
    const longueur = chiffre.length;
    return LIMITES.map(l => ({ ...l, longueur, ok: longueur <= l.max }));
  }

  const api = {
    chiffrer, dechiffrer, genererCle, normaliserCle, forceCle, anatomie, lienDePartage, compatibilite,
    versBase58, depuisBase58, ErreurSirr, EMOJIS, ITERATIONS, LIMITES,
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  else racine.Sirr = api;
})(typeof window !== "undefined" ? window : globalThis);
