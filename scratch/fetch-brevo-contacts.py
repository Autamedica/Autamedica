import sys
sys.path.append("/home/edu")

import json
import urllib.request
from brevo_autamedica_default import read_brevo_api_key

API_KEY = read_brevo_api_key()
BREVO_CONTACTS_URL = "https://api.brevo.com/v3/contacts?limit=50&offset=0"

def fetch_contacts(offset=0, limit=50):
    url = f"https://api.brevo.com/v3/contacts?limit={limit}&offset={offset}"
    req = urllib.request.Request(
        url,
        headers={
            "api-key": API_KEY,
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

# Fetch all contacts paginating
all_contacts = []
offset = 0
while True:
    data = fetch_contacts(offset=offset)
    contacts = data.get("contacts", [])
    all_contacts.extend(contacts)
    total = data.get("count", 0)
    print(f"Fetched {len(all_contacts)}/{total} contacts...")
    if len(all_contacts) >= total or not contacts:
        break
    offset += 50

print(f"\n=== TOTAL CONTACTOS EN BREVO: {len(all_contacts)} ===\n")

for i, c in enumerate(all_contacts):
    email = c.get("email", "N/A")
    attrs = c.get("attributes", {})
    name = attrs.get("NOMBRE", attrs.get("FIRSTNAME", attrs.get("PRENOM", "")))
    lastname = attrs.get("APELLIDO", attrs.get("LASTNAME", attrs.get("NOM", "")))
    full_name = f"{name} {lastname}".strip() or "Sin nombre"
    print(f"  {i+1}. {email} — {full_name}")
