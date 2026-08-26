import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { jsonOk } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'

const DEFAULT_CATALOG_ITEMS = [
  {
    id: 'default-item-1',
    category: 'consultation',
    name: 'Interconsulta Especialista: Cardiologia / Dermatologia',
    description: 'Consulta médica especializada presencial ou telemedicina com médicos da rede credenciada.',
    market_reference_price_cents: 15000,
    redemption_credits: 100,
    partner_name: 'Rede Médica Especializada AutaMedica',
  },
  {
    id: 'default-item-2',
    category: 'lab_exam',
    name: 'Check-up Laboratorial Completo (Hemograma, Perfil Lipídico, Glicemia)',
    description: 'Painel completo de exames de rotina preventiva em laboratórios parceiros de primeira linha (Dasa / Sabin).',
    market_reference_price_cents: 12000,
    redemption_credits: 60,
    partner_name: 'Rede Diagnóstica / Laboratórios Parceiros',
  },
  {
    id: 'default-item-3',
    category: 'medication',
    name: 'Voucher Farmácia: Medicamentos de Uso Contínuo (Hipertensão / Diabetes)',
    description: 'Crédito direto para retirada de medicamentos essenciais em redes farmacêuticas conveniadas.',
    market_reference_price_cents: 8000,
    redemption_credits: 55,
    partner_name: 'Rede Farmacêutica Conveniada',
  },
]

export const GET: APIRoute = async ({ locals }) => {
  try {
    const admin = createAstroAdminClient(locals.runtime?.env)

    const { data: items, error } = await admin
      .from('benefit_catalog_items' as never)
      .select('id, category, name, description, market_reference_price_cents, redemption_credits, partner_name, metadata')
      .eq('is_active', true)
      .order('redemption_credits', { ascending: true })

    if (error || !items || items.length === 0) {
      return jsonOk({ catalog: DEFAULT_CATALOG_ITEMS })
    }

    return jsonOk({
      catalog: items,
    })
  } catch (error) {
    logger.warn('[patients/reserva-saude/catalog] Fallback to default catalog items', error)
    return jsonOk({
      catalog: DEFAULT_CATALOG_ITEMS,
    })
  }
}
