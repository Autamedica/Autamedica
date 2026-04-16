from PIL import Image, ImageDraw, ImageFont
import math

def create_reference_gif():
    # Alta resolución para nitidez máxima
    w, h = 1600, 400
    color_cyan = (0, 163, 255)    # #00A3FF
    color_base = (226, 232, 240)   # Gris de la imagen
    color_text = (15, 23, 42)      # Negro puro
    frames = []
    
    try:
        font_main = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 100)
    except:
        font_main = ImageFont.load_default()

    def get_y(rel_x):
        y = 200
        # P-Wave
        if 20 <= rel_x <= 50: y -= 10 * math.sin(math.pi * (rel_x - 20) / 30)
        # QRS Complex (Basado en la imagen)
        elif 80 <= rel_x <= 85: y += 8 
        elif 85 <= rel_x <= 92: y = 208 - (rel_x - 85) * 50 if rel_x <= 88.5 else 120 + (rel_x - 88.5) * 50
        elif 92 <= rel_x <= 98: y += 12
        # T-Wave
        elif 140 <= rel_x <= 190: y -= 20 * math.sin(math.pi * (rel_x - 140) / 50)
        return y

    steps = 80
    for i in range(steps):
        img = Image.new('RGB', (w, h), (255, 255, 255))
        draw = ImageDraw.Draw(img)
        
        # 1. Branding (Lado Izquierdo)
        draw.rounded_rectangle([100, 130, 225, 255], radius=40, fill=(0, 0, 0))
        draw.line([162, 165, 162, 220], fill=color_cyan, width=16)
        draw.line([135, 192, 190, 192], fill=color_cyan, width=16)
        draw.text((280, 140), "AutaMedica", font=font_main, fill=color_text)

        # 2. Dibujar la línea base completa (Gris)
        full_path = []
        for x in range(850, 1550, 2):
            rel_x = x % 300
            full_path.append((x, get_y(rel_x)))
        draw.line(full_path, fill=color_base, width=3)

        # 3. Dibujar el segmento de escaneo azul (Highlight)
        # El segmento tiene un rastro (trail)
        scan_center = 850 + (i / steps) * 700
        trail_len = 50
        
        highlight_points = []
        for x in range(int(scan_center - trail_len), int(scan_center), 2):
            if 850 <= x <= 1550:
                highlight_points.append((x, get_y(x % 300)))
        
        if len(highlight_points) > 1:
            draw.line(highlight_points, fill=color_cyan, width=5, joint="round")
            # Cabeza redondeada
            lx, ly = highlight_points[-1]
            draw.ellipse([lx-6, ly-6, lx+6, ly+6], fill=color_cyan)

        # Redimensionar
        img_final = img.resize((800, 200), Image.Resampling.LANCZOS)
        frames.append(img_final)
        
    frames[0].save('/home/edu/autamedica-reference-style.gif', save_all=True, append_images=frames[1:], duration=50, loop=0)
    print("✅ GIF basado en referencia generado")

create_reference_gif()
