"""
Génère les logos et les icônes de l'application à partir des deux images du
modèle Word du propriétaire (« Daydream Ticket ») :

- public/ticket-wordmark.png — « DAYDREAM · LOCATION », encre sur transparent ;
- public/ticket-suit.png     — la veste et la cravate, encre sur BLANC.

À relancer quand le logo change :  python scripts/gen-icons.py   (Pillow requis)

Sorties :
- public/logo-wordmark.png : le mot, rogné au plus juste (barre, pied de page) ;
- public/logo-suit.png     : la veste, fond rendu TRANSPARENT et rognée (connexion,
  hors-ligne, onglet du navigateur) ;
- les icônes : petites tailles (onglet) = la veste seule sur transparent ;
  écran d'accueil = la veste centrée sur BLANC. iOS noircit la transparence, et
  Android découpe l'icône « maskable » dans un cercle : elle tient alors dans la
  zone sûre de 80 %.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

# --- Le mot -----------------------------------------------------------------
WORDMARK = Image.open(PUBLIC / "ticket-wordmark.png").convert("RGBA")
WORDMARK = WORDMARK.crop(WORDMARK.split()[3].getbbox())
WORDMARK.save(PUBLIC / "logo-wordmark.png", optimize=True)

# --- La veste : le blanc devient transparent ----------------------------------
# L'encre garde son anti-crénelage : l'opacité suit la noirceur du pixel, et le
# pixel lui-même devient noir pur. Sur un fond coloré, pas de liseré blanc.
suit = Image.open(PUBLIC / "ticket-suit.png").convert("L")
ink = suit.point(lambda v: 0 if v > 245 else min(255, round((255 - v) * 255 / 235)))
SUIT = Image.new("RGBA", suit.size, (0, 0, 0, 255))
SUIT.putalpha(ink)
SUIT = SUIT.crop(ink.getbbox())
SUIT.save(PUBLIC / "logo-suit.png", optimize=True)


def square(art: Image.Image, size: int, padding: float, background) -> Image.Image:
    """`art` centré dans un carré `size`, avec `padding` (fraction) de chaque côté."""
    canvas = Image.new("RGBA", (size, size), background)
    inner = round(size * (1 - 2 * padding))
    scale = inner / max(art.size)
    fitted = art.resize(
        (max(1, round(art.width * scale)), max(1, round(art.height * scale))),
        Image.LANCZOS,
    )
    canvas.alpha_composite(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
    return canvas


TRANSPARENT = (0, 0, 0, 0)
WHITE = (255, 255, 255, 255)

app = ROOT / "src" / "app"
icons = PUBLIC / "icons"
icons.mkdir(exist_ok=True)

# Onglet du navigateur.
square(SUIT, 256, 0.02, TRANSPARENT).save(app / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
square(SUIT, 96, 0.02, TRANSPARENT).save(app / "icon.png", optimize=True)

# Écran d'accueil.
square(SUIT, 180, 0.12, WHITE).convert("RGB").save(app / "apple-icon.png", optimize=True)
square(SUIT, 192, 0.12, WHITE).convert("RGB").save(icons / "suit-192.png", optimize=True)
square(SUIT, 512, 0.12, WHITE).convert("RGB").save(icons / "suit-512.png", optimize=True)
square(SUIT, 512, 0.22, WHITE).convert("RGB").save(icons / "suit-maskable-512.png", optimize=True)

print("OK", WORDMARK.size, SUIT.size)
