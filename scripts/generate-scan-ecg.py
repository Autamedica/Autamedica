from PIL import Image, ImageDraw, ImageFont
import math

def create_scan_gif():
    # Renderizado en alta resolución (1600x400)
    w, h = 1600, 400
    color_cyan = (0, 163, 255)  # Celeste AutaMedica
    color_gray = (226, 232, 240) # Gris suave de la línea base
    color_text = (15, 23, 42)    # Negro azulado profundo
    bg_color = (255, 255, 255)
    frames = []
    
    try:
        font_main = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 95)
        font_sub = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 30)
    except:
        font_main = ImageFont.load_default()
        font_sub = ImageFont.load_default()

    def get_ecg_y(rel_x):
        y = 200
        # Onda P
        if 10 <= rel_x <= 35: y -= 10 * math.sin(math.pi * (rel_x - 10) / 25)
        # QRS
        elif 60 <= rel_x <= 63: y += 6
        elif 63 <= rel_x <= 67: y = 200 - (rel_x - 63) * 35 if rel_x <= 65 else 130 + (rel_x - 65) * 35
        elif 67 <= rel_x <= 70: y += 10
        # Onda T
        elif 100 <= rel_x <= 140: y -= 18 * math.sin(math.pi * (rel_x - 100) / 40)
        return y

    steps = 60
    for i in range(steps):
        img = Image.new('RGB', (w, h), bg_color)
        draw = ImageDraw.Draw(img)
        
        # 1. Branding (Lado Izquierdo)
        draw.rounded_rectangle([100, 140, 220, 260], radius=35, fill=(30, 41, 59))
        draw.line([160, 175, 160, 225], fill=color_cyan, width=14)
        draw.line([135, 200, 185, 200], fill=color_cyan, width=14)
        draw.text((260, 140), "AutaMedica", font=font_main, fill=color_text)
        draw.text((265, 245), "V  I  T  A  L", font=font_sub, fill=color_cyan)

        # 2. Línea ECG Base (Gris)
        full_line = []
        for x in range(850, 1500, 2):
            rel_x = x % 200
            full_line.append((x, get_ecg_y(rel_x)))
        draw.line(full_line, fill=color_gray, width=4)

        # 3. Barra de Escaneo (Celeste)
        # La barra se mueve de izquierda a derecha
        scan_pos = 850 + (i / steps) * 650
        scan_width = 60
        
        scan_points = []
        for x in range(int(scan_pos - scan_width), int(scan_pos), 2):
            if 850 <= x <= 1500:
                rel_x = x % 200
                scan_points.append((x, get_ecg_y(rel_x)))
        
        if len(scan_points) > 1:
            draw.line(scan_points, fill=color_cyan, width=6, joint="round")
            # Punto de cabeza brillante
            draw.ellipse([scan_pos-8, scan_points[-1][1]-8, scan_pos+8, scan_points[-1][1]+8], fill=color_cyan)

        # Redimensionar para nitidez absoluta
        img_final = img.resize((800, 200), Image.Resampling.LANCZOS)
        frames.append(img_final)
        
    frames[0].save('/home/edu/autamedica-scan-style.gif', save_all=True, append_images=frames[1:], duration=45, loop=0)
    print("✅ GIF Scan Style generado")

create_scan_gif()
