# Prescri BR — sandbox REST para provar emissão de PDF (somente teste)

**Status:** implementação em branch, sem deploy e sem credenciais de fornecedor. Não substitui Memed nem altera o fluxo clínico de prescrições em produção.

Referência contratual: https://www.prescri.com.br/openapi.json (OpenAPI 3.1, v1.3.0)
Documentação do sandbox: https://www.prescri.com.br/documentacao-api#sandbox

## Arquitetura

Android Kotlin (app médico/admin) -> Supabase Edge Function 'prescri-br-sandbox'
-> API REST Prescri com X-API-Key / X-API-Secret exclusivamente no servidor.

A Edge Function exige JWT de usuário autenticado, perfil ativo com papel
\`admin\` ou \`platform_admin\`, e \`PRESCRI_SANDBOX_ENABLED=true\`.
Rejeita corpo contendo qualquer campo além de \`action\`.
Não recebe identificador de paciente ou médico, CPF, URL de PDF ou medicamento.

## Configuração em ambiente não produtivo

Gerar credenciais no portal Prescri -> API e Integrações -> Credenciais de teste.
Somente chaves com prefixo \`pk_test_\` / \`sk_test_\` são aceitas.

Configurar como Edge secrets (NUNCA em GitHub, Kotlin, BuildConfig ou logs):
- \`PRESCRI_TEST_API_KEY\`
- \`PRESCRI_TEST_API_SECRET\`
- \`PRESCRI_SANDBOX_ENABLED=true\`

Não configurar estas credenciais nem o switch em produção, e não reutilizar
chaves de produção (\`pk_live_\` / \`sk_live_\`).

## Contrato da função (POST JWT admin)

1. \`{"action":"document_types"}\` — catálogo somente leitura, sem IDs clínicos.
2. \`{"action":"create_demo"}\` — gera o MESMO documento de teste usando
   \`external_id=autamedica-br-prescri-api-sandbox-pdf-v1\` e
   \`idempotency_by_external_id=true\` / \`Idempotency-Key\` fixo.
3. \`{"action":"get_demo"}\` — consulta por \`external_id\` no sandbox.
4. \`{"action":"download_demo_pdf"}\` — consulta o status primeiro e entrega
   \`application/pdf\` somente se o provedor comprovar \`sandbox=true\`,
   \`cryptographically_signed=false\`, \`status=signed\`, identificador
   \`test_sig_*\` e \`external_id\` exato. Valida %PDF-/%%EOF e devolve SHA-256
   em \`X-Document-SHA256\`.

Exemplo de chamada autenticada (sem incluir nenhuma chave Prescri no cliente):
\`\`\`json
{"action":"get_demo"}
\`\`\`

Kotlin: \`PrescriSandboxRepository\` oferece \`createDemoDocument\`,
\`getDemoStatus\`, \`getDocumentTypes\` e \`downloadDemoPdf\`. Não conectar
ao fluxo de receitas do paciente ou ao \`PrescriptionRepository\`.
Nenhum PDF deve ser apresentado como documento clínico válido.

## Segurança e limitações

- Apenas documento sintético sem fármacos, emitido no sandbox por credenciais teste.
- \`doctor_cpf=00000000000\`; \`delivery.whatsapp=false\` e
  \`delivery.email=false\`; sem callbacks, webhook ou SNCR.
- Respostas do sandbox têm \`status=signed\`, porém
  \`cryptographically_signed=false\` e não têm valor jurídico.
- Não registra em \`public.prescriptions\`, não gera CUIR, não associa pacientes
  reais ou médicos a documentos fictícios.
- Apenas valida o contrato HTTP e autenticidade dos bytes recebidos do fornecedor;
  não comprova qualidade técnica da impressão nem assinatura ICP-Brasil.
- Idempotência evita repetir a MESMA solicitação; mudar \`external_id\`/conteúdo
  pode produzir outro registro.
- Sandbox não gera nem envia mensagens externas, conforme documentação
  do fornecedor, mas é igualmente desativado explicitamente no payload.
- O backend evita transmitir segredos ou conteúdo clínico em logs e erros.
- Não há endpoint para fornecer CPF ou \`pdf_url\` arbitrário: isso pertence a
  uma integração clínica futura separada, sujeita à autorização do médico, CFM,
  relacionamento médico-paciente, controle de país e assinatura verificável.

## Critérios de aceite

1. Testes sem rede aprovados: chaves live rejeitadas; idempotência; fixture
   fictícia; ausência de delivery; status/ID sandbox; validação do PDF.
2. Deploy apenas em ambiente de teste isolado; JWT administrativo obrigatório.
3. Credenciais pk_test_ e sk_test_ obtidas legitimamente no portal.
4. GET tipos (sem emissão), create_demo uma única vez, get_demo e PDF.
5. Registrar ID, bytes, SHA-256, \`sandbox=true\`,
   \`cryptographically_signed=false\`; verificar PDF visualmente.
6. Nenhum dado pessoal real, mensagem ou documento clínico alterado.
7. Antes de habilitar clínica: fluxo totalmente distinto, assinatura do médico
   com certificado válido, identificação e autorização da consulta, regras CFM/
   LGPD/SNCR e verificação independente da validade jurídica.

Para rodar testes offline:
\`\`\`sh
node --experimental-strip-types --test supabase/functions/_shared/prescri-sandbox-client.test.mjs
\`\`\`
