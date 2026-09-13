"""
Génère les icônes de l'application à partir de public/dd-logo.png.

À relancer quand le logo change :  python scripts/gen-icons.py   (Pillow requis)

- Petites tailles (onglet) : les deux tuiles « DD » seules, fond transparent.
  À 16-32 px le mot « location » serait illisible.
- Écran d'accueil : le logo complet centré sur BLANC. iOS noircit la
  transparence, et Android découpe l'icône « maskable » dans un cercle :
  le logo tient alors dans la zone sûre de 80 %.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
LOGO = Image.open(ROOT / "public" / "dd-logo.png").convert("RGBA")

# Bande des tuiles « DD » : tout ce qui précède le premier rang vide sous elles.
alpha = LOGO.split()[3]
top = alpha.getbbox()[1]
bottom = next(
    y for y in range(top, LOGO.height)
    if not any(alpha.getpixel((x, y)) for x in range(LOGO.width))
)
TILES = LOGO.crop((0, top, LOGO.width, bottom))
FULL = LOGO.crop(alpha.getbbox())


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
icons = ROOT / "public" / "icons"
icons.mkdir(exist_ok=True)

# Onglet du navigateur.
square(TILES, 256, 0.02, TRANSPARENT).save(app / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
square(TILES, 96, 0.02, TRANSPARENT).save(app / "icon.png", optimize=True)

# Écran d'accueil.
square(FULL, 180, 0.10, WHITE).convert("RGB").save(app / "apple-icon.png", optimize=True)
square(FULL, 192, 0.10, WHITE).convert("RGB").save(icons / "icon-192.png", optimize=True)
square(FULL, 512, 0.10, WHITE).convert("RGB").save(icons / "icon-512.png", optimize=True)
square(FULL, 512, 0.20, WHITE).convert("RGB").save(icons / "maskable-512.png", optimize=True)

print("OK")
