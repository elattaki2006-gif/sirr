/*
 * Atelier : le chiffre de César, et comment le casser sans la clé.
 * César décale chaque lettre (A→D, B→E…). Il n'existe que 25 décalages possibles :
 * un ordinateur les essaie tous en une fraction de seconde, puis garde le texte
 * qui "ressemble le plus à du français" (analyse de fréquences, test du khi-deux).
 */
(function (racine) {
  "use strict";

  // Fréquence des lettres en français (en %), valeurs approximatives.
  const FREQ_FR = {
    a: 7.6, b: 0.9, c: 3.3, d: 3.7, e: 14.7, f: 1.1, g: 0.9, h: 0.7, i: 7.5, j: 0.6,
    k: 0.05, l: 5.5, m: 3.0, n: 7.1, o: 5.4, p: 3.0, q: 1.4, r: 6.6, s: 7.9, t: 7.2,
    u: 6.3, v: 1.8, w: 0.05, x: 0.4, y: 0.3, z: 0.1,
  };

  function sansAccents(texte) {
    return String(texte).normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  /** Décale chaque lettre de `decalage` positions dans l'alphabet. */
  function cesar(texte, decalage) {
    return sansAccents(texte).replace(/[a-z]/gi, c => {
      const base = c <= "Z" ? 65 : 97;
      return String.fromCharCode(((c.charCodeAt(0) - base + decalage) % 26 + 26) % 26 + base);
    });
  }

  /** Plus le score est petit, plus le texte ressemble à du français. */
  function scoreFrancais(texte) {
    const lettres = sansAccents(texte).toLowerCase().replace(/[^a-z]/g, "");
    if (!lettres.length) return Infinity;
    const compte = {};
    for (const c of lettres) compte[c] = (compte[c] || 0) + 1;
    let khi2 = 0;
    for (const [c, f] of Object.entries(FREQ_FR)) {
      const attendu = (f / 100) * lettres.length;
      khi2 += ((compte[c] || 0) - attendu) ** 2 / attendu;
    }
    return khi2;
  }

  /** Essaie les 26 décalages et désigne le plus probable. */
  function casser(chiffre) {
    const essais = [];
    for (let d = 0; d < 26; d++) {
      const texte = cesar(chiffre, -d);
      essais.push({ decalage: d, texte, score: scoreFrancais(texte) });
    }
    const meilleur = essais.reduce((a, b) => (a.score <= b.score ? a : b));
    return { essais, meilleur };
  }

  const api = { cesar, casser, scoreFrancais };
  if (typeof module === "object" && module.exports) module.exports = api;
  else racine.Cesar = api;
})(typeof window !== "undefined" ? window : globalThis);
