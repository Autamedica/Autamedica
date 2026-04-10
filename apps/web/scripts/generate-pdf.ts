import { createClient } from '@supabase/supabase-js';
import { jsPDF } from 'jspdf';
import * as fs from 'node:fs';
import * as path from 'node:path';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

async function run() {
  try {
    const { data: intake, error: iErr } = await supabase
      .from('psychiatry_intakes')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (iErr) throw iErr;

    const { data: patient, error: pErr } = await supabase
      .from('patients')
      .select('*, profiles(first_name, last_name)')
      .eq('id', intake.patient_id)
      .single();

    if (pErr) throw pErr;

    const { data: sections, error: sErr } = await supabase
      .from('psychiatry_intake_sections')
      .select('*')
      .eq('intake_id', intake.id);

    if (sErr) throw sErr;

    const doc = new jsPDF();
    doc.setFillColor(122, 61, 84);
    doc.rect(0, 0, 210, 34, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text('AutaMedica', 16, 14);
    doc.setFontSize(11);
    doc.text('Evaluación Psiquiátrica Actualizada', 16, 24);
    
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(10);
    let y = 50;
    doc.text(`Paciente: ${patient.profiles.first_name} ${patient.profiles.last_name}`, 16, y);
    y += 10;

    for (const section of sections) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold');
      doc.text(`Sección: ${section.section}`, 16, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      for (const [k, v] of Object.entries(section.data || {})) {
        const text = `${k}: ${JSON.stringify(v)}`;
        const lines = doc.splitTextToSize(text, 180);
        doc.text(lines, 16, y);
        y += (lines.length * 5) + 2;
        if (y > 270) { doc.addPage(); y = 20; }
      }
      y += 5;
    }

    const outputDir = '/home/edu/Autamedica';
    const outputPath = path.join(outputDir, 'paciente_psiquiatria_final.pdf');
    fs.writeFileSync(outputPath, Buffer.from(doc.output('arraybuffer')));
    console.log(`SUCCESS: ${outputPath}`);
  } catch (e) {
    console.error('ERROR:', e);
    process.exit(1);
  }
}

run();
