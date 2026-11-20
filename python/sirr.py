"""
Sirr en ligne de commande — 100 % compatible avec le site web.
Un message chiffré sur le site se déchiffre ici, et inversement.

    python sirr.py cle
    python sirr.py chiffrer -c "MA-CLE" "Rendez-vous à 18h"
    python sirr.py chiffrer -c "MA-CLE" --emoji "Rendez-vous à 18h"
    python sirr.py dechiffrer -c "MA-CLE" "sirr1:..."

Algorithmes : AES-256-GCM, clé dérivée par PBKDF2-HMAC-SHA256 (600 000 itérations).
"""

from __future__ import annotations

import argparse
import getpass
import hashlib
import re
import secrets
import sys
import unicodedata
from urllib.parse import unquote

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

VERSION = 1
TAILLE_SEL = 16
TAILLE_IV = 12
TAILLE_ETIQUETTE = 16
TAILLE_ENTETE = 1 + TAILLE_SEL + TAILLE_IV
ITERATIONS = 600_000

PREFIXE_TEXTE = "sirr1:"
PREFIXE_EMOJI = "🔐"
BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
MOTIF_CLE_SIRR = re.compile(r"[0-9A-HJKMNP-TV-Z]{25}")
EMOJIS = list("😀😁😂😃😄😅😆😇😉😊😋😌😍😎😏😐😑😒😓😔😕😖😗😘😙😚😛😜😝😞😟😠😡😢😣😤😥😦😧😨😩😪😫😬😭😮😯😰😱😲😳😴😵😶😷😸😹😺😻😼😽😾😿🙀🙁🙂🙃🙄🙈🙉🙊🚀🚁🚂🚃🚄🚅🚆🚇🚈🚉🚊🚋🚌🚍🚎🚏🚐🚑🚒🚓🚔🚕🚖🚗🚘🚙🚚🚛🚜🚝🚞🚟🚠🚡🚢🚤🚥🚦🚧🚨🚩🚪🚫🚭🚮🚯🚰🚱🚲🚳🚷🚸🚹🚺🚻🚼🚽🚾🚿🛁🛂🛃🛄🛅🐀🐁🐂🐃🐄🐅🐆🐇🐈🐉🐊🐋🐌🐍🐎🐏🐐🐑🐒🐓🐔🐕🐖🐗🐘🐙🐚🐛🐜🐝🐞🐟🐠🐡🐢🐣🐤🐥🐦🐧🐨🐩🐪🐫🐬🐭🐮🐯🐰🐱🐲🐳🐴🐵🐶🐷🐸🐹🐺🐻🐼🐽🐾🌷🌸🌹🌺🌻🌼🌽🌾🌿🍀🍁🍂🍃🍄🍅🍇🍈🍉🍊🍋🍌🍍🍎🍏🍐🍒🍓🍔🍕🍖🍗🍘🍙🍚🍛🍜🍝🍞🍟🍠🍡🍢🍣🍤🍥🍦🍧🍨🍩🍪🍫🍬🍭🍮🍯🍰🍱🍲")
INDEX_EMOJI = {e: i for i, e in enumerate(EMOJIS)}


class ErreurSirr(Exception):
    """Erreur compréhensible par l'utilisateur."""


# --- Base58 ------------------------------------------------------------------

def vers_base58(octets: bytes) -> str:
    zeros = len(octets) - len(octets.lstrip(b"\0"))
    n = int.from_bytes(octets, "big")
    s = ""
    while n > 0:
        n, r = divmod(n, 58)
        s = BASE58[r] + s
    return "1" * zeros + s


def depuis_base58(texte: str) -> bytes:
    zeros = len(texte) - len(texte.lstrip("1"))
    n = 0
    for c in texte:
        v = BASE58.find(c)
        if v < 0:
            raise ErreurSirr(f"Caractère inattendu « {c} » : le message a peut-être été modifié.")
        n = n * 58 + v
    corps = n.to_bytes((n.bit_length() + 7) // 8, "big") if n else b""
    return b"\0" * zeros + corps


# --- Emojis ------------------------------------------------------------------

def vers_emojis(octets: bytes) -> str:
    return PREFIXE_EMOJI + "".join(EMOJIS[o] for o in octets)


def depuis_emojis(texte: str) -> bytes:
    octets = []
    for ch in texte[len(PREFIXE_EMOJI):]:
        if ch.isspace() or ch == "️":
            continue
        if ch not in INDEX_EMOJI:
            raise ErreurSirr(f"Emoji inattendu ({ch}) : le message a peut-être été modifié.")
        octets.append(INDEX_EMOJI[ch])
    return bytes(octets)


# --- Clés --------------------------------------------------------------------

def generer_cle() -> str:
    c = "".join(CROCKFORD[b & 31] for b in secrets.token_bytes(25))
    return "-".join(c[i:i + 5] for i in range(0, 25, 5))


def normaliser_cle(cle: str) -> str:
    brute = unicodedata.normalize("NFC", cle or "")
    compacte = re.sub(r"[\s-]", "", brute.strip().upper()).replace("O", "0")
    compacte = re.sub(r"[IL]", "1", compacte)
    return compacte if MOTIF_CLE_SIRR.fullmatch(compacte) else brute


def deriver_cle(cle: str, sel: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", normaliser_cle(cle).encode("utf-8"), sel, ITERATIONS, 32)


# --- Chiffrer / déchiffrer -----------------------------------------------------

def chiffrer(message: str, cle: str, format: str = "texte") -> str:
    if not message:
        raise ErreurSirr("Écris d'abord le message à chiffrer.")
    if not cle:
        raise ErreurSirr("Il faut une clé.")
    sel, iv = secrets.token_bytes(TAILLE_SEL), secrets.token_bytes(TAILLE_IV)
    entete = bytes([VERSION]) + sel + iv
    chiffre = AESGCM(deriver_cle(cle, sel)).encrypt(iv, message.encode("utf-8"), entete)
    paquet = entete + chiffre
    return vers_emojis(paquet) if format == "emoji" else PREFIXE_TEXTE + vers_base58(paquet)


def lire_paquet(texte: str) -> bytes:
    t = (texte or "").strip()
    if "#m=" in t:
        t = unquote(t.split("#m=", 1)[1]).strip()
    if not t:
        raise ErreurSirr("Colle d'abord le message chiffré reçu.")
    if t.startswith(PREFIXE_EMOJI):
        return depuis_emojis(t)
    t = re.sub(r"\s+", "", t)
    if t.lower().startswith(PREFIXE_TEXTE):
        t = t[len(PREFIXE_TEXTE):]
    return depuis_base58(t)


def dechiffrer(texte: str, cle: str) -> str:
    p = lire_paquet(texte)
    if not cle:
        raise ErreurSirr("Il faut la clé de l'expéditeur.")
    if len(p) < TAILLE_ENTETE + TAILLE_ETIQUETTE:
        raise ErreurSirr("Ce message est incomplet : copie-le en entier.")
    if p[0] != VERSION:
        raise ErreurSirr("Ce message ne vient pas de Sirr, ou d'une version inconnue.")
    entete, sel, iv = p[:TAILLE_ENTETE], p[1:1 + TAILLE_SEL], p[1 + TAILLE_SEL:TAILLE_ENTETE]
    try:
        clair = AESGCM(deriver_cle(cle, sel)).decrypt(iv, p[TAILLE_ENTETE:], entete)
    except InvalidTag:
        raise ErreurSirr("Mauvaise clé, ou message modifié en route.") from None
    return clair.decode("utf-8")


# --- Ligne de commande -------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="sirr", description="Chiffre et déchiffre des messages Sirr.")
    sous = p.add_subparsers(dest="commande", required=True)
    sous.add_parser("cle", help="génère une clé forte")
    for nom in ("chiffrer", "dechiffrer"):
        s = sous.add_parser(nom)
        s.add_argument("texte", nargs="?", help="le message (sinon lu au clavier)")
        s.add_argument("-c", "--cle", help="la clé (sinon demandée sans l'afficher)")
        if nom == "chiffrer":
            s.add_argument("--emoji", action="store_true", help="résultat en emojis")
    args = p.parse_args(argv)

    if args.commande == "cle":
        print(generer_cle())
        return 0
    texte = args.texte if args.texte is not None else sys.stdin.read()
    cle = args.cle or getpass.getpass("Clé : ")
    try:
        if args.commande == "chiffrer":
            print(chiffrer(texte, cle, "emoji" if args.emoji else "texte"))
        else:
            print(dechiffrer(texte, cle))
    except ErreurSirr as e:
        print(f"Erreur : {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
