const fs = require('fs');
const path = '/mnt/data/Autamedica/apps/web/src/pages/api/admin/crm.ts';
let content = fs.readFileSync(path, 'utf8');

// Update select in API
content = content.replace(
  'main_phone_e164,whatsapp_url,address',
  'main_phone_e164,main_email,whatsapp_url,address'
);

// Update Account type in API (top of file)
if (!content.includes('main_email: string | null;')) {
  content = content.replace(
    'main_phone_e164: string | null;',
    'main_phone_e164: string | null;\n  main_email: string | null;'
  );
}

fs.writeFileSync(path, content);
console.log('API Updated.');

const uiPath = '/mnt/data/Autamedica/apps/web/src/components/admin/CrmDashboardUI.tsx';
let uiContent = fs.readFileSync(uiPath, 'utf8');

// Update Account type in UI
if (!uiContent.includes('main_email: string | null;')) {
  uiContent = uiContent.replace(
    'main_phone_e164: string | null;',
    'main_phone_e164: string | null;\n  main_email: string | null;'
  );
}

// Update Rendering in UI: add email below phone/whatsapp
const searchStr = '{account.whatsapp_url && (';
const emailRender = '\n                          {account.main_email && (\n                            <a href={"mailto:" + account.main_email} className="text-xs font-medium text-blue-700 hover:underline block">\n                              {account.main_email}\n                            </a>\n                          )}';

if (!uiContent.includes('mailto:')) {
    uiContent = uiContent.replace(searchStr, emailRender + '\n                          ' + searchStr);
}

fs.writeFileSync(uiPath, uiContent);
console.log('UI Updated.');
