import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import i18n from '@/i18n';
import { BasdaiScore, BiologicInjection, DailyLog, Flare, MedicationReminder, UveitisEpisode, UserProfile } from '@/types';

const t = i18n.t.bind(i18n);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
}

function flareDays(start: string, end: string | null): number {
  const s = new Date(start + 'T12:00:00');
  const e = end ? new Date(end + 'T12:00:00') : new Date();
  return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / 86400000));
}

function labelList(values: string[], namespace: string): string {
  return values.map((v) => t(`${namespace}.${v}`)).join(', ');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Picks the _one/_other key directly instead of relying on i18next's
// automatic count-based suffix resolution, which silently falls back to
// v3-style keys and fails to resolve on devices without a working
// Intl.PluralRules (see app/(tabs)/flares.tsx for the same fix).
function tPlural(key: string, count: number): string {
  return count === 1 ? t(`${key}_one`, { count }) : t(`${key}_other`, { count });
}

function basdaiInterpretation(score: number): { label: string; color: string } {
  if (score < 2) return { label: t('pdf_export.basdai_low'), color: '#22C55E' };
  if (score < 4) return { label: t('pdf_export.basdai_moderate'), color: '#EAB308' };
  if (score < 6) return { label: t('pdf_export.basdai_high'), color: '#EF4444' };
  return { label: t('pdf_export.basdai_very_high'), color: '#EF4444' };
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildReportHTML(params: {
  logs: DailyLog[];
  flares: Flare[];
  uveitisEpisodes?: UveitisEpisode[];
  medications: MedicationReminder[];
  biologicInjections?: BiologicInjection[];
  profile: UserProfile;
  basdaiScores?: BasdaiScore[];
  fromDate?: string;
}): string {
  const { logs, flares, uveitisEpisodes = [], medications, biologicInjections = [], profile, basdaiScores } = params;

  const now = new Date();
  const reportStart = params.fromDate
    ? new Date(params.fromDate + 'T00:00:00')
    : (() => { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d; })();

  const reportFromDate = fmtDate(reportStart.toISOString().split('T')[0]);
  const reportToDate = fmtDate(now.toISOString().split('T')[0]);
  const generatedAt = now.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const avgPain = logs.length > 0
    ? (logs.reduce((s, l) => s + l.pain_score, 0) / logs.length).toFixed(1) : t('pdf_export.none_reported');
  const avgFatigue = logs.length > 0
    ? (logs.reduce((s, l) => s + l.fatigue_score, 0) / logs.length).toFixed(1) : t('pdf_export.none_reported');

  const highPainDays = logs.filter(l => l.pain_score >= 7).length;
  const highFatigueDays = logs.filter(l => l.fatigue_score >= 7).length;

  // ── Mood ──────────────────────────────────────────────────────────────────
  const moodCounts: Record<string, number> = { great: 0, good: 0, okay: 0, low: 0, very_low: 0 };
  for (const log of logs) { if (log.mood && log.mood in moodCounts) moodCounts[log.mood]++; }

  // ── Morning stiffness breakdown ───────────────────────────────────────────
  const stiffnessCounts: Record<string, number> = { none: 0, under_30: 0, '30_60': 0, '1_2_hours': 0, over_2_hours: 0 };
  for (const log of logs) { if (log.stiffness_duration && log.stiffness_duration in stiffnessCounts) stiffnessCounts[log.stiffness_duration]++; }
  const prolongedStiffnessDays = (stiffnessCounts['1_2_hours'] ?? 0) + (stiffnessCounts['over_2_hours'] ?? 0);

  // ── Medication adherence ──────────────────────────────────────────────────
  const medYes = logs.filter(l => l.medications_taken === 'yes').length;
  const medPartial = logs.filter(l => l.medications_taken === 'partial').length;
  const medNo = logs.filter(l => l.medications_taken === 'no').length;
  const totalCheckins = medYes + medPartial + medNo;
  const adherencePct = totalCheckins > 0 ? Math.round((medYes / totalCheckins) * 100) : null;

  // ── Exercise ──────────────────────────────────────────────────────────────
  const exerciseDays = logs.filter(l => (l as any).exercise_done).length;
  const exercisePct = logs.length > 0 ? Math.round((exerciseDays / logs.length) * 100) : 0;

  // ── Diet ──────────────────────────────────────────────────────────────────
  const dietLogs = logs.filter(l => l.diet_quality !== null);
  const triggerCounts: Record<string, number> = {};
  dietLogs.forEach(l => { (l.diet_triggers ?? []).forEach(trigger => { triggerCounts[trigger] = (triggerCounts[trigger] ?? 0) + 1; }); });
  const topTriggers = Object.entries(triggerCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // ── All notes ─────────────────────────────────────────────────────────────
  const notesWithContent = logs.filter(l => l.notes && l.notes.trim().length > 0).reverse();

  // ── Medications list ──────────────────────────────────────────────────────
  const medList = medications.filter(m => m.active).map(m => `${m.name}${m.dose ? ` ${m.dose}` : ''} (${m.frequency})`).join(', ');

  // ── Flare rows ────────────────────────────────────────────────────────────
  const asFlares = flares.filter(f => !(f as any).flare_type || (f as any).flare_type === 'as');
  const flareRowsHTML = asFlares.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:#78716C;font-style:italic;">${t('pdf_export.flare_none')}</td></tr>`
    : asFlares.map(f => `
        <tr>
          <td>${fmtDateShort(f.start_date)}</td>
          <td>${f.end_date ? fmtDateShort(f.end_date) : `<em>${t('pdf_export.flare_ongoing')}</em>`}</td>
          <td>${tPlural('pdf_export.flare_days', flareDays(f.start_date, f.end_date))}</td>
          <td style="text-transform:capitalize;">${t(`onboarding.severity.${f.severity}`) || f.severity}</td>
          <td>${f.areas_affected.map(a => a.replace(/_/g, ' ')).join(', ')}</td>
        </tr>`).join('');

  // ── Uveitis rows ──────────────────────────────────────────────────────────
  const uveitisRowsHTML = uveitisEpisodes.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:#78716C;font-style:italic;">${t('pdf_export.uveitis_none')}</td></tr>`
    : uveitisEpisodes.map(e => `
        <tr>
          <td>${fmtDateShort(e.start_date)}</td>
          <td>${e.end_date ? fmtDateShort(e.end_date) : `<em>${t('pdf_export.flare_ongoing')}</em>`}</td>
          <td>${tPlural('pdf_export.flare_days', flareDays(e.start_date, e.end_date))}</td>
          <td style="text-transform:capitalize;">${t(`onboarding.severity.${e.severity}`) || e.severity}</td>
          <td>${capitalize(e.affected_eye)}${t('pdf_export.eye_suffix')}${e.treatment_received ? t('pdf_export.uveitis_treated_suffix') : ''}</td>
        </tr>`).join('');

  // ── Biologic injections ───────────────────────────────────────────────────
  const injectionRowsHTML = biologicInjections.length === 0
    ? `<tr><td colspan="3" style="text-align:center;color:#78716C;font-style:italic;">${t('pdf_export.biologic_none')}</td></tr>`
    : biologicInjections.map(i => `
        <tr>
          <td>${fmtDateShort(i.injected_at.split('T')[0])}</td>
          <td>${i.medication_name}${i.lot_number ? ` (lot: ${i.lot_number})` : ''}</td>
          <td>${i.response_rating !== null ? `${i.response_rating}/5` : t('pdf_export.none_reported')}${i.notes ? ` · ${i.notes}` : ''}</td>
        </tr>`).join('');

  // ── Notes HTML ────────────────────────────────────────────────────────────
  const notesHTML = notesWithContent.length === 0
    ? `<p style="color:#78716C;font-style:italic;">${t('pdf_export.notes_none')}</p>`
    : notesWithContent.map(l => `
        <div class="note-entry">
          <span class="note-date">${fmtDateShort(l.date)}</span>
          <span class="note-text">${l.notes}</span>
        </div>`).join('');

  return `<!DOCTYPE html>
<html lang="${i18n.language}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${t('pdf_export.title')}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      color: #1C1917;
      background: #FFFFFF;
      padding: 40px 48px;
      line-height: 1.5;
    }
    h1 { font-size: 26px; font-weight: 800; color: #F97316; margin-bottom: 4px; }
    h2 {
      font-size: 15px; font-weight: 700; color: #1C1917;
      margin-bottom: 12px; margin-top: 28px;
      padding-bottom: 6px; border-bottom: 2px solid #F97316;
    }
    .header {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid #E7E5E4;
    }
    .header-right { text-align: right; font-size: 12px; color: #78716C; }
    .subtitle { font-size: 13px; color: #78716C; }
    .profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 8px; }
    .profile-row { display: flex; gap: 8px; }
    .profile-label { font-weight: 600; color: #78716C; font-size: 12px; min-width: 140px; }
    .profile-value { font-size: 12px; color: #1C1917; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 13px; }
    th {
      background: #FFF7ED; color: #C2410C; font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.4px; padding: 8px 10px;
      text-align: left; border: 1px solid #E7E5E4;
    }
    td { padding: 8px 10px; border: 1px solid #E7E5E4; vertical-align: top; }
    tr:nth-child(even) td { background: #FAFAF9; }
    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 4px; }
    .stat-box { border: 1px solid #E7E5E4; border-radius: 8px; padding: 14px 12px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: 800; color: #F97316; }
    .stat-label { font-size: 11px; color: #78716C; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.3px; }
    .stat-sub { font-size: 11px; color: #78716C; margin-top: 2px; }
    .mood-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-top: 4px; }
    .mood-box { border: 1px solid #E7E5E4; border-radius: 8px; padding: 10px 8px; text-align: center; }
    .mood-count { font-size: 22px; font-weight: 800; color: #1C1917; }
    .mood-name { font-size: 11px; color: #78716C; margin-top: 4px; }
    .stiff-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-top: 4px; }
    .stiff-box { border: 1px solid #E7E5E4; border-radius: 8px; padding: 10px 8px; text-align: center; }
    .stiff-count { font-size: 20px; font-weight: 800; color: #1C1917; }
    .stiff-label { font-size: 10px; color: #78716C; margin-top: 4px; }
    .adherence-row { display: flex; gap: 16px; margin-top: 4px; }
    .adh-box { border: 1px solid #E7E5E4; border-radius: 8px; padding: 12px 16px; text-align: center; min-width: 80px; }
    .adh-count { font-size: 22px; font-weight: 800; }
    .adh-label { font-size: 11px; color: #78716C; margin-top: 4px; }
    .note-entry { display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px solid #E7E5E4; font-size: 13px; }
    .note-date { font-weight: 700; color: #78716C; min-width: 70px; flex-shrink: 0; }
    .note-text { color: #1C1917; }
    .callout {
      background: #FFF7ED; border: 1px solid #FDBA74; border-radius: 8px;
      padding: 10px 14px; margin-top: 8px; font-size: 12px; color: #78716C;
    }
    .footer {
      margin-top: 40px; padding-top: 16px; border-top: 1px solid #E7E5E4;
      font-size: 11px; color: #A8A29E; text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>${t('pdf_export.title')}</h1>
      <p class="subtitle">${t('pdf_export.subtitle')}</p>
    </div>
    <div class="header-right">
      <div>${t('pdf_export.generated_label')}: ${generatedAt}</div>
      <div>${t('pdf_export.period_label')}: ${t('pdf_export.period_range', { from: reportFromDate, to: reportToDate })}</div>
      <div style="margin-top:4px;">${tPlural('pdf_export.days_tracked', logs.length)}</div>
    </div>
  </div>

  <!-- Patient info -->
  <h2>${t('pdf_export.section_patient_profile')}</h2>
  <div class="profile-grid">
    <div class="profile-row">
      <span class="profile-label">${t('pdf_export.field_age_range')}</span>
      <span class="profile-value">${profile.age_range ? t(`onboarding.age_range.${profile.age_range}`) : t('pdf_export.none_reported')}</span>
    </div>
    <div class="profile-row">
      <span class="profile-label">${t('pdf_export.field_years_since_diagnosis')}</span>
      <span class="profile-value">${profile.diagnosis_years ? t(`onboarding.diagnosis_years.${profile.diagnosis_years}`) : t('pdf_export.none_reported')}</span>
    </div>
    <div class="profile-row">
      <span class="profile-label">${t('pdf_export.field_self_reported_activity')}</span>
      <span class="profile-value">${profile.severity ? t(`onboarding.severity.${profile.severity}`) : t('pdf_export.none_reported')}</span>
    </div>
    <div class="profile-row">
      <span class="profile-label">${t('pdf_export.field_active_medications')}</span>
      <span class="profile-value">${medList || t('pdf_export.none_reported')}</span>
    </div>
    <div class="profile-row">
      <span class="profile-label">${t('pdf_export.field_primary_pain_locations')}</span>
      <span class="profile-value">${profile.pain_locations.length > 0 ? labelList(profile.pain_locations, 'onboarding.pain_locations') : t('pdf_export.none_reported')}</span>
    </div>
    <div class="profile-row">
      <span class="profile-label">${t('pdf_export.field_associated_conditions')}</span>
      <span class="profile-value">${profile.conditions.length > 0 ? labelList(profile.conditions, 'onboarding.conditions') : t('pdf_export.none_reported')}</span>
    </div>
  </div>

  <!-- Pain & Fatigue -->
  <h2>${t('pdf_export.section_pain_fatigue')}</h2>
  <div class="stat-grid">
    <div class="stat-box">
      <div class="stat-value">${avgPain}</div>
      <div class="stat-label">${t('pdf_export.stat_avg_pain')}</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${avgFatigue}</div>
      <div class="stat-label">${t('pdf_export.stat_avg_fatigue')}</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${highPainDays}</div>
      <div class="stat-label">${t('pdf_export.stat_high_pain_days')}</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${highFatigueDays}</div>
      <div class="stat-label">${t('pdf_export.stat_high_fatigue_days')}</div>
    </div>
  </div>

  <!-- Morning Stiffness -->
  <h2>${t('pdf_export.section_morning_stiffness')}</h2>
  <div class="stiff-grid">
    <div class="stiff-box">
      <div class="stiff-count">${stiffnessCounts.none ?? 0}</div>
      <div class="stiff-label">${t('onboarding.morning_stiffness.none')}</div>
    </div>
    <div class="stiff-box">
      <div class="stiff-count">${stiffnessCounts.under_30 ?? 0}</div>
      <div class="stiff-label">${t('onboarding.morning_stiffness.under_30')}</div>
    </div>
    <div class="stiff-box">
      <div class="stiff-count">${stiffnessCounts['30_60'] ?? 0}</div>
      <div class="stiff-label">${t('onboarding.morning_stiffness.30_60')}</div>
    </div>
    <div class="stiff-box">
      <div class="stiff-count">${stiffnessCounts['1_2_hours'] ?? 0}</div>
      <div class="stiff-label">${t('onboarding.morning_stiffness.1_2_hours')}</div>
    </div>
    <div class="stiff-box">
      <div class="stiff-count" style="color:${prolongedStiffnessDays > 0 ? '#EF4444' : '#1C1917'}">${stiffnessCounts.over_2_hours ?? 0}</div>
      <div class="stiff-label">${t('onboarding.morning_stiffness.over_2_hours')}</div>
    </div>
  </div>
  ${prolongedStiffnessDays > 0 ? `<p class="callout">⚠ ${tPlural('pdf_export.stiffness_callout', prolongedStiffnessDays)}</p>` : ''}

  <!-- Mood -->
  <h2>${t('pdf_export.section_mood')}</h2>
  <div class="mood-grid">
    <div class="mood-box"><div class="mood-count">${moodCounts.great}</div><div class="mood-name">${t('tracker.mood_great')}</div></div>
    <div class="mood-box"><div class="mood-count">${moodCounts.good}</div><div class="mood-name">${t('tracker.mood_good')}</div></div>
    <div class="mood-box"><div class="mood-count">${moodCounts.okay}</div><div class="mood-name">${t('tracker.mood_okay')}</div></div>
    <div class="mood-box"><div class="mood-count">${moodCounts.low}</div><div class="mood-name">${t('tracker.mood_low')}</div></div>
    <div class="mood-box"><div class="mood-count">${moodCounts.very_low}</div><div class="mood-name">${t('tracker.mood_very_low')}</div></div>
  </div>

  <!-- Exercise -->
  <h2>${t('pdf_export.section_exercise')}</h2>
  <p style="font-size:13px;">${t('pdf_export.exercise_summary', { days: exerciseDays, total: logs.length, pct: exercisePct })}
    ${exercisePct >= 50 ? t('pdf_export.exercise_good') : exercisePct === 0 ? t('pdf_export.exercise_none') : t('pdf_export.exercise_moderate')}</p>

  ${topTriggers.length > 0 ? `
  <!-- Diet -->
  <h2>${t('pdf_export.section_diet')}</h2>
  <table>
    <thead><tr><th>${t('pdf_export.diet_trigger_header')}</th><th>${t('pdf_export.diet_days_logged_header')}</th></tr></thead>
    <tbody>
      ${topTriggers.map(([trigger, n]) => `<tr><td>${t(`pdf_export.diet_trigger_${trigger}`) || trigger}</td><td>${n}</td></tr>`).join('')}
    </tbody>
  </table>
  <p class="callout">${t('pdf_export.diet_callout')}</p>
  ` : ''}

  <!-- BASDAI -->
  ${basdaiScores && basdaiScores.length > 0 ? `
  <h2>${t('pdf_export.section_basdai')}</h2>
  <table>
    <thead><tr><th>${t('pdf_export.basdai_date_header')}</th><th>${t('pdf_export.basdai_score_header')}</th><th>${t('pdf_export.basdai_interpretation_header')}</th><th>${t('pdf_export.basdai_q1_header')}</th><th>${t('pdf_export.basdai_q2_header')}</th><th>${t('pdf_export.basdai_q56_header')}</th></tr></thead>
    <tbody>
      ${basdaiScores.map(s => {
        const interp = basdaiInterpretation(s.score);
        const stiffAvg = ((s.q5 + s.q6) / 2).toFixed(1);
        return `<tr>
          <td>${fmtDateShort(s.date)}</td>
          <td style="font-weight:700;color:${interp.color};">${s.score.toFixed(1)}/10</td>
          <td>${interp.label}</td>
          <td>${s.q1}/10</td>
          <td>${s.q2}/10</td>
          <td>${stiffAvg}/10</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
  <p class="callout">${t('pdf_export.basdai_callout')}</p>
  ` : ''}

  <!-- AS Flares -->
  <h2>${t('pdf_export.section_as_flares')}</h2>
  <table>
    <thead>
      <tr><th>${t('pdf_export.flare_start_header')}</th><th>${t('pdf_export.flare_end_header')}</th><th>${t('pdf_export.flare_duration_header')}</th><th>${t('pdf_export.flare_severity_header')}</th><th>${t('pdf_export.flare_areas_header')}</th></tr>
    </thead>
    <tbody>${flareRowsHTML}</tbody>
  </table>

  <!-- Uveitis -->
  <h2>${t('pdf_export.section_uveitis')}</h2>
  <table>
    <thead>
      <tr><th>${t('pdf_export.flare_start_header')}</th><th>${t('pdf_export.flare_end_header')}</th><th>${t('pdf_export.flare_duration_header')}</th><th>${t('pdf_export.flare_severity_header')}</th><th>${t('pdf_export.uveitis_eye_treatment_header')}</th></tr>
    </thead>
    <tbody>${uveitisRowsHTML}</tbody>
  </table>

  <!-- Biologic injections -->
  ${biologicInjections.length > 0 ? `
  <h2>${t('pdf_export.section_biologic_injections')}</h2>
  <table>
    <thead><tr><th>${t('pdf_export.biologic_date_header')}</th><th>${t('pdf_export.biologic_medication_header')}</th><th>${t('pdf_export.biologic_response_header')}</th></tr></thead>
    <tbody>${injectionRowsHTML}</tbody>
  </table>
  ` : ''}

  <!-- Medication adherence -->
  <h2>${t('pdf_export.section_medication_adherence')}</h2>
  <div class="adherence-row">
    <div class="adh-box">
      <div class="adh-count" style="color:#22C55E;">${medYes}</div>
      <div class="adh-label">${t('pdf_export.adherence_fully_taken')}</div>
    </div>
    <div class="adh-box">
      <div class="adh-count" style="color:#EAB308;">${medPartial}</div>
      <div class="adh-label">${t('pdf_export.adherence_partial')}</div>
    </div>
    <div class="adh-box">
      <div class="adh-count" style="color:#EF4444;">${medNo}</div>
      <div class="adh-label">${t('pdf_export.adherence_missed')}</div>
    </div>
    <div class="adh-box">
      <div class="adh-count" style="color:#78716C;">${totalCheckins}</div>
      <div class="adh-label">${t('pdf_export.adherence_total_checkins')}</div>
    </div>
    ${adherencePct !== null ? `
    <div class="adh-box">
      <div class="adh-count" style="color:${adherencePct >= 80 ? '#22C55E' : adherencePct >= 50 ? '#EAB308' : '#EF4444'};">${adherencePct}%</div>
      <div class="adh-label">${t('pdf_export.adherence_rate')}</div>
    </div>` : ''}
  </div>

  <!-- Patient notes -->
  <h2>${t('pdf_export.section_notes')}</h2>
  ${notesHTML}

  <div class="footer">
    ${t('pdf_export.footer_text', { date: generatedAt })}
  </div>
</body>
</html>`;
}

// ─── generateAndShareReport ───────────────────────────────────────────────────

export async function generateAndShareReport(params: {
  logs: DailyLog[];
  flares: Flare[];
  uveitisEpisodes?: UveitisEpisode[];
  medications: MedicationReminder[];
  biologicInjections?: BiologicInjection[];
  profile: UserProfile;
  basdaiScores?: BasdaiScore[];
  fromDate?: string;
}): Promise<void> {
  const html = buildReportHTML(params);

  const { uri } = await Print.printToFileAsync({ html });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is not available on this device.');

  const dateStamp = new Date().toISOString().split('T')[0];
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: `spondy_health_summary_${dateStamp}.pdf`,
    UTI: 'com.adobe.pdf',
  });
}
