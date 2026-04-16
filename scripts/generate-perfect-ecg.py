from PIL import Image, ImageDraw, ImageFont
import math

def create_perfect_gif():
    # Renderizado en alta resolución (1600x400)
    w, h = 1600, 400
    color_vital = (0, 163, 255)  # Celeste Branding
    color_text = (0, 0, 0)
    bg_color = (255, 255, 255)
    frames = []
    
    try:
        # Intentar cargar una fuente de calidad
        font_main = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 95)
    except:
        font_main = ImageFont.load_default()

    def get_clinical_y(rel_x):
        # Ciclo de 300 unidades para mayor espacio y lentitud
        y = 200
        # Onda P
        if 20 <= rel_x <= 45:
            y -= 12 * math.sin(math.pi * (rel_x - 20) / 25)
        # Complejo QRS
        elif 70 <= rel_x <= 75: # Q
            y += 8 * (rel_x - 70) / 5
        elif 75 <= rel_x <= 82: # R (Pico agudo)
            y = 208 - (rel_x - 75) * 55 if rel_x <= 78.5 else 115 + (rel_x - 78.5) * 55
        elif 82 <= rel_x <= 88: # S
            y = 200 + 15 * (rel_x - 82) / 6 if rel_x <= 85 else 215 - 15 * (rel_x - 85) / 3
        # Onda T
        elif 120 <= rel_x <= 160:
            y -= 20 * math.sin(math.pi * (rel_x - 120) / 40)
        return y

    steps = 80 # Más pasos = más lento y fluido
    for i in range(steps):
        img = Image.new('RGB', (w, h), bg_color)
        draw = ImageDraw.Draw(img)
        
        # 1. Branding (Lado Izquierdo - Bloqueado)
        # Icono
        draw.rounded_rectangle([100, 140, 220, 260], radius=28, fill=(0, 0, 0))
        draw.line([160, 175, 160, 225], fill=color_vital, width=14)
        draw.line([135, 200, 185, 200], fill=color_vital, width=14)
        # Nombre
        draw.text((260, 145), "AutaMedica", font=font_main, fill=color_text)

        # 2. Línea ECG (Lado Derecho - Animado)
        points = []
        # Empezamos en x=850 para dejar margen de seguridad con el texto
        offset = (i / steps) * 300 
        for x in range(850, 1550, 2):
            rel_x = (x + offset) % 300
            y = get_clinical_y(rel_x)
            points.append((x, y))
        
        draw.line(points, fill=color_vital, width=6, joint="round")
        
        # 3. Cursor de escaneo
        lx, ly = points[-1]
        draw.ellipse([lx-10, ly-10, lx+10, ly+10], fill=color_vital)

        # Post-procesado: Reducción Lanczos para nitidez extrema
        img_final = img.resize((800, 200), Image.Resampling.LANCZOS)
        frames.append(img_final)
        
    frames[0].save('/home/edu/autamedica-clinical-perfect.gif', save_all=True, append_images=frames[1:], duration=70, loop=0)
    print("✅ GIF Perfecto generado")

create_perfect_gif()
