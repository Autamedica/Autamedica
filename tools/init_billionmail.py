import csv
import json
import subprocess

CSV_PATH = "/home/edu/autamedica-outreach-contacts.csv"
DB_PASS = "autamedica_db_pass_9238"
DB_USER = "billionmail"
DB_NAME = "billionmail"
CONTAINER = "billionmail-pgsql-billionmail-1"

def run_sql(sql):
    cmd = [
        "docker", "exec", "-e", f"PGPASSWORD={DB_PASS}",
        CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-c", sql
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result

# 1. Create Group
print("Creating contact group...")
run_sql("INSERT INTO bm_contact_groups (name, description, token) VALUES ('AutaMedica Outreach', 'Main outreach list for AutaMedica', 'autamedica_token') ON CONFLICT (name) DO NOTHING;")

# Get group ID
res = run_sql("SELECT id FROM bm_contact_groups WHERE name = 'AutaMedica Outreach';")
group_id = res.stdout.split('\n')[2].strip()
print(f"Group ID: {group_id}")

# 2. Import Contacts
print("Importing contacts...")
contacts_imported = 0
with open(CSV_PATH, mode='r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        email = row.get('email', '').strip()
        if not email:
            continue
        
        attribs = {
            "nombre": row.get('nombre', ''),
            "organizacion": row.get('organizacion', ''),
            "cargo": row.get('cargo_o_area', ''),
            "pais": row.get('pais', ''),
            "segmento": row.get('segmento', '')
        }
        attribs_json = json.dumps(attribs)
        
        # SQL Escape single quotes in names/orgs
        sql_email = email.replace("'", "''")
        sql_attribs = attribs_json.replace("'", "''")
        
        sql = f"INSERT INTO bm_contacts (email, group_id, attribs) VALUES ('{sql_email}', {group_id}, '{sql_attribs}') ON CONFLICT (group_id, email) DO UPDATE SET attribs = EXCLUDED.attribs;"
        run_sql(sql)
        contacts_imported += 1

print(f"Imported {contacts_imported} contacts.")

# 3. Create Default Email Template
print("Creating email template...")
content = """
<div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
  <h1 style="color: #004a99;">Hola {{nombre}},</h1>
  <p>Le escribo de parte de <strong>AutaMedica</strong> en relación a su labor en <strong>{{organizacion}}</strong>.</p>
  <p>Estamos desarrollando una plataforma de telemedicina avanzada y nos gustaría coordinar una breve charla.</p>
  <p>Saludos,<br>Eduardo Marques</p>
</div>
"""
run_sql(f"INSERT INTO email_templates (temp_name, content) VALUES ('AutaMedica Outreach Template', '{content.replace("'", "''")}') ON CONFLICT (temp_name) DO NOTHING;")

# Get template ID
res = run_sql("SELECT id FROM email_templates WHERE temp_name = 'AutaMedica Outreach Template';")
template_id = res.stdout.split('\n')[2].strip()
print(f"Template ID: {template_id}")

# 4. Create API Template (API Key)
print("Creating API Key...")
api_key = "autamedica_prod_key_99"
run_sql(f"INSERT INTO api_templates (api_key, api_name, template_id, subject, addresser) VALUES ('{api_key}', 'AutaMedica Outreach API', {template_id}, 'Consulta AutaMedica', 'contacto@autamedica.com') ON CONFLICT (api_key) DO NOTHING;")

print(f"\nSUCCESS: BillionMail integrated with AutaMedica.")
print(f"API KEY: {api_key}")
print(f"Group ID: {group_id}")
print(f"Template ID: {template_id}")
