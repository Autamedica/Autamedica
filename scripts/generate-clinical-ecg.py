from PIL import Image, ImageDraw, ImageFont
import math

def create_clinical_gif():
    # Renderizado en alta resolución (1600x400) para escalado posterior
    w, h = 1600, 400
    color_vital = (0, 163, 255)  # #00A3FF Celeste AutaMedica
    color_text = (0, 0, 0)
    bg_color = (255, 255, 255)
    frames = []
    
    try:
        font_main = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 90)
    except:
        font_main = ImageFont.load_default()

    # Definir la función de la onda ECG (P, QRS, T)
    def get_ecg_y(rel_x):
        # rel_x va de 0 a 100 por ciclo
        y = 200
        if 10 <= rel_x <= 25: # Onda P (Atrial)
            y -= 15 * math.sin(math.pi * (rel_x - 10) / 15)
        elif 35 <= rel_x <= 38: # Q
            y += 10 * (rel_x - 35) / 3
        elif 38 <= rel_x <= 42: # R (Ventricular)
            y = 210 - (rel_x - 38) * 45 if rel_x <= 40 else 120 + (rel_x - 40) * 45
        elif 42 <= rel_x <= 45: # S
            y += 15 * (45 - rel_x) / 3
        elif 60 <= rel_x <= 85: # Onda T (Repolarización)
            y -= 25 * math.sin(math.pi * (rel_x - 60) / 25)
        return y

    steps = 60 # Más frames para lentitud y fluidez
    for i in range(steps):
        img = Image.new('RGB', (w, h), bg_color)
        draw = ImageDraw.Draw(img)
        
        # 1. Logo AutaMedica
        draw.rounded_rectangle([80, 140, 200, 260], radius=24, fill=(0, 0, 0))
        draw.line([140, 170, 140, 230], fill=color_vital, width=12)
        draw.line([110, 200, 170, 200], fill=color_vital, width=12)
        draw.text((240, 150), "AutaMedica", font=font_main, fill=color_text)

        # 2. Línea de Base ECG
        points = []
        offset = (i / steps) * 200
        for x in range(800, 1550, 2):
            rel_x = (x + offset) % 200
            y = get_ecg_y(rel_x)
            points.append((x, y))
        
        # Dibujar rastro con degradado visual
        draw.line(points, fill=color_vital, width=6, joint="round")
        
        # 3. Punto de Escaneo Proactivo
        last_x, last_y = points[-1]
        draw.ellipse([last_x-10, last_y-10, last_x+10, last_y+10], fill=color_vital)

        # Escalar para suavizado (LANCZOS)
        img_final = img.resize((800, 200), Image.Resampling.LANCZOS)
        frames.append(img_final)
        
    frames[0].save('/home/edu/autamedica-clinical.gif', save_all=True, append_images=frames[1:], duration=60, loop=0)
    print("✅ GIF Clínico generado")

create_clinical_gif()
