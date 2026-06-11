#!/usr/bin/env python3
"""
AutaMedica — Twitch Panel Header Generator
Genera los headers de paneles para el canal twitch.tv/autamedica
con el branding corporativo: obsidian + cyan neón (#00D4FF) + blanco.

Uso:
    python3 tools/obs/generate_twitch_panels.py
    python3 tools/obs/generate_twitch_panels.py --output-dir /ruta/custom

Dependencia: Pillow (pip install Pillow)
"""

import argparse
import math
import os
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
except ImportError:
    print("❌ Pillow no está instalado. Ejecutá: pip install Pillow")
    sys.exit(1)


# ── Branding Tokens ──────────────────────────────────────────────
OBSIDIAN = (18, 18, 35)           # #121223 — fondo principal
OBSIDIAN_LIGHT = (28, 28, 50)     # #1C1C32 — fondo panel
CYAN = (0, 212, 255)              # #00D4FF — acento neón
CYAN_GLOW = (0, 212, 255, 80)     # versión translúcida para glow
WHITE = (255, 255, 255)
IVORY = (245, 242, 235)           # #F5F2EB — texto secundario

# ── Dimensiones ──────────────────────────────────────────────────
PANEL_W = 320
PANEL_H = 100
ACCENT_H = 3        # altura de la línea de acento inferior
ICON_SIZE = 28       # tamaño del icono
PADDING_X = 18       # padding horizontal
PADDING_Y = 0        # padding vertical (centrado automático)

# ── Fonts ────────────────────────────────────────────────────────
FONT_PATHS = [
    "/usr/share/fonts/truetype/roboto/unhinted/RobotoTTF/Roboto-Bold.ttf",
    "/usr/share/fonts/truetype/roboto/unhinted/RobotoTTF/Roboto-Medium.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def find_font(size: int) -> ImageFont.FreeTypeFont:
    """Busca el primer font disponible del sistema."""
    for path in FONT_PATHS:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


# ── Icon Drawing Functions ───────────────────────────────────────
# Cada función dibuja un icono minimalista con líneas cyan neón.

def draw_medical_cross(draw: ImageDraw.Draw, cx: int, cy: int, size: int) -> None:
    """Cruz médica — icono para 'Acerca de'."""
    arm_w = size // 3
    half = size // 2
    # Vertical
    draw.rounded_rectangle(
        [cx - arm_w // 2, cy - half, cx + arm_w // 2, cy + half],
        radius=2, fill=CYAN
    )
    # Horizontal
    draw.rounded_rectangle(
        [cx - half, cy - arm_w // 2, cx + half, cy + arm_w // 2],
        radius=2, fill=CYAN
    )


def draw_calendar(draw: ImageDraw.Draw, cx: int, cy: int, size: int) -> None:
    """Icono de calendario — para 'Agenda'."""
    half = size // 2
    x0, y0 = cx - half, cy - half
    x1, y1 = cx + half, cy + half

    # Cuerpo del calendario
    draw.rounded_rectangle([x0, y0 + 4, x1, y1], radius=3, outline=CYAN, width=2)
    # Header bar
    draw.rectangle([x0 + 2, y0 + 4, x1 - 2, y0 + 12], fill=CYAN)
    # Pines superiores
    pin_w = 2
    draw.rectangle([cx - 6 - pin_w, y0, cx - 6 + pin_w, y0 + 6], fill=CYAN)
    draw.rectangle([cx + 6 - pin_w, y0, cx + 6 + pin_w, y0 + 6], fill=CYAN)
    # Grid dots (3x2)
    dot_r = 1
    for row in range(2):
        for col in range(3):
            dx = x0 + 6 + col * ((size - 12) // 2)
            dy = y0 + 17 + row * 7
            draw.ellipse([dx - dot_r, dy - dot_r, dx + dot_r, dy + dot_r], fill=CYAN)


def draw_terminal(draw: ImageDraw.Draw, cx: int, cy: int, size: int) -> None:
    """Icono de terminal/código — para 'Tecnología'."""
    half = size // 2
    x0, y0 = cx - half, cy - half
    x1, y1 = cx + half, cy + half

    # Ventana
    draw.rounded_rectangle([x0, y0, x1, y1], radius=4, outline=CYAN, width=2)
    # Title bar
    draw.line([x0 + 2, y0 + 8, x1 - 2, y0 + 8], fill=CYAN, width=1)
    # Dots en title bar
    for i, dx in enumerate([x0 + 5, x0 + 9, x0 + 13]):
        draw.ellipse([dx - 1, y0 + 3, dx + 1, y0 + 5], fill=CYAN)

    # Prompt chevron >_
    draw.line([x0 + 6, cy, cx - 4, cy + 4], fill=CYAN, width=2)
    draw.line([x0 + 6, cy + 8, cx - 4, cy + 4], fill=CYAN, width=2)
    # Cursor blink
    draw.rectangle([cx, cy + 6, cx + 8, cy + 8], fill=CYAN)


def draw_link_globe(draw: ImageDraw.Draw, cx: int, cy: int, size: int) -> None:
    """Icono de globo/enlace — para 'Enlaces'."""
    r = size // 2 - 1

    # Círculo exterior
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=CYAN, width=2)
    # Elipse vertical (meridiano)
    draw.ellipse([cx - r // 2, cy - r, cx + r // 2, cy + r], outline=CYAN, width=1)
    # Línea horizontal (ecuador)
    draw.line([cx - r, cy, cx + r, cy], fill=CYAN, width=1)
    # Líneas de latitud
    draw.arc([cx - r, cy - r // 2 - 2, cx + r, cy + r // 2 - 2], 0, 180, fill=CYAN, width=1)
    draw.arc([cx - r, cy - r // 2 + 4, cx + r, cy + r // 2 + 4], 180, 360, fill=CYAN, width=1)


def draw_trophy(draw: ImageDraw.Draw, cx: int, cy: int, size: int) -> None:
    """Icono de trofeo — para 'Trivia'."""
    half = size // 2
    y0 = cy - half
    
    # Copa
    draw.rounded_rectangle([cx - 7, y0, cx + 7, cy], radius=3, outline=CYAN, width=2)
    # Asas del trofeo
    draw.arc([cx - 11, y0 + 2, cx - 6, cy - 2], 90, 270, fill=CYAN, width=2)
    draw.arc([cx + 6, y0 + 2, cx + 11, cy - 2], 270, 90, fill=CYAN, width=2)
    # Tallo
    draw.line([cx, cy, cx, cy + 6], fill=CYAN, width=2)
    # Base
    draw.line([cx - 5, cy + 6, cx + 5, cy + 6], fill=CYAN, width=2)


# ── Panel Definition ─────────────────────────────────────────────
PANELS = [
    {"name": "acerca_de",   "text": "ACERCA DE",   "icon_fn": draw_medical_cross},
    {"name": "agenda",      "text": "AGENDA",       "icon_fn": draw_calendar},
    {"name": "tecnologia",  "text": "TECNOLOGÍA",   "icon_fn": draw_terminal},
    {"name": "enlaces",     "text": "ENLACES",      "icon_fn": draw_link_globe},
    {"name": "trivia",      "text": "JUEGA Y GANÁ", "icon_fn": draw_trophy},
]


def create_glow_line(width: int, height: int) -> Image.Image:
    """Crea una línea de acento cyan con efecto glow difuminado."""
    glow = Image.new("RGBA", (width, height + 12), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)

    # Línea principal sólida
    gd.rectangle([0, 8, width, 8 + height], fill=(*CYAN, 255))

    # Capas de glow hacia arriba (difuminado)
    for i in range(6):
        alpha = max(0, 60 - i * 12)
        gd.rectangle([0, 8 - i - 1, width, 8 - i], fill=(*CYAN, alpha))

    glow = glow.filter(ImageFilter.GaussianBlur(radius=1.5))
    return glow


def generate_panel(panel_def: dict, font: ImageFont.FreeTypeFont, output_dir: Path) -> Path:
    """Genera un panel individual y lo guarda como PNG."""
    img = Image.new("RGBA", (PANEL_W, PANEL_H), (*OBSIDIAN_LIGHT, 255))
    draw = ImageDraw.Draw(img)

    # ── Borde redondeado sutil ──
    border = Image.new("RGBA", (PANEL_W, PANEL_H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(border)
    bd.rounded_rectangle(
        [0, 0, PANEL_W - 1, PANEL_H - 1],
        radius=8,
        outline=(*CYAN, 40),
        width=1,
    )
    img = Image.alpha_composite(img, border)
    draw = ImageDraw.Draw(img)

    # ── Línea de acento cyan inferior con glow ──
    glow = create_glow_line(PANEL_W - 8, ACCENT_H)
    img.paste(glow, (4, PANEL_H - ACCENT_H - 10), glow)

    # ── Icono ──
    icon_cx = PADDING_X + ICON_SIZE // 2
    icon_cy = PANEL_H // 2 - 2  # ligeramente arriba del centro por la línea de acento
    panel_def["icon_fn"](draw, icon_cx, icon_cy, ICON_SIZE)

    # ── Texto ──
    text = panel_def["text"]
    bbox = font.getbbox(text)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    text_x = PADDING_X + ICON_SIZE + 14  # espacio después del icono
    text_y = (PANEL_H - text_h) // 2 - 4  # centrado vertical

    # Sombra de texto sutil
    draw.text((text_x + 1, text_y + 1), text, fill=(0, 0, 0, 120), font=font)
    # Texto principal
    draw.text((text_x, text_y), text, fill=WHITE, font=font)

    # ── Guardar ──
    filename = f"panel_{panel_def['name']}.png"
    output_path = output_dir / filename
    img.save(output_path, "PNG", optimize=True)
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Genera panel headers de Twitch para AutaMedica"
    )
    parser.add_argument(
        "--output-dir", "-o",
        type=str,
        default=None,
        help="Directorio de salida (default: tools/obs/assets/twitch_panels/)",
    )
    parser.add_argument(
        "--font-size",
        type=int,
        default=28,
        help="Tamaño del font del título (default: 28)",
    )
    args = parser.parse_args()

    # Directorio de salida
    if args.output_dir:
        output_dir = Path(args.output_dir)
    else:
        script_dir = Path(os.path.dirname(os.path.abspath(__file__)))
        output_dir = script_dir / "assets" / "twitch_panels"

    output_dir.mkdir(parents=True, exist_ok=True)

    # Font
    font = find_font(args.font_size)
    font_name = getattr(font, "path", "default")

    print("🎨 AutaMedica — Twitch Panel Generator")
    print(f"   📂 Output: {output_dir}")
    print(f"   🔤 Font: {font_name} ({args.font_size}px)")
    print(f"   📐 Tamaño: {PANEL_W}×{PANEL_H}px")
    print(f"   🎨 Paleta: Obsidian #{OBSIDIAN_LIGHT[0]:02X}{OBSIDIAN_LIGHT[1]:02X}{OBSIDIAN_LIGHT[2]:02X} + Cyan #{CYAN[0]:02X}{CYAN[1]:02X}{CYAN[2]:02X}")
    print()

    generated = []
    for panel in PANELS:
        path = generate_panel(panel, font, output_dir)
        generated.append(path)
        print(f"   ✅ {panel['text']:14s} → {path.name}")

    print(f"\n🎉 {len(generated)} paneles generados exitosamente.")
    print(f"   Subí las imágenes en: twitch.tv/autamedica → Editar paneles → + Agregar panel")


if __name__ == "__main__":
    main()
