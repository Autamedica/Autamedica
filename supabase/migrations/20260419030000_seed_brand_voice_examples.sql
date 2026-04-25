-- Seed inicial de brand_voice_examples (RAG para writer agent)
-- Aplicar: psql o SQL Editor en Supabase dashboard, DESPUES de aplicar la migration principal.
-- Los embeddings se generan al insertar via worker/trigger; aca solo seedeamos content.

insert into growth_os.brand_voice_examples (channel, language, content, performance_score, tags) values

-- ─── LinkedIn (B2B, tono profesional directo) ───
('linkedin', 'es-AR',
'Cuatro anos construyendo AutaMedica y hoy llegamos a 5.000 consultas mensuales. El dato que mas me importa: 68% vinieron de pacientes de interior que no tenian acceso a especialistas. La telemedicina no reemplaza la presencial, la complementa donde el sistema no llega. Si tu empresa quiere incorporar salud digital para empleados, hablemos.',
0.85, array['milestone','b2b','impact']),

('linkedin', 'es-AR',
'Un lunes cualquiera en AutaMedica: 312 consultas atendidas, 4 especialistas de guardia simultaneos, 2 derivaciones a urgencia presencial gestionadas en menos de 10 minutos. No es magia, es infraestructura. Si sos medico o queres entender como funciona por dentro, te mando la demo.',
0.78, array['operations','demo-cta']),

('linkedin', 'pt-BR',
'Quatro anos construindo AutaMedica e hoje chegamos a 5 mil consultas mensais. Mas o dado que mais importa: 68% vieram de pacientes do interior sem acesso a especialistas. Telemedicina nao substitui presencial, complementa onde o sistema nao chega.',
0.80, array['milestone','b2b','pt-br']),

-- ─── Email (nurturing, tono cercano) ───
('email', 'es-AR',
'Hola {{first_name}}, la semana pasada agendaste una consulta con cardiologia. Queria avisarte que ya esta disponible el informe completo en tu perfil. Si tenes dudas, respondeme este email directo — lo leo yo, no un bot. Abrazo.',
0.92, array['followup','personal']),

('email', 'es-AR',
'Pronto arranca el invierno y con el los cuadros respiratorios. Si tu empresa tiene empleados con chicos chicos en casa, un plan de telemedicina 24/7 te cambia el Q3. 30 min de demo y te mando numeros concretos. {{calendly_link}}',
0.74, array['seasonal','b2b','cta']),

-- ─── WhatsApp (1-a-1, maximo 500 chars, conversacional) ───
('wa', 'es-AR',
'Hola {{first_name}}! Tu turno con {{doctor}} es manana a las {{time}}. Te llega el link 10 min antes. Si necesitas reprogramar, contestame aca mismo.',
0.88, array['reminder','template']),

('wa', 'es-AR',
'Vi que empezaste a cargar tu historia clinica pero la dejaste por la mitad. Si tenes un minuto termina con esto — te ahorra 10 min en la proxima consulta: {{link}}',
0.71, array['reactivation']),

('wa', 'es-AR',
'Che, {{first_name}}, me avisan desde farmacia que tu receta para {{med}} vence el {{date}}. Queres que coordine renovacion con tu medica o ya tenes turno?',
0.83, array['care-continuity']),

-- ─── Reel/Short script (30s, hook + payoff) ───
('reel_script', 'es-AR',
'[0-3s, hook] No necesitas ir al hospital para ver un cardiologo. [3-15s] En AutaMedica, 23 especialidades, turno el mismo dia, historia clinica portable. [15-25s] Consultas desde donde estes, con medicos matriculados, cubierto por la mayoria de las prepagas. [25-30s] Link en bio.',
0.76, array['reach','product-explain']),

('reel_script', 'es-AR',
'[0-3s] "Mi vieja vive en Jujuy, yo en Bs As". [3-15s] Con AutaMedica mi mama tiene su clinica semanal con su cardiologa sin moverse de la casa. [15-25s] Yo veo los informes, coordino la medicacion desde el celular. [25-30s] Link en bio — la app que cambia como cuidamos a los nuestros.',
0.89, array['storytelling','family']),

('reel_script', 'pt-BR',
'[0-3s] "Minha mae mora em Jujuy, eu em Buenos Aires." [3-15s] Com AutaMedica minha mae tem a consulta semanal com a cardiologista dela sem sair de casa. [15-25s] Eu vejo os laudos, coordeno a medicacao pelo celular. [25-30s] Link na bio.',
0.81, array['storytelling','family','pt-br'])
on conflict do nothing;
