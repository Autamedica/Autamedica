
DECLARE
  m record;
  v_no_shows integer;
  v_total_appts integer;
  v_tele_completed integer;
  v_doctor_age_months integer;
BEGIN
  SELECT * INTO m FROM public.doctor_ranking_metrics WHERE doctor_id = target_doctor_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- ── clinical_excellence (avg_clinical_quality + review volume) ──
  IF m.avg_clinical_quality >= 4.8 AND m.total_reviews >= 50 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'clinical_excellence', 'platinum', 'Calidad clinica excepcional sostenida en 50+ evaluaciones')
    ON CONFLICT (doctor_id, badge) DO UPDATE SET level = 'platinum', description = EXCLUDED.description;
  ELSIF m.avg_clinical_quality >= 4.5 AND m.total_reviews >= 25 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'clinical_excellence', 'gold', 'Excelencia clinica consistente en 25+ evaluaciones')
    ON CONFLICT (doctor_id, badge) DO UPDATE SET level = GREATEST(doctor_badges.level, 'gold'::badge_level), description = EXCLUDED.description;
  ELSIF m.avg_clinical_quality >= 4.0 AND m.total_reviews >= 10 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'clinical_excellence', 'silver', 'Alta calidad clinica en 10+ evaluaciones')
    ON CONFLICT (doctor_id, badge) DO UPDATE SET level = GREATEST(doctor_badges.level, EXCLUDED.level), description = EXCLUDED.description;
  ELSIF m.avg_clinical_quality >= 3.5 AND m.total_reviews >= 3 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'clinical_excellence', 'bronze', 'Buena calidad clinica reconocida por pacientes')
    ON CONFLICT (doctor_id, badge) DO NOTHING;
  END IF;

  -- ── patient_favorite (avg_rating + review volume) ──
  IF m.avg_rating >= 4.8 AND m.total_reviews >= 50 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'patient_favorite', 'platinum', 'Valoracion excepcional de 50+ pacientes')
    ON CONFLICT (doctor_id, badge) DO UPDATE SET level = 'platinum', description = EXCLUDED.description;
  ELSIF m.avg_rating >= 4.5 AND m.total_reviews >= 30 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'patient_favorite', 'gold', 'Favorito de 30+ pacientes')
    ON CONFLICT (doctor_id, badge) DO UPDATE SET level = GREATEST(doctor_badges.level, 'gold'::badge_level), description = EXCLUDED.description;
  ELSIF m.avg_rating >= 4.0 AND m.total_reviews >= 15 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'patient_favorite', 'silver', 'Muy bien valorado por 15+ pacientes')
    ON CONFLICT (doctor_id, badge) DO UPDATE SET level = GREATEST(doctor_badges.level, EXCLUDED.level), description = EXCLUDED.description;
  ELSIF m.avg_rating >= 3.5 AND m.total_reviews >= 5 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'patient_favorite', 'bronze', 'Bien valorado por pacientes')
    ON CONFLICT (doctor_id, badge) DO NOTHING;
  END IF;

  -- ── punctuality_star (avg_punctuality + review volume) ──
  IF m.avg_punctuality >= 4.8 AND m.total_reviews >= 40 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'punctuality_star', 'platinum', 'Puntualidad impecable en 40+ evaluaciones')
    ON CONFLICT (doctor_id, badge) DO UPDATE SET level = 'platinum', description = EXCLUDED.description;
  ELSIF m.avg_punctuality >= 4.5 AND m.total_reviews >= 20 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'punctuality_star', 'gold', 'Excelente puntualidad en 20+ evaluaciones')
    ON CONFLICT (doctor_id, badge) DO UPDATE SET level = GREATEST(doctor_badges.level, 'gold'::badge_level), description = EXCLUDED.description;
  ELSIF m.avg_punctuality >= 4.0 AND m.total_reviews >= 10 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'punctuality_star', 'silver', 'Buena puntualidad en 10+ evaluaciones')
    ON CONFLICT (doctor_id, badge) DO UPDATE SET level = GREATEST(doctor_badges.level, EXCLUDED.level), description = EXCLUDED.description;
  ELSIF m.avg_punctuality >= 3.5 AND m.total_reviews >= 3 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'punctuality_star', 'bronze', 'Puntualidad reconocida por pacientes')
    ON CONFLICT (doctor_id, badge) DO NOTHING;
  END IF;

  -- ── high_volume (completed_consultations) ──
  IF m.completed_consultations >= 500 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'high_volume', 'platinum', '500+ consultas completadas')
    ON CONFLICT (doctor_id, badge) DO UPDATE SET level = 'platinum', description = EXCLUDED.description;
  ELSIF m.completed_consultations >= 150 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'high_volume', 'gold', '150+ consultas completadas')
    ON CONFLICT (doctor_id, badge) DO UPDATE SET level = GREATEST(doctor_badges.level, 'gold'::badge_level), description = EXCLUDED.description;
  ELSIF m.completed_consultations >= 50 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'high_volume', 'silver', '50+ consultas completadas')
    ON CONFLICT (doctor_id, badge) DO UPDATE SET level = GREATEST(doctor_badges.level, EXCLUDED.level), description = EXCLUDED.description;
  ELSIF m.completed_consultations >= 10 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'high_volume', 'bronze', '10+ consultas completadas')
    ON CONFLICT (doctor_id, badge) DO NOTHING;
  END IF;

  -- ── mentor (total_consultations + avg_communication) ──
  IF m.total_consultations >= 250 AND m.avg_communication >= 4.8 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'mentor', 'platinum', 'Comunicador excepcional con 250+ consultas')
    ON CONFLICT (doctor_id, badge) DO UPDATE SET level = 'platinum', description = EXCLUDED.description;
  ELSIF m.total_consultations >= 100 AND m.avg_communication >= 4.5 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'mentor', 'gold', 'Excelente comunicador con 100+ consultas')
    ON CONFLICT (doctor_id, badge) DO UPDATE SET level = GREATEST(doctor_badges.level, 'gold'::badge_level), description = EXCLUDED.description;
  ELSIF m.total_consultations >= 50 AND m.avg_communication >= 4.0 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'mentor', 'silver', 'Buena comunicacion con 50+ consultas')
    ON CONFLICT (doctor_id, badge) DO UPDATE SET level = GREATEST(doctor_badges.level, EXCLUDED.level), description = EXCLUDED.description;
  ELSIF m.total_consultations >= 20 AND m.avg_communication >= 3.5 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'mentor', 'bronze', 'Comunicacion efectiva con pacientes')
    ON CONFLICT (doctor_id, badge) DO NOTHING;
  END IF;

  -- ── early_adopter (account age in months) ──
  SELECT EXTRACT(MONTH FROM AGE(now(), d.created_at))::integer
    + (EXTRACT(YEAR FROM AGE(now(), d.created_at))::integer * 12)
  INTO v_doctor_age_months
  FROM public.doctors d WHERE d.id = target_doctor_id;

  IF v_doctor_age_months IS NOT NULL THEN
    IF v_doctor_age_months >= 24 THEN
      INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
      VALUES (target_doctor_id, 'early_adopter', 'platinum', 'Miembro de la plataforma por 2+ anos')
      ON CONFLICT (doctor_id, badge) DO UPDATE SET level = 'platinum', description = EXCLUDED.description;
    ELSIF v_doctor_age_months >= 12 THEN
      INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
      VALUES (target_doctor_id, 'early_adopter', 'gold', 'Miembro de la plataforma por 1+ ano')
      ON CONFLICT (doctor_id, badge) DO UPDATE SET level = GREATEST(doctor_badges.level, 'gold'::badge_level), description = EXCLUDED.description;
    ELSIF v_doctor_age_months >= 6 THEN
      INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
      VALUES (target_doctor_id, 'early_adopter', 'silver', 'Miembro de la plataforma por 6+ meses')
      ON CONFLICT (doctor_id, badge) DO UPDATE SET level = GREATEST(doctor_badges.level, EXCLUDED.level), description = EXCLUDED.description;
    ELSIF v_doctor_age_months >= 3 THEN
      INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
      VALUES (target_doctor_id, 'early_adopter', 'bronze', 'Adoptante temprano de la plataforma')
      ON CONFLICT (doctor_id, badge) DO NOTHING;
    END IF;
  END IF;

  -- ── zero_no_show (0 no-shows out of N appointments) ──
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'no_show')
  INTO v_total_appts, v_no_shows
  FROM public.appointments
  WHERE doctor_id = target_doctor_id;

  IF v_no_shows = 0 AND v_total_appts >= 100 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'zero_no_show', 'platinum', 'Cero ausencias en 100+ citas')
    ON CONFLICT (doctor_id, badge) DO UPDATE SET level = 'platinum', description = EXCLUDED.description;
  ELSIF v_no_shows = 0 AND v_total_appts >= 50 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'zero_no_show', 'gold', 'Cero ausencias en 50+ citas')
    ON CONFLICT (doctor_id, badge) DO UPDATE SET level = GREATEST(doctor_badges.level, 'gold'::badge_level), description = EXCLUDED.description;
  ELSIF v_no_shows = 0 AND v_total_appts >= 20 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'zero_no_show', 'silver', 'Cero ausencias en 20+ citas')
    ON CONFLICT (doctor_id, badge) DO UPDATE SET level = GREATEST(doctor_badges.level, EXCLUDED.level), description = EXCLUDED.description;
  ELSIF v_no_shows = 0 AND v_total_appts >= 5 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'zero_no_show', 'bronze', 'Asistencia perfecta')
    ON CONFLICT (doctor_id, badge) DO NOTHING;
  END IF;

  -- ── telemedicine_pioneer (completed telemedicine appointments) ──
  SELECT COUNT(*)
  INTO v_tele_completed
  FROM public.appointments
  WHERE doctor_id = target_doctor_id AND type = 'telemedicine' AND status = 'completed';

  IF v_tele_completed >= 100 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'telemedicine_pioneer', 'platinum', '100+ teleconsultas completadas')
    ON CONFLICT (doctor_id, badge) DO UPDATE SET level = 'platinum', description = EXCLUDED.description;
  ELSIF v_tele_completed >= 50 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'telemedicine_pioneer', 'gold', '50+ teleconsultas completadas')
    ON CONFLICT (doctor_id, badge) DO UPDATE SET level = GREATEST(doctor_badges.level, 'gold'::badge_level), description = EXCLUDED.description;
  ELSIF v_tele_completed >= 20 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'telemedicine_pioneer', 'silver', '20+ teleconsultas completadas')
    ON CONFLICT (doctor_id, badge) DO UPDATE SET level = GREATEST(doctor_badges.level, EXCLUDED.level), description = EXCLUDED.description;
  ELSIF v_tele_completed >= 5 THEN
    INSERT INTO public.doctor_badges (doctor_id, badge, level, description)
    VALUES (target_doctor_id, 'telemedicine_pioneer', 'bronze', 'Pionero en telemedicina')
    ON CONFLICT (doctor_id, badge) DO NOTHING;
  END IF;
END;
