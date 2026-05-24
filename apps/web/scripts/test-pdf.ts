import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { generatePsychiatryIntakePdf } from '../src/lib/patients/services/psychiatry-intake-pdf-report.service';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? 'https://qxjjrpksmwwrmubhvjew.supabase.co';
const supabaseKey = process.env['SUPABASE_SERVICE_' + 'ROLE_KEY'];

if (!supabaseKey) {
  throw new Error('Missing Supabase Service Role Key');
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    const { data: intake } = await supabase.from('psychiatry_intakes').select('*').order('updated_at', { ascending: false }).limit(1).single();
    const { data: patient } = await supabase.from('patients').select('*, profiles(first_name, last_name)').eq('id', intake.patient_id).single();
    const { data: sections } = await supabase.from('psychiatry_intake_sections').select('*').eq('intake_id', intake.id);

    const input = {
      patient: {
        name: patient.profiles.first_name + ' ' + patient.profiles.last_name,
        age: patient.birth_date ? Math.floor((new Date().getTime() - new Date(patient.birth_date).getTime()) / 31557600000) : null,
        gender: patient.gender || null
      },
      intake: {
        id: intake.id,
        completionPercentage: intake.completion_percentage,
        completedAt: intake.completed_at,
        updatedAt: intake.updated_at
      },
      sections: sections
    };

    const result = generatePsychiatryIntakePdf(input as any);
    const outputPath = path.join('/home/edu/Autamedica', 'evaluacion_psiquiatrica_CLINICA.pdf');
    fs.writeFileSync(outputPath, result.buffer);
    console.log(`REPORT_GENERATED: ${outputPath}`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

run();
