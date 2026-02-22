#!/usr/bin/env bash
set -euo pipefail

API_KEY="AIzaSyCvEhBxMptwYgUNLAyKafYLA5v6BckVy9U"
MODEL="gemini-2.0-flash-exp-image-generation"
ENDPOINT="https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}"
PUBLIC="/home/edu/Autamedica/apps/web/public"

generate() {
  local output="$1"
  local prompt="$2"

  echo ">>> Generating: $output"

  response=$(curl -s -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "{
      \"contents\": [{\"parts\": [{\"text\": $(echo "$prompt" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))')}]}],
      \"generationConfig\": {\"responseModalities\": [\"TEXT\", \"IMAGE\"]}
    }" 2>&1)

  echo "$response" | python3 -c "
import sys, json, base64
data = json.load(sys.stdin)
if 'error' in data:
    print('  ERROR:', data['error'].get('message', ''))
    sys.exit(1)
parts = data.get('candidates', [{}])[0].get('content', {}).get('parts', [])
found = False
for p in parts:
    if 'inlineData' in p:
        img = base64.b64decode(p['inlineData']['data'])
        with open('$output', 'wb') as f:
            f.write(img)
        print(f'  OK: {len(img)} bytes ({p[\"inlineData\"][\"mimeType\"]})')
        found = True
        break
if not found:
    print('  WARN: No image in response')
    for p in parts:
        if 'text' in p:
            print('  Text:', p['text'][:150])
"
  sleep 2
}

# === 1. OG Image ===
generate "$PUBLIC/og-image.jpg" \
  "Generate a 1200x630 minimalist dark banner. Deep charcoal background color #09090b. The word 'AutaMedica' in large clean white sans-serif text centered. Below it in smaller gray text: 'Telemedicina sin fricciones'. A subtle thin emerald green (#10b981) horizontal heartbeat line across the middle behind the text. Modern SaaS branding style like Linear or Vercel. No photos of people. No stock imagery."

# === 2. Twitter Image ===
generate "$PUBLIC/twitter-image.jpg" \
  "Generate a 1200x630 minimalist dark banner for Twitter card. Background #09090b. 'AutaMedica' wordmark in white centered. Below: 'Agenda inmediata · Receta digital · Resultados en tu móvil' in small muted gray text. Single emerald green (#10b981) dot accent above the title. Ultra clean, minimal. No photos. Modern tech aesthetic."

# === 3-8. Doctor Photos ===
generate "$PUBLIC/doctors/dr-martin-alvarez.webp" \
  "Professional headshot portrait of a Latin American male doctor in his late 30s. Warm friendly smile, short dark hair, light stubble. Wearing a crisp white medical coat over a light blue dress shirt. Neutral dark gray studio background. Clean modern corporate portrait style. Square composition. Photorealistic."

generate "$PUBLIC/doctors/dra-carolina-vega.webp" \
  "Professional headshot portrait of a Latin American female cardiologist in her early 30s. Confident warm expression, dark brown hair neatly pulled back, wearing a white medical coat with a stethoscope around her neck. Neutral dark gray studio background. Modern corporate portrait. Square composition. Photorealistic."

generate "$PUBLIC/doctors/dr-lucas-fernandez.webp" \
  "Professional headshot portrait of a Latin American male dermatologist in his mid 40s. Wears modern rectangular glasses, short graying hair, friendly professional expression. White medical coat. Neutral dark gray studio background. Clean corporate portrait style. Square composition. Photorealistic."

generate "$PUBLIC/doctors/dra-sofia-ramirez.webp" \
  "Professional headshot portrait of a Latin American female pediatrician in her early 30s. Warm approachable smile, dark curly hair, wearing a white medical coat. Friendly and caring expression. Neutral dark gray studio background. Modern corporate portrait. Square composition. Photorealistic."

generate "$PUBLIC/doctors/dr-nicolas-herrera.webp" \
  "Professional headshot portrait of a distinguished Latin American male neurologist in his late 40s. Short salt-and-pepper hair, serious but kind expression, wearing white medical coat. Neutral dark gray studio background. Modern corporate portrait. Square composition. Photorealistic."

generate "$PUBLIC/doctors/dra-valentina-lopez.webp" \
  "Professional headshot portrait of a Latin American female OB-GYN doctor in her late 20s. Bright friendly smile, straight dark hair, wearing a white medical coat. Professional and approachable. Neutral dark gray studio background. Modern corporate portrait. Square composition. Photorealistic."

# === 9-11. Blog Article Images ===
generate "$PUBLIC/blog/senales-cardiacas.webp" \
  "Minimalist editorial illustration: a stylized human heart with subtle digital overlay showing ECG heart rhythm lines. Dark moody background, deep charcoal with soft red and emerald green (#10b981) accent lighting. Modern medical-tech aesthetic. No text, no people. 16:9 aspect ratio. Clean and editorial."

generate "$PUBLIC/blog/consulta-virtual-vs-presencial.webp" \
  "Minimalist editorial photo: split composition. Left side shows a modern laptop screen displaying a clean video call interface. Right side shows a stethoscope on a dark desk surface. Dark background with soft blue lighting. Modern tech-medical aesthetic. No text, no people visible. 16:9 aspect ratio."

generate "$PUBLIC/blog/ansiedad-post-pandemia.webp" \
  "Abstract serene minimalist composition: gentle flowing organic waves or curves in calming blue and soft green tones on a dark charcoal background. Suggests mental wellness, calm, and tranquility. Minimal, editorial art style. No text, no people. 16:9 aspect ratio."

# === 12-15. Testimonial Avatars ===
generate "$PUBLIC/testimonials/carlos-ruiz.webp" \
  "Casual portrait photo of a Latin American man in his early 30s. Slight natural smile, casual dark t-shirt, short dark hair. Warm natural lighting. Neutral soft blurred background. Friendly and relatable. Square composition. Photorealistic."

generate "$PUBLIC/testimonials/dra-maria-gonzalez.webp" \
  "Professional portrait of a Latin American female doctor in her 40s. White medical coat, stethoscope, confident warm expression, dark hair with some gray. Soft neutral blurred background. Professional and experienced. Square composition. Photorealistic."

generate "$PUBLIC/testimonials/ana-martinez.webp" \
  "Professional portrait of a Latin American businesswoman in her mid 30s. Navy blazer, confident smile, dark hair, modern office background softly blurred. Corporate and professional. Square composition. Photorealistic."

generate "$PUBLIC/testimonials/federico-torres.webp" \
  "Casual portrait of a Latin American man in his late 30s. Light beard, relaxed friendly expression, wearing a casual button-down shirt. Slightly blurred outdoor/travel background suggesting an airport or city. Square composition. Photorealistic."

echo ""
echo "=== DONE ==="
echo "Checking results..."
for f in \
  "$PUBLIC/og-image.jpg" \
  "$PUBLIC/twitter-image.jpg" \
  "$PUBLIC/doctors/dr-martin-alvarez.webp" \
  "$PUBLIC/doctors/dra-carolina-vega.webp" \
  "$PUBLIC/doctors/dr-lucas-fernandez.webp" \
  "$PUBLIC/doctors/dra-sofia-ramirez.webp" \
  "$PUBLIC/doctors/dr-nicolas-herrera.webp" \
  "$PUBLIC/doctors/dra-valentina-lopez.webp" \
  "$PUBLIC/blog/senales-cardiacas.webp" \
  "$PUBLIC/blog/consulta-virtual-vs-presencial.webp" \
  "$PUBLIC/blog/ansiedad-post-pandemia.webp" \
  "$PUBLIC/testimonials/carlos-ruiz.webp" \
  "$PUBLIC/testimonials/dra-maria-gonzalez.webp" \
  "$PUBLIC/testimonials/ana-martinez.webp" \
  "$PUBLIC/testimonials/federico-torres.webp"; do
  if [ -f "$f" ]; then
    size=$(stat -c%s "$f")
    echo "  OK  $(printf '%6d' $size)B  $f"
  else
    echo "  FAIL        $f"
  fi
done
