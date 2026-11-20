# Sirr (سرّ) : envoie un secret sur n'importe quel réseau

**Sirr** (« secret » en arabe) chiffre un message pour qu'on puisse le poster sur **WhatsApp, Instagram, TikTok ou YouTube** sans que personne ne puisse le lire, sauf la personne qui a la clé.

**▶ Démo en ligne : https://elattaki2006-gif.github.io/sirr/**

<!-- Ajoute ici une capture d'écran :
![Capture de Sirr](docs/capture.png) -->

## Le principe

1. **Crée une clé** et donne-la à ton ami en personne (ou par un autre moyen que le message).
2. **Chiffre ton message** : il devient une suite de caractères incompréhensible, en lettres (`sirr1:6g4QCkhb…`) ou en emojis (`🔐😁🚞🚎😱🍃…`). Poste-le où tu veux.
3. **Ton ami le déchiffre** en collant le message et la clé dans Sirr. Sans la clé, impossible de le lire.

```
 Toi ──🔒 chiffrer──► « sirr1:6g4QCkhb… » ──🔑 déchiffrer──► Ton ami
                      visible par tous sur
                      WhatsApp, Instagram, TikTok, YouTube
```

## Pourquoi pas simplement mélanger les lettres ?

Remplacer ou déplacer les lettres (chiffre de César, transposition) a servi pendant 2 000 ans, mais ce n'est plus sûr : le chiffre de César n'a que 25 clés possibles. La page contient un **atelier interactif** qui chiffre un texte avec César puis le **casse sans la clé** en quelques millisecondes, grâce à l'analyse de fréquences (test du khi-deux sur les fréquences des lettres en français).

Sirr utilise donc **AES-256**, avec 2<sup>256</sup> clés possibles.

## Sous le capot

| Élément | Choix | Pourquoi |
|---|---|---|
| Chiffrement | **AES-256-GCM** | chiffre **et** garantit l'intégrité : un seul caractère modifié et le déchiffrement est refusé |
| Dérivation de clé | **PBKDF2-HMAC-SHA256**, 600 000 itérations, sel de 16 octets | recommandation OWASP : rend les attaques par force brute très lentes |
| IV | 12 octets aléatoires par message | le même texte ne donne jamais deux fois le même résultat |
| Données authentifiées | l'en-tête (version, sel, IV) | empêche de modifier l'en-tête sans être détecté |
| Encodage | **Base58** ou 1 emoji par octet | que des lettres et des chiffres : aucun réseau ne les abîme (pas de `_` ou `*` que WhatsApp transforme en mise en forme) |
| Clés générées | 25 caractères (alphabet de Crockford) = **125 bits** | lisibles à voix haute, pas de confusion O/0 ni I/1 |
| Exécution | **Web Crypto API** du navigateur | aucun serveur : rien n'est envoyé ni enregistré |

Format d'un message :

```
┌─────────┬──────────┬─────────┬─────────────────────┬─────────────┐
│ version │   sel    │   IV    │   message chiffré   │  étiquette  │
│ 1 octet │ 16 octets│12 octets│  taille du message  │  16 octets  │
└─────────┴──────────┴─────────┴─────────────────────┴─────────────┘
```

La page montre cette **radiographie** pour chaque message chiffré.

### Robustesse face aux réseaux sociaux
- Les espaces et retours à la ligne ajoutés par les applis sont ignorés.
- Les variantes d'emoji (`U+FE0F`) ajoutées par certains téléphones sont ignorées.
- La page indique si le message rentre dans la limite de chaque réseau (par exemple 150 caractères pour un commentaire TikTok ; limites indicatives).
- **Lien de partage** : le message peut être envoyé sous forme de lien. Il est placé après le `#`, une partie de l'adresse qui n'est jamais envoyée au serveur.

## Version Python (ligne de commande)

Une version Python **100 % compatible** avec le site : un message chiffré sur le site se déchiffre en Python, et inversement.

```bash
pip install -r python/requirements.txt
python python/sirr.py cle
python python/sirr.py chiffrer -c "K7F2Q-9XAMB-3TRWD-P8HZN-4VCYE" "Rendez-vous à 18h"
python python/sirr.py dechiffrer -c "K7F2Q-9XAMB-3TRWD-P8HZN-4VCYE" "sirr1:..."
```

## Tests

```bash
node --test                 # 14 tests du moteur JavaScript
python -m pytest tests/     # 9 tests Python, dont la compatibilité site ↔ Python
```

Ce qui est testé : aller-retour texte et emojis, refus d'une mauvaise clé, détection d'un message modifié, résistance aux espaces et variantes d'emoji, lien de partage, génération et saisie souple des clés, Base58, radiographie, cassage de César, et interopérabilité JavaScript ↔ Python dans les deux sens.

## Structure

```
sirr/
├── index.html            # la page
├── css/style.css         # design (palette du Jardin Majorelle, Marrakech)
├── js/
│   ├── sirr-crypto.js    # le moteur : AES-GCM, PBKDF2, Base58, emojis, clés
│   ├── cesar.js          # l'atelier : César et son cassage
│   └── app.js            # l'interface
├── python/
│   ├── sirr.py           # version en ligne de commande
│   └── requirements.txt
└── tests/
    ├── sirr.test.js      # tests JavaScript
    └── test_interop.py   # tests Python et compatibilité
```

## Limites (honnêtement)

- Sirr ne transmet pas la clé : il faut la donner par un autre moyen.
- Il cache le **contenu**, pas le fait que deux personnes communiquent.
- Une clé courte ou facile peut être devinée : la page mesure la force de la clé et propose d'en générer une.
- Projet étudiant, non audité. Pour des secrets vitaux, utiliser Signal.

**Améliorations prévues** : échange de clé sans se voir grâce au chiffrement à clé publique (ECDH), partage de la clé par QR code, version Java.

## Auteur

**Anass Elattaki**, étudiant en licence informatique, filière cybersécurité, FST Marrakech.

Licence MIT.
