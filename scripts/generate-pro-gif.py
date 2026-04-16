from PIL import Image, ImageDraw, ImageFont
import math

def create_pro_gif():
    # Dimensiones altas para anti-aliasing (2x)
    w, h = 1600, 400
    color_vital = (0, 163, 255)  # #00A3FF
    color_text = (0, 0, 0)
    frames = []
    
    # Intentar cargar una fuente del sistema
    try:
        font_main = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 80)
        font_sub = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 30)
    except:
        font_main = ImageFont.load_default()
        font_sub = ImageFont.load_default()

    steps = 30
    for i in range(steps):
        img = Image.new('RGB', (w, h), (255, 255, 255))
        draw = ImageDraw.Draw(img)
        
        # 1. Dibujar Icono (Caja negra + cruz celeste)
        draw.rounded_rectangle([100, 140, 220, 260], radius=20, fill=(30, 41, 59))
        draw.line([160, 170, 160, 230], fill=color_vital, width=15)
        draw.line([130, 200, 190, 200], fill=color_vital, width=15)

        # 2. Texto AutaMedica
        draw.text((250, 155), "AutaMedica", font=font_main, fill=color_text)
        draw.text((255, 245), "V  I  T  A  L", font=font_sub, fill=color_vital)

        # 3. Onda ECG Proactiva (Smooth path)
        points = []
        offset = (i / steps) * 400
        for x in range(800, 1500, 4):
            rel_x = (x + offset) % 400
            y = 200
            if 50 < rel_x < 70: y -= (rel_x - 50) * 3
            elif 70 < rel_x < 100: y += (rel_x - 70) * 4 - 60
            elif 100 < rel_x < 120: y -= (rel_x - 100) * 2 - 60
            points.append((x, y))
        
        draw.line(points, fill=color_vital, width=6)
        
        # 4. Punto Vital
        r = 12 + 4 * math.sin(i * math.pi / 15)
        draw.ellipse([1450-r, 200-r, 1450+r, 200+r], fill=color_vital)

        # Escalar hacia abajo para anti-aliasing perfecto
        img_final = img.resize((800, 200), Image.Resampling.LANCZOS)
        frames.append(img_final)
        
    frames[0].save('/home/edu/autamedica-vital-pro.gif', save_all=True, append_images=frames[1:], duration=40, loop=0)
    print("✅ GIF Profesional generado")

create_pro_gif()
