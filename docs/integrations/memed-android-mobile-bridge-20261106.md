# AutaMedica Android Kotlin → Memed Brasil (mobile handoff, piloto)

## Alcance implementado
- O médico na videoconferência Android vê `Abrir receita BR no Memed` apenas no caso BR, com vínculo de paciente e país clínico compatível.
- Um `memed-mobile-preflight` autenticado com JWT Supabase verifica o **médico logado** (role, registro CRM/UF, CFM vigente, `MEMED_MOBILE_PILOT_DOCTOR_ID`), a consulta pelo UUID (`in_progress`/`completed` nas últimas 24h) e paciente BR com `active`, CPF e data de nascimento, gênero e consentimento LGPD.
- O backend retorna **apenas** `https://www.autamedica.com/doctors/prescriptions/memed-mobile?appointmentId=<UUID>`; nem CPF, nem ID de paciente, tokens Memed, credenciais ou JWT no URL.
- Kotlin valida estritamente esquema/host/rota/parâmetros antes de chamar `androidx.browser:browser` em Custom Tabs, sem `addJavascriptInterface` e sem permitir sharing pelo browser.
- Página médica **exclusiva de celular** `/doctors/prescriptions/memed-mobile` faz nova autenticação via cookie de sessão do portal, cruza a consulta ao médico e executa o `MemedPrescriptionWidget` já existente. O médico pode ter de iniciar sessão no navegador — a sessão Kotlin **não** é compartilhada automaticamente.
- O endpoint `memed-mobile-context` exige `MEMED_RX_ENABLED=true`, `MEMED_MOBILE_ENABLED=true`, CRM/CFM validado, mesmo piloto, mesmo agendamento e `resolveMemedPatient` (autorização e consentimento). Nenhum dado clínico aparece antes desse check.
- O widget existente chama `memed-event`, que verifica retorno contra o provedor e grava somente `draft` até comprovação independente de assinatura e entrega.
- Prescrições AR mantêm fluxo nativo; BR não usa o emisor AR.

## Não está habilitado em produção
As duas camadas precisam de flags explícitas e devem continuar desligadas:
1. Supabase Edge: `MEMED_MOBILE_ENABLED=true` e `MEMED_MOBILE_PILOT_DOCTOR_ID=<UUID real do médico de homologação clínica>`.
2. Cloudflare web: `MEMED_MOBILE_ENABLED=true`, `MEMED_RX_ENABLED=true` e `MEMED_PILOT_DOCTOR_ID=<mesmo UUID>`.
3. Deploy conjunto das funções e rota mobile em Staging **com o mesmo esquema e políticas de consentimento de produção**, antes de liberar para o piloto.

Nenhuma chave Memed é enviada para Kotlin. As credenciais de produção já pertencem ao backend do portal médico, não à função de preflight. **Não alterar `MEMED_RX_ENABLED` em produção sem médico e paciente legítimos, consentimento e validação de assinatura.**

## Limites conhecidos e próximos gates
- **Sem SSO entre Kotlin e browser**: o médico precisa autenticar no navegador do portal. Não colocar JWT na query ou em deep link como atalho. Um SSO futuro exige um ticket one-time de uso único e curta duração, armazenado apenas como hash, com resgate atômico e controles CSRF. Não está incluído neste PR.
- **Videochamada em background**: validar em Android 12+ se áudio/vídeo continuam ativos com Custom Tabs e se o retorno restaura a consulta. Não prometer suporte de video em background antes dos testes.
- **Memed SDK mobile**: confirmação da Memed e teste em aparelhos Android reais para fullscreen, cookies, assinaturas ICP-Brasil e fluxo de navegação. Não assumir que PDF de homologação é assinatura válida.
- **Base incompleta**: auditoria de 06/11 mostrou 4 pacientes BR, 0 ativos+consentidos; 0 prescrições Memed no banco AutaMedica; Staging sem coluna `patients.care_country`. Deve-se corrigir elegibilidade e paridade **sem fabricar consentimentos ou identidades**.
- **PDF e entrega**: `prescricaoImpressa` não é prova suficiente; reconciliar `prescriptionUuid` e `documents[].prescription_id` com Memed, armazenar PDF de fornecedor com SHA-256 em storage privado, validar assinatura aplicável e permitir acesso somente ao paciente.
- **Homologação DEMO**: PR #704 possui o teste isolado Playwright, não integra o emisor clínico Android. Os cinco registros históricos de homologação não são considerados cinco receitas emitidas.

## Testes
- `node --experimental-strip-types --test supabase/functions/_shared/memed-mobile-policy.test.mjs`
- `./gradlew :app:testDebugUnitTest --tests '*MemedMobileLaunchUrlTest*'` dentro de `apps/android` (CI Android depende de configuração Gradle).
- E2E teste login do médico no navegador → botão da videollamada → preflight → contexto do mesmo médico e paciente → SDK → documento → retorno ao app; rejeições 401/403/503 e ausência de vazamento de tokens.
- Aceite: nenhum link com token/CPF, nenhuma abertura sem CRM+CFM/consentimento/consulta, nenhuma emissão AR pelo módulo BR e nenhuma receita ao paciente antes da verificação.

## Referências
- Memed: https://doc.memed.com.br/docs/boas-praticas-integracao/
- Android Custom Tabs: https://developer.android.com/reference/androidx/browser/customtabs/CustomTabsIntent
- Código: `apps/web/src/lib/prescriptions/brazil/memed-sdk.ts`; `apps/web/src/pages/api/doctors/prescriptions/memed-token.ts`; `apps/web/src/pages/api/doctors/prescriptions/memed-event.ts`
