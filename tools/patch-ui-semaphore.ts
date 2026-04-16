import * as fs from 'fs';
const path = '/home/edu/Autamedica/apps/web/src/components/doctors/patients/PatientsPanel.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Añadir el componente del Badge de Semáforo
const semaphorePatch = `
const RiskBadge = ({ level, reason }: { level: string; reason?: string }) => {
  const colors = {
    red: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]',
    yellow: 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.6)]',
    green: 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]',
  }
  return (
    <div 
      title={reason || 'Paciente al día'}
      className={\`h-2.5 w-2.5 rounded-full \${colors[level as keyof typeof colors] || colors.green} animate-pulse-subtle\`}
    />
  )
}`;

// 2. Insertar el Badge junto al nombre del paciente en la renderización
content = content.replace('{getDisplayName(patient)}', '<div className="flex items-center gap-2">{getDisplayName(patient)} <RiskBadge level={patient.risk_level} reason={patient.risk_reason} /></div>');

// 3. Añadir el componente RiskBadge al archivo
if (!content.includes('RiskBadge')) {
  content = semaphorePatch + '\n' + content;
}

fs.writeFileSync(path, content);
console.log('✅ UI Semaphore Patch applied successfully!');
