-- =============================================================================
-- Stazia Tutor: voz em tempo real com sotaque brasileiro. O dono ouviu "muito sotaque".
-- A OpenAI indica marin e cedar como as vozes mais naturais; o Direto usava "ash", mais antiga.
-- Acolhedor e Direto ficam com "cedar"; a Durona segue com "marin". O idioma e o sotaque vão nas instruções (prompt 2.1.0).
-- =============================================================================
update public.tutor_personalities set voice = voice || '{"realtime": "cedar"}'::jsonb where id = 'direto';
update public.tutor_personalities set voice = voice || '{"realtime": "cedar"}'::jsonb where id = 'acolhedor';
update public.tutor_personalities set voice = voice || '{"realtime": "marin"}'::jsonb where id = 'durona';
