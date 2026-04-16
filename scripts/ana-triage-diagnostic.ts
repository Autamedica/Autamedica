import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qxjjrpksmwwrmubhvjew.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function runDiagnostic() {
  console.log('🚀 Ana Triage: Iniciando barrido proactivo de 850+ pacientes...');
  
  // 1. Obtener pacientes para analizar
  const { data: patients, error } = await supabase.from('patients').select('id, user_id, dni, birth_date');
  if (error) {
    console.error('Error al obtener pacientes:', error);
    return;
  }

  console.log(`📦 Analizando \${patients.length} pacientes...`);
  let redCount = 0;

  for (const patient of patients) {
    let riskLevel = 'green';
    let riskReason = null;

    // Lógica de Ana Triage para Inconsistencias Críticas
    if (!patient.dni || patient.dni.length < 5) {
      riskLevel = 'red';
      riskReason = 'Inconsistencia: DNI/Cédula inválida o faltante.';
    } else if (!patient.birth_date) {
      riskLevel = 'yellow';
      riskReason = 'Dato faltante: Fecha de nacimiento no registrada.';
    }

    if (riskLevel !== 'green') {
      const { error: updateError } = await supabase
        .from('patients')
        .update({ risk_level: riskLevel, risk_reason: riskReason })
        .eq('id', patient.id);
      
      if (!updateError && riskLevel === 'red') redCount++;
    }
  }

  console.log('✅ Barrido completado.');
  console.log(`🚨 Resultados de Ana Triage: \${redCount} pacientes marcados en ROJO por inconsistencias críticas.`);
  console.log('💡 El médico ya puede visualizarlos en su panel para iniciar llamadas.');
}

runDiagnostic();
