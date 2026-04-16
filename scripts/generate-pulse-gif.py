from PIL import Image, ImageDraw
import math

def create_pulse_gif():
    frames = []
    width, height = 400, 100
    color = (0, 163, 255)  # #00A3FF Celeste AutaMedica
    bg_color = (255, 255, 255)
    
    steps = 20
    for i in range(steps):
        img = Image.new('RGB', (width, height), bg_color)
        draw = ImageDraw.Draw(img)
        
        # Dibujar línea de pulso
        points = []
        offset = (i / steps) * 100
        for x in range(0, width, 5):
            # Simular onda ECG
            y = 50
            if 50 < (x + offset) % 200 < 70:
                y = 20
            elif 70 < (x + offset) % 200 < 90:
                y = 80
            points.append((x, y))
            
        draw.line(points, fill=color, width=4)
        
        # Dibujar punto vital latiendo
        r = 6 + 4 * math.sin(i * math.pi / 10)
        draw.ellipse([350-r, 50-r, 350+r, 50+r], fill=color)
        
        frames.append(img)
        
    frames[0].save('/home/edu/autamedica-pulse.gif', save_all=True, append_images=frames[1:], duration=50, loop=0)
    print("✅ GIF generado con éxito")

create_pulse_gif()
