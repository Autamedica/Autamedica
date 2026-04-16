from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math

def create_apple_gif():
    # Super-sampling 4x para nitidez Retina (3200x800)
    w, h = 1600, 400
    color_vital = (0, 163, 255)  # Celeste Apple
    bg_color = (255, 255, 255)
    frames = []
    
    try:
        font_main = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 110)
    except:
        font_main = ImageFont.load_default()

    def get_clinical_y(rel_x):
        y = 200
        # P-wave
        if 10 <= rel_x <= 40:
            y -= 12 * math.sin(math.pi * (rel_x - 10) / 30)
        # QRS Complex (Sharp & Precise)
        elif 65 <= rel_x <= 70: # Q
            y += 8 * math.sin(math.pi * (rel_x - 65) / 5)
        elif 70 <= rel_x <= 78: # R
            y = 208 - (rel_x - 70) * 55 if rel_x <= 74 else 100 + (rel_x - 74) * 55
        elif 78 <= rel_x <= 85: # S
            y = 200 + 15 * math.sin(math.pi * (rel_x - 78) / 7)
        # T-wave (Smooth Recovery)
        elif 120 <= rel_x <= 170:
            y -= 22 * math.sin(math.pi * (rel_x - 120) / 50)
        return y

    steps = 60 
    for i in range(steps):
        # Crear lienzo de alta resolución
        img = Image.new('RGB', (w, h), bg_color)
        draw = ImageDraw.Draw(img)
        
        # 1. Branding (Estatico, minimalista)
        # Icono "Squircle" (Apple style)
        draw.rounded_rectangle([100, 130, 230, 260], radius=45, fill=(0, 0, 0))
        draw.line([165, 165, 165, 225], fill=color_vital, width=16)
        draw.line([135, 195, 195, 195], fill=color_vital, width=16)
        # Tipografía con tracking ajustado
        draw.text((280, 135), "AutaMedica", font=font_main, fill=(0,0,0))

        # 2. El ECG "Light Beam" (Estilo Apple Watch)
        offset = (i / steps) * 400
        # Dibujamos segmentos con opacidad decreciente (Trail)
        trail_length = 150
        for segment in range(trail_length):
            x_pos = 1550 - (segment * 3)
            if x_pos < 850: break
            
            rel_x = (x_pos + offset) % 400
            y_pos = get_clinical_y(rel_x)
            
            # El rastro se desvanece y se hace más delgado
            opacity = int(255 * (1 - (segment / trail_length)))
            # Simulamos opacidad con mezcla de color hacia el blanco
            r = int(color_vital[0] + (255 - color_vital[0]) * (segment / trail_length))
            g = int(color_vital[1] + (255 - color_vital[1]) * (segment / trail_length))
            b = int(color_vital[2] + (255 - color_vital[2]) * (segment / trail_length))
            
            dot_size = 4 * (1 - (segment / trail_length))
            draw.ellipse([x_pos-dot_size, y_pos-dot_size, x_pos+dot_size, y_pos+dot_size], fill=(r,g,b))

        # 3. La "Cabeza" de luz
        head_x = 1550
        head_y = get_clinical_y((head_x + offset) % 400)
        draw.ellipse([head_x-10, head_y-10, head_x+10, head_y+10], fill=color_vital)

        # Redimensionar con filtro de alta calidad para suavizado perfecto
        img_final = img.resize((800, 200), Image.Resampling.LANCZOS)
        frames.append(img_final)
        
    frames[0].save('/home/edu/autamedica-apple-style.gif', save_all=True, append_images=frames[1:], duration=35, loop=0)
    print("✅ GIF Apple Style generado")

create_apple_gif()
