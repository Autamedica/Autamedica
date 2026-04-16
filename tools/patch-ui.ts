import * as fs from 'fs';
const path = '/home/edu/Autamedica/apps/web/src/components/doctors/patients/PatientsPanel.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Añadir el import de Phone
content = content.replace('Video, Users, FileText', 'Video, Phone, Users, FileText');

// 2. Localizar el cierre del botón de Video y añadir el de Phone
const anchor = '</button>';
const videoPos = content.indexOf('<Video className="h-3.5 w-3.5" />');
const firstButtonClose = content.indexOf(anchor, videoPos);

if (firstButtonClose !== -1) {
  const patch = `
        <div className="w-px bg-muted/50" />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            // Buscamos el teléfono del paciente en la data real
            console.log('Llamando al paciente...')
          }}
          className="au-focus-ring flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50"
        >
          <Phone className="h-3.5 w-3.5" />
          Llamar
        </button>`;
  content = content.slice(0, firstButtonClose + anchor.length) + patch + content.slice(firstButtonClose + anchor.length);
  fs.writeFileSync(path, content);
  console.log('✅ UI Patch applied successfully!');
} else {
  console.error('❌ Could not find the insertion point in the UI.');
}
