"""
Tests de la version Python, et de la compatibilité site ↔ Python.
Lancer depuis la racine du projet :  python -m pytest tests/
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "python"))

import sirr  # noqa: E402

MESSAGE = "Rendez-vous à 18h devant la fac 🎓 — مرحبا"
NODE = shutil.which("node")


def node(code: str) -> str:
    """Exécute du JavaScript avec le moteur du site (js/sirr-crypto.js)."""
    script = f"const Sirr = require({json.dumps(str(RACINE / 'js' / 'sirr-crypto.js'))});\n(async () => {{ {code} }})();"
    return subprocess.run([NODE, "-e", script], capture_output=True, text=True, check=True).stdout.strip()


# --- Python seul --------------------------------------------------------------

@pytest.mark.parametrize("format", ["texte", "emoji"])
def test_aller_retour(format):
    cle = sirr.generer_cle()
    assert sirr.dechiffrer(sirr.chiffrer(MESSAGE, cle, format), cle) == MESSAGE


def test_mauvaise_cle():
    chiffre = sirr.chiffrer(MESSAGE, "bonne")
    with pytest.raises(sirr.ErreurSirr, match="Mauvaise clé"):
        sirr.dechiffrer(chiffre, "mauvaise")


def test_cle_saisie_souple():
    cle = sirr.generer_cle()
    chiffre = sirr.chiffrer("ok", cle)
    assert sirr.dechiffrer(chiffre, cle.lower().replace("-", "")) == "ok"


# --- Site ↔ Python -------------------------------------------------------------

@pytest.mark.skipif(NODE is None, reason="Node.js n'est pas installé")
@pytest.mark.parametrize("format", ["texte", "emoji"])
def test_site_vers_python(format):
    cle = "K7F2Q-9XAMB-3TRWD-P8HZN-4VCYE"
    chiffre = node(f"console.log(await Sirr.chiffrer({json.dumps(MESSAGE)}, {json.dumps(cle)}, {json.dumps(format)}));")
    assert sirr.dechiffrer(chiffre, cle) == MESSAGE


@pytest.mark.skipif(NODE is None, reason="Node.js n'est pas installé")
@pytest.mark.parametrize("format", ["texte", "emoji"])
def test_python_vers_site(format):
    cle = "une clé choisie à la main, longue et unique"
    chiffre = sirr.chiffrer(MESSAGE, cle, format)
    clair = node(f"console.log(await Sirr.dechiffrer({json.dumps(chiffre)}, {json.dumps(cle)}));")
    assert clair == MESSAGE


@pytest.mark.skipif(NODE is None, reason="Node.js n'est pas installé")
def test_cles_generees_identiques_des_deux_cotes():
    cle = sirr.generer_cle()
    assert node(f"console.log(Sirr.normaliserCle({json.dumps(cle.lower())}));") == sirr.normaliser_cle(cle.lower())
