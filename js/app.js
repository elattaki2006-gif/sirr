/* Sirr — interface. Le chiffrement lui-même est dans sirr-crypto.js. */
(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const attendre = ms => new Promise(r => setTimeout(r, ms));
  const mouvementReduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cryptoDispo = Boolean(window.crypto && window.crypto.subtle);

  if (!cryptoDispo) {
    $("alerte-crypto").hidden = false;
    $("bouton-chiffrer").disabled = true;
    $("bouton-dechiffrer").disabled = true;
  }

  function messageErreur(e) {
    return e instanceof Sirr.ErreurSirr ? e.message : "Une erreur inattendue est survenue. Réessaie.";
  }

  function etat(el, texte, type) {
    el.textContent = texte || "";
    el.classList.toggle("erreur", type === "erreur");
    el.classList.toggle("ok", type === "ok");
  }

  async function copier(texte, bouton) {
    try {
      await navigator.clipboard.writeText(texte);
    } catch {
      const zone = document.createElement("textarea");
      zone.value = texte;
      document.body.append(zone);
      zone.select();
      document.execCommand("copy");
      zone.remove();
    }
    const avant = bouton.textContent;
    bouton.textContent = "Copié ✓";
    setTimeout(() => { bouton.textContent = avant; }, 1500);
  }

  // ---------------------------------------------------------------------------
  // Démo de l'accueil : un vrai chiffrement, animé une seule fois
  // ---------------------------------------------------------------------------
  const BROUILLAGE = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let demoJeton = 0;

  function brouiller(el, vers, duree, jeton) {
    return new Promise(resolve => {
      const debut = performance.now();
      function image(t) {
        if (jeton !== demoJeton) return resolve();
        const p = Math.min(1, (t - debut) / duree);
        const fixes = Math.floor(p * vers.length);
        let bruit = "";
        for (let i = fixes; i < vers.length; i++) bruit += BROUILLAGE[Math.floor(Math.random() * BROUILLAGE.length)];
        el.textContent = vers.slice(0, fixes) + bruit;
        if (p < 1) requestAnimationFrame(image); else resolve();
      }
      requestAnimationFrame(image);
    });
  }

  async function lancerDemo() {
    if (!cryptoDispo) return;
    const jeton = ++demoJeton;
    const texte = "Rendez-vous à 18h devant la fac";
    const el = $("demo-texte"), etiquette = $("demo-etiquette");
    etiquette.textContent = "Ton message";
    el.textContent = texte;

    const cle = Sirr.genererCle();
    const [chiffre, emojis] = await Promise.all([
      Sirr.chiffrer(texte, cle),
      Sirr.chiffrer(texte, cle, "emoji"),
    ]);
    if (jeton !== demoJeton) return;

    if (mouvementReduit) {
      etiquette.textContent = "Ce que tout le monde voit";
      el.textContent = chiffre;
      return;
    }
    await attendre(1100);
    if (jeton !== demoJeton) return;
    etiquette.textContent = "Ce que tout le monde voit";
    await brouiller(el, chiffre, 1300, jeton);
    await attendre(2200);
    if (jeton !== demoJeton) return;
    etiquette.textContent = "Ou bien, en emojis";
    el.textContent = emojis;
  }

  $("demo-rejouer").addEventListener("click", lancerDemo);
  lancerDemo();

  // ---------------------------------------------------------------------------
  // Clé et force de la clé
  // ---------------------------------------------------------------------------
  const cleExp = $("cle-exp");

  function majForce() {
    const f = Sirr.forceCle(cleExp.value);
    const zone = $("force");
    zone.dataset.niveau = f.niveau;
    const textes = {
      vide: "Aucune clé pour l'instant",
      faible: `Faible (environ ${f.bits} bits) : facile à deviner`,
      moyenne: `Moyenne (environ ${f.bits} bits) : une clé générée est plus sûre`,
      forte: f.bits === 125 ? "Très forte : clé générée (125 bits)" : `Forte (environ ${f.bits} bits)`,
    };
    $("force-texte").textContent = textes[f.niveau];
  }

  $("generer").addEventListener("click", () => {
    cleExp.value = Sirr.genererCle();
    majForce();
  });
  cleExp.addEventListener("input", majForce);

  // ---------------------------------------------------------------------------
  // Chiffrer
  // ---------------------------------------------------------------------------
  let dernierChiffre = "";

  $("form-chiffrer").addEventListener("submit", async e => {
    e.preventDefault();
    const bouton = $("bouton-chiffrer"), sortieEtat = $("etat-chiffrer");
    const format = document.querySelector('input[name="format"]:checked').value;
    bouton.disabled = true;
    etat(sortieEtat, "Fabrication de la clé et chiffrement…");
    try {
      dernierChiffre = await Sirr.chiffrer($("message").value, cleExp.value, format);
      $("sortie").value = dernierChiffre;
      $("resultat-chiffrer").hidden = false;
      afficherCompatibilite(dernierChiffre);
      afficherRadiographie(dernierChiffre);
      etat(sortieEtat, "Chiffré. Copie-le et poste-le où tu veux.", "ok");
    } catch (err) {
      etat(sortieEtat, messageErreur(err), "erreur");
    } finally {
      bouton.disabled = false;
    }
  });

  $("copier").addEventListener("click", e => copier(dernierChiffre, e.currentTarget));
  $("copier-lien").addEventListener("click", e => copier(Sirr.lienDePartage(dernierChiffre, location.href), e.currentTarget));

  $("envoyer").addEventListener("click", () => {
    $("recu").value = dernierChiffre;
    $("cle-dest").value = cleExp.value;
    $("clair").hidden = true;
    etat($("etat-dechiffrer"), "Message reçu. Pour la démo, la clé est déjà remplie : en vrai, ton ami la tape lui-même.", "ok");
    $("bouton-dechiffrer").focus();
  });

  function afficherCompatibilite(chiffre) {
    const res = Sirr.compatibilite(chiffre);
    $("compat-titre").textContent = `Longueur : ${chiffre.length} caractères. Limites indicatives des réseaux :`;
    const liste = $("compat");
    liste.innerHTML = "";
    for (const r of res) {
      const li = document.createElement("li");
      li.className = r.ok ? "oui" : "non";
      const nom = r.detail ? `${r.nom} (${r.detail})` : r.nom;
      li.textContent = r.ok ? `${nom} ✓` : `${nom} ✗ trop long, max ${r.max}`;
      liste.append(li);
    }
  }

  function afficherRadiographie(chiffre) {
    const a = Sirr.anatomie(chiffre);
    const morceaux = [
      { cle: "version", nom: "Version", octets: 1, valeur: String(a.version), aide: "le format utilisé" },
      { cle: "sel", nom: "Sel", octets: 16, valeur: a.sel, aide: "rend chaque clé dérivée unique" },
      { cle: "iv", nom: "IV", octets: 12, valeur: a.iv, aide: "change à chaque message" },
      { cle: "chiffre", nom: "Message chiffré", octets: a.chiffre.length / 2, valeur: a.chiffre, aide: "ton texte, illisible" },
      { cle: "etiquette", nom: "Étiquette", octets: 16, valeur: a.etiquette, aide: "détecte toute modification" },
    ];
    const barre = $("radio-barre"), legende = $("radio-legende");
    barre.innerHTML = "";
    legende.innerHTML = "";
    for (const m of morceaux) {
      const seg = document.createElement("span");
      seg.className = "seg-" + m.cle;
      seg.style.flexGrow = m.octets;
      barre.append(seg);

      const dt = document.createElement("dt");
      dt.className = "seg-" + m.cle;
      const nom = document.createElement("dd");
      nom.className = "nom";
      nom.textContent = `${m.nom} (${m.octets} octet${m.octets > 1 ? "s" : ""})`;
      const detail = document.createElement("dd");
      const code = document.createElement("code");
      code.textContent = m.valeur.length > 40 ? m.valeur.slice(0, 40) + "…" : m.valeur;
      detail.append(m.aide + " ", code);
      legende.append(dt, nom, detail);
    }
  }

  // ---------------------------------------------------------------------------
  // Déchiffrer
  // ---------------------------------------------------------------------------
  $("form-dechiffrer").addEventListener("submit", async e => {
    e.preventDefault();
    const bouton = $("bouton-dechiffrer"), sortieEtat = $("etat-dechiffrer");
    bouton.disabled = true;
    $("clair").hidden = true;
    etat(sortieEtat, "Vérification de la clé et déchiffrement…");
    try {
      const clair = await Sirr.dechiffrer($("recu").value, $("cle-dest").value);
      $("clair-texte").textContent = clair;   // textContent : aucun risque d'injection
      $("clair").hidden = false;
      etat(sortieEtat, "Bonne clé, message intact.", "ok");
    } catch (err) {
      etat(sortieEtat, messageErreur(err), "erreur");
    } finally {
      bouton.disabled = false;
    }
  });

  // Ouvert depuis un lien de partage (…#m=…) : on prépare le déchiffrement.
  if (location.hash.startsWith("#m=")) {
    $("recu").value = decodeURIComponent(location.hash.slice(3));
    etat($("etat-dechiffrer"), "Un message chiffré t'attend : entre la clé pour le lire.", "ok");
    $("essayer").scrollIntoView();
    $("cle-dest").focus();
  }

  // ---------------------------------------------------------------------------
  // Atelier César
  // ---------------------------------------------------------------------------
  const cesarClair = $("cesar-clair"), cesarDecalage = $("cesar-decalage");

  function majCesar() {
    $("cesar-valeur").textContent = cesarDecalage.value;
    $("cesar-chiffre").textContent = Cesar.cesar(cesarClair.value, Number(cesarDecalage.value));
    $("cesar-verdict").textContent = "";
    $("cesar-essais").innerHTML = "";
  }
  cesarClair.addEventListener("input", majCesar);
  cesarDecalage.addEventListener("input", majCesar);
  majCesar();

  $("casser").addEventListener("click", () => {
    const chiffre = $("cesar-chiffre").textContent;
    const debut = performance.now();
    const { essais, meilleur } = Cesar.casser(chiffre);
    const duree = performance.now() - debut;

    const liste = $("cesar-essais");
    liste.innerHTML = "";
    for (const essai of essais) {
      const li = document.createElement("li");
      li.textContent = essai.texte;
      if (essai === meilleur) li.className = "trouve";
      liste.append(li);
    }
    const ms = duree < 1 ? "moins d'une milliseconde" : `${duree.toFixed(1).replace(".", ",")} ms`;
    $("cesar-verdict").textContent = `Cassé en ${ms} : la clé était un décalage de ${meilleur.decalage}.`;
    liste.querySelector(".trouve")?.scrollIntoView({ block: "nearest" });
  });
})();
