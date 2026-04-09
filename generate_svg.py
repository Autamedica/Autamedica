import os

def create_editorial_svg(filename, category_name, color_theme):
    themes = {
        "blue":  {"start": "#F0F9FF", "end": "#E0F2FE", "accent": "#0EA5E9", "path": "M400 150 Q450 100 500 150 T600 150"},
        "red":   {"start": "#FEF2F2", "end": "#FEE2E2", "accent": "#EF4444", "path": "M350 200 A50 50 0 1 1 450 200 A50 50 0 1 1 350 200"},
        "teal":  {"start": "#F0FDFA", "end": "#CCFBF1", "accent": "#14B8A6", "path": "M380 150 H420 V250 H380 Z"},
        "amber": {"start": "#FFF7ED", "end": "#FFEDD5", "accent": "#F59E0B", "path": "M400 120 L440 240 L360 240 Z"},
        "purple": {"start": "#F5F3FF", "end": "#EDE9FE", "accent": "#8B5CF6", "path": "M400 100 C450 100 450 200 400 200 C350 200 350 100 400 100"},
        "green": {"start": "#F0FDF4", "end": "#DCFCE7", "accent": "#22C55E", "path": "M380 200 Q400 150 420 200 T460 200"},
        "stone": {"start": "#F8FAFC", "end": "#F1F5F9", "accent": "#64748B", "path": "M350 150 H450 M350 200 H450 M350 250 H450"}
    }
    
    t = themes.get(color_theme, themes["blue"])
    
    svg_content = f"""<svg width="800" height="450" viewBox="0 0 800 450" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:{t['start']};stop-opacity:1" />
                <stop offset="100%" style="stop-color:{t['end']};stop-opacity:1" />
            </linearGradient>
            <clipPath id="clip">
                <rect x="50" y="50" width="700" height="350" rx="40" />
            </clipPath>
        </defs>
        
        <rect width="800" height="450" fill="url(#grad)" />
        
        <!-- Background Patterns -->
        <g opacity="0.4">
            <circle cx="100" cy="100" r="80" fill="{t['accent']}" opacity="0.1" />
            <circle cx="700" cy="350" r="120" fill="{t['accent']}" opacity="0.05" />
            <path d="M0 450 L800 450 L800 400 Q400 300 0 400 Z" fill="white" opacity="0.5" />
        </g>

        <!-- Category Label -->
        <text x="400" y="380" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="{t['accent']}" text-anchor="middle" letter-spacing="4" opacity="0.6">{category_name.upper()}</text>
        
        <!-- Abstract Medical Icon -->
        <g transform="translate(0, -20)">
            <circle cx="400" cy="200" r="60" fill="white" opacity="0.8" />
            <path d="{t['path']}" stroke="{t['accent']}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="400" cy="200" r="80" stroke="{t['accent']}" stroke-width="1" fill="none" stroke-dasharray="4 8" opacity="0.3" />
        </g>

        <rect x="0" y="0" width="800" height="450" fill="none" stroke="white" stroke-width="20" opacity="0.2" />
    </svg>"""
    
    path = os.path.join("apps/web/public/images/blog", filename)
    with open(path, "w") as f:
        f.write(svg_content)

articles = [
    ("triage-domiciliario.png", "Guía Práctica", "blue"),
    ("analisis-sangre.png", "Laboratorio", "red"),
    ("medicamentos-genericos.png", "Farmacia", "stone"),
    ("presion-arterial.png", "Cardiología", "red"),
    ("diabetes-tipo-2.png", "Endocrinología", "amber"),
    ("dolor-cronico.png", "Clínica del Dolor", "purple"),
    ("segunda-opinion.png", "Derechos", "stone"),
    ("vacunas-adultos.png", "Infectología", "teal"),
    ("ansiedad-vs-panico.png", "Salud Mental", "purple"),
    ("telemedicina-revolucion.png", "Innovación", "blue"),
    ("certificado-digital.png", "Legal", "stone"),
    ("burnout-medico.png", "Profesionales", "red"),
    ("ia-clinica.png", "Tecnología", "blue"),
    ("facturacion-medica.png", "Gestión", "green"),
    ("medico-marca-personal.png", "Networking", "stone"),
    ("ausentismo-laboral.png", "Empresas", "amber"),
    ("telemedicina-roi.png", "ROI", "green"),
    ("alergia-primaveral.png", "Alergología", "green"),
    ("golpe-calor.png", "Urgencias", "amber"),
    ("dengue-argentina.png", "Salud Pública", "red"),
    ("apto-medico-escolar.png", "Pediatría", "blue"),
    ("glp1-argentina.png", "Tratamientos", "purple"),
    ("inyecciones-peso.png", "Bienestar", "teal"),
    ("retatrutide-investigacion.png", "Ciencia", "blue")
]

for filename, cat, theme in articles:
    create_editorial_svg(filename, cat, theme)
