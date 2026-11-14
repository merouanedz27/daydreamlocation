"""
Génère les logos et les icônes de l'application à partir du logo du
propriétaire, `docs/new-logo.PNG` : la veste + « DAYDREAM · LOCATION », en
BLANC sur transparent (3020 × 594).

À relancer quand le logo change :  python scripts/gen-icons.py   (Pillow requis)

Le fichier n'existe qu'en blanc ; seule sa TRANSPARENCE sert, recolorée :
- public/logo-white.png — blanc, rogné : les barres brunes (en-tête, atelier) ;
- public/logo-ink.png   — encre #2B2119 : fonds clairs (connexion, pied de page) ;
- public/logo-print.png — noir pur : les tickets imprimés ;
- les icônes, la VESTE seule (le mot est illisible à 16 px) :
  onglet = encre sur transparent ; écran d'accueil = blanc sur le brun des
  barres (`--nav`, comme `theme_color`) — iOS noircit la transparence, et
  Android découpe l'icône « maskable » dans un cercle : elle tient alors dans
  la zone sûre de 80 % ; badge de notification = blanc sur transparent
  (Android n'en garde que la forme).
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

SOURCE = Image.open(ROOT / "docs" / "new-logo.PNG").convert("RGBA")
ALPHA = SOURCE.split()[3]

INK = (0x2B, 0x21, 0x19)
BLACK = (0, 0, 0)
WHITE_RGB = (255, 255, 255)
NAV = (0x6B, 0x4F, 0x3A, 255)


def tinted(alpha: Image.Image, rgb) -> Image.Image:
    """La forme `alpha` remplie de la couleur `rgb`, rognée au plus juste."""
    art = Image.new("RGBA", alpha.size, (*rgb, 255))
    art.putalpha(alpha)
    return art.crop(alpha.getbbox())


# --- Le logo complet, en trois encres ------------------------------------------
tinted(ALPHA, WHITE_RGB).save(PUBLIC / "logo-white.png", optimize=True)
tinted(ALPHA, INK).save(PUBLIC / "logo-ink.png", optimize=True)
tinted(ALPHA, BLACK).save(PUBLIC / "logo-print.png", optimize=True)

# --- La veste seule --------------------------------------------------------------
# Elle déborde au-dessus et au-dessous du « D » (pointes des revers, bas du
# pan) : un simple rognage vertical la couperait. On garde tout ce qui est à
# gauche du « D », plus les bandes au-dessus et au-dessous de lui.
D_LEFT, SUIT_RIGHT, D_TOP, D_BOTTOM = 740, 920, 140, 450
mask = Image.new("L", ALPHA.size, 0)
draw = ImageDraw.Draw(mask)
draw.rectangle((0, 0, D_LEFT, ALPHA.height), fill=255)
draw.rectangle((D_LEFT, 0, SUIT_RIGHT, D_TOP), fill=255)
draw.rectangle((D_LEFT, D_BOTTOM, SUIT_RIGHT, ALPHA.height), fill=255)
suit_alpha = Image.new("L", ALPHA.size, 0)
suit_alpha.paste(ALPHA, (0, 0), mask)
SUIT_INK = tinted(suit_alpha, INK)
SUIT_WHITE = tinted(suit_alpha, WHITE_RGB)


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

app = ROOT / "src" / "app"
icons = PUBLIC / "icons"
icons.mkdir(exist_ok=True)

# Onglet du navigateur.
square(SUIT_INK, 256, 0.02, TRANSPARENT).save(app / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
square(SUIT_INK, 96, 0.02, TRANSPARENT).save(app / "icon.png", optimize=True)

# Écran d'accueil : la veste blanche sur le brun des barres.
square(SUIT_WHITE, 180, 0.14, NAV).convert("RGB").save(app / "apple-icon.png", optimize=True)
square(SUIT_WHITE, 192, 0.14, NAV).convert("RGB").save(icons / "suit-192.png", optimize=True)
square(SUIT_WHITE, 512, 0.14, NAV).convert("RGB").save(icons / "suit-512.png", optimize=True)
square(SUIT_WHITE, 512, 0.24, NAV).convert("RGB").save(icons / "suit-maskable-512.png", optimize=True)

# Badge des notifications Android : la forme seule.
square(SUIT_WHITE, 96, 0.04, TRANSPARENT).save(icons / "badge-96.png", optimize=True)

print("OK", SUIT_INK.size)
