from PIL import Image, ImageDraw, ImageFont
import math

def create_master_gif():
    # Renderizado en alta resolución (1600x400)
    w, h = 1600, 400
    color_vital = (0, 163, 255)  # Celeste Branding
    color_text = (0, 0, 0)
    bg_color = (255, 255, 255)
    frames = []
    
    try:
        font_main = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 100)
    except:
        font_main = ImageFont.load_default()

    def get_clinical_y(rel_x):
        # Ciclo extendido a 400 unidades para dar espacio al silencio eléctrico
        y = 200
        # Onda P (20-50)
        if 20 <= rel_x <= 50:
            y -= 10 * math.sin(math.pi * (rel_x - 20) / 30)
        # Complejo QRS (80-110)
        elif 80 <= rel_x <= 85: # Q dip
            y += 6 * math.sin(math.pi * (rel_x - 80) / 5)
        elif 85 <= rel_x <= 95: # R peak (Sharp)
            if rel_x <= 90: y -= (rel_x - 85) * 22
            else: y = 90 + (rel_x - 90) * 22
        elif 95 <= rel_x <= 100: # S dip
            y += 12 * math.sin(math.pi * (rel_x - 95) / 5)
        # Onda T (150-200)
        elif 150 <= rel_x <= 200:
            y -= 18 * math.sin(math.pi * (rel_x - 150) / 50)
        return y

    steps = 100 # Máxima fluidez y lentitud
    for i in range(steps):
        img = Image.new('RGB', (w, h), bg_color)
        draw = ImageDraw.Draw(img)
        
        # 1. Branding (Zona izquierda bloqueada y limpia)
        # Icono
        draw.rounded_rectangle([80, 130, 210, 260], radius=32, fill=(0, 0, 0))
        draw.line([145, 165, 145, 225], fill=color_vital, width=16)
        draw.line([115, 195, 175, 195], fill=color_vital, width=16)
        # Texto con margen de seguridad
        draw.text((250, 140), "AutaMedica", font=font_main, fill=color_text)

        # 2. Línea ECG (Zona derecha - Comienza en x=850 para CERO solapamiento)
        points = []
        offset = (i / steps) * 400
        for x in range(850, 1550, 2):
            rel_x = (x + offset) % 400
            y = get_clinical_y(rel_x)
            points.append((x, y))
        
        # Dibujar rastro suavizado
        if len(points) > 1:
            draw.line(points, fill=color_vital, width=6, joint="round")
        
        # 3. Cursor de vida
        lx, ly = points[-1]
        draw.ellipse([lx-12, ly-12, lx+12, ly+12], fill=color_vital)

        # Post-procesado Lanczos para nitidez premium
        img_final = img.resize((800, 200), Image.Resampling.LANCZOS)
        frames.append(img_final)
        
    # Duración aumentada a 80ms para ritmo clínico pausado
    frames[0].save('/home/edu/autamedica-master-clinical.gif', save_all=True, append_images=frames[1:], duration=80, loop=0)
    print("✅ GIF Master Clinical generado")

create_master_gif()
