import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { BasdaiScore, BiologicInjection, DailyLog, Flare, MedicationReminder, UveitisEpisode, UserProfile } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function flareDays(start: string, end: string | null): number {
  const s = new Date(start + 'T12:00:00');
  const e = end ? new Date(end + 'T12:00:00') : new Date();
  return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / 86400000));
}

function labelAgeRange(v: string | null): string {
  if (!v) return '—';
  const map: Record<string, string> = {
    under_25: 'Under 25', '25_35': '25–35', '35_45': '35–45',
    '45_55': '45–55', '55_plus': '55+',
  };
  return map[v] ?? v;
}

function labelDiagnosisYears(v: string | null): string {
  if (!v) return '—';
  const map: Record<string, string> = {
    under_1: 'Less than 1 year', '1_3': '1–3 years', '3_5': '3–5 years',
    '5_10': '5–10 years', '10_plus': 'More than 10 years',
  };
  return map[v] ?? v;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function moodLabel(mood: string | null): string {
  const map: Record<string, string> = {
    great: 'Great', good: 'Good', okay: 'Okay', low: 'Low', very_low: 'Very Low',
  };
  return mood ? (map[mood] ?? mood) : '—';
}

function stiffnessLabel(v: string | null): string {
  const map: Record<string, string> = {
    none: 'None', under_30: '<30 min', '30_60': '30–60 min',
    '1_2_hours': '1–2 h', over_2_hours: '>2 h',
  };
  return v ? (map[v] ?? v) : '—';
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
  const generatedAt = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const avgPain = logs.length > 0
    ? (logs.reduce((s, l) => s + l.pain_score, 0) / logs.length).toFixed(1) : '—';
  const avgFatigue = logs.length > 0
    ? (logs.reduce((s, l) => s + l.fatigue_score, 0) / logs.length).toFixed(1) : '—';

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
  const TRIGGER_LABELS: Record<string, string> = {
    alcohol: 'Alcohol', processed: 'Processed food', high_sugar: 'High sugar',
    high_starch: 'High starch/wheat', dairy: 'Dairy', red_meat: 'Red meat', nightshades: 'Nightshades',
  };
  const dietLogs = logs.filter(l => l.diet_quality !== null);
  const triggerCounts: Record<string, number> = {};
  dietLogs.forEach(l => { (l.diet_triggers ?? []).forEach(t => { triggerCounts[t] = (triggerCounts[t] ?? 0) + 1; }); });
  const topTriggers = Object.entries(triggerCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // ── All notes ─────────────────────────────────────────────────────────────
  const notesWithContent = logs.filter(l => l.notes && l.notes.trim().length > 0).reverse();

  // ── Medications list ──────────────────────────────────────────────────────
  const medList = medications.filter(m => m.active).map(m => `${m.name}${m.dose ? ` ${m.dose}` : ''} (${m.frequency})`).join(', ');

  // ── Flare rows ────────────────────────────────────────────────────────────
  const asFlares = flares.filter(f => !(f as any).flare_type || (f as any).flare_type === 'as');
  const flareRowsHTML = asFlares.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:#78716C;font-style:italic;">No AS flares recorded in this period</td></tr>`
    : asFlares.map(f => `
        <tr>
          <td>${fmtDateShort(f.start_date)}</td>
          <td>${f.end_date ? fmtDateShort(f.end_date) : '<em>Ongoing</em>'}</td>
          <td>${flareDays(f.start_date, f.end_date)} days</td>
          <td style="text-transform:capitalize;">${f.severity}</td>
          <td>${f.areas_affected.map(a => a.replace(/_/g, ' ')).join(', ')}</td>
        </tr>`).join('');

  // ── Uveitis rows ──────────────────────────────────────────────────────────
  const uveitisRowsHTML = uveitisEpisodes.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:#78716C;font-style:italic;">No uveitis episodes recorded in this period</td></tr>`
    : uveitisEpisodes.map(e => `
        <tr>
          <td>${fmtDateShort(e.start_date)}</td>
          <td>${e.end_date ? fmtDateShort(e.end_date) : '<em>Ongoing</em>'}</td>
          <td>${flareDays(e.start_date, e.end_date)} days</td>
          <td style="text-transform:capitalize;">${e.severity}</td>
          <td>${capitalize(e.affected_eye)} eye${e.treatment_received ? ', treated' : ''}</td>
        </tr>`).join('');

  // ── Biologic injections ───────────────────────────────────────────────────
  const injectionRowsHTML = biologicInjections.length === 0
    ? `<tr><td colspan="3" style="text-align:center;color:#78716C;font-style:italic;">No injections recorded</td></tr>`
    : biologicInjections.map(i => `
        <tr>
          <td>${fmtDateShort(i.injected_at.split('T')[0])}</td>
          <td>${i.medication_name}${i.lot_number ? ` (lot: ${i.lot_number})` : ''}</td>
          <td>${i.response_rating !== null ? `${i.response_rating}/5` : '—'}${i.notes ? ` · ${i.notes}` : ''}</td>
        </tr>`).join('');

  // ── Notes HTML ────────────────────────────────────────────────────────────
  const notesHTML = notesWithContent.length === 0
    ? `<p style="color:#78716C;font-style:italic;">No free-text notes recorded.</p>`
    : notesWithContent.map(l => `
        <div class="note-entry">
          <span class="note-date">${fmtDateShort(l.date)}</span>
          <span class="note-text">${l.notes}</span>
        </div>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Spondy Health Summary</title>
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
      <h1>Spondy Health Summary</h1>
      <p class="subtitle">Ankylosing Spondylitis Tracking Report, for your rheumatologist</p>
    </div>
    <div class="header-right">
      <div>Generated: ${generatedAt}</div>
      <div>Period: ${reportFromDate} – ${reportToDate}</div>
      <div style="margin-top:4px;">${logs.length} days tracked</div>
    </div>
  </div>

  <!-- Patient info -->
  <h2>Patient Profile</h2>
  <div class="profile-grid">
    <div class="profile-row">
      <span class="profile-label">Age range</span>
      <span class="profile-value">${labelAgeRange(profile.age_range)}</span>
    </div>
    <div class="profile-row">
      <span class="profile-label">Years since diagnosis</span>
      <span class="profile-value">${labelDiagnosisYears(profile.diagnosis_years)}</span>
    </div>
    <div class="profile-row">
      <span class="profile-label">Self-reported activity</span>
      <span class="profile-value">${profile.severity ? capitalize(profile.severity) : '—'}</span>
    </div>
    <div class="profile-row">
      <span class="profile-label">Active medications</span>
      <span class="profile-value">${medList || '—'}</span>
    </div>
    <div class="profile-row">
      <span class="profile-label">Primary pain locations</span>
      <span class="profile-value">${profile.pain_locations.map(p => p.replace(/_/g, ' ')).join(', ') || '—'}</span>
    </div>
    <div class="profile-row">
      <span class="profile-label">Associated conditions</span>
      <span class="profile-value">${profile.conditions.map(c => c.replace(/_/g, ' ')).join(', ') || '—'}</span>
    </div>
  </div>

  <!-- Pain & Fatigue -->
  <h2>Pain &amp; Fatigue</h2>
  <div class="stat-grid">
    <div class="stat-box">
      <div class="stat-value">${avgPain}</div>
      <div class="stat-label">Avg Pain (0–10)</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${avgFatigue}</div>
      <div class="stat-label">Avg Fatigue (0–10)</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${highPainDays}</div>
      <div class="stat-label">High Pain Days (≥7)</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${highFatigueDays}</div>
      <div class="stat-label">High Fatigue Days (≥7)</div>
    </div>
  </div>

  <!-- Morning Stiffness -->
  <h2>Morning Stiffness</h2>
  <div class="stiff-grid">
    <div class="stiff-box">
      <div class="stiff-count">${stiffnessCounts.none ?? 0}</div>
      <div class="stiff-label">None</div>
    </div>
    <div class="stiff-box">
      <div class="stiff-count">${stiffnessCounts.under_30 ?? 0}</div>
      <div class="stiff-label">&lt;30 min</div>
    </div>
    <div class="stiff-box">
      <div class="stiff-count">${stiffnessCounts['30_60'] ?? 0}</div>
      <div class="stiff-label">30–60 min</div>
    </div>
    <div class="stiff-box">
      <div class="stiff-count">${stiffnessCounts['1_2_hours'] ?? 0}</div>
      <div class="stiff-label">1–2 hours</div>
    </div>
    <div class="stiff-box">
      <div class="stiff-count" style="color:${prolongedStiffnessDays > 0 ? '#EF4444' : '#1C1917'}">${stiffnessCounts.over_2_hours ?? 0}</div>
      <div class="stiff-label">&gt;2 hours</div>
    </div>
  </div>
  ${prolongedStiffnessDays > 0 ? `<p class="callout">⚠ ${prolongedStiffnessDays} day${prolongedStiffnessDays > 1 ? 's' : ''} with stiffness lasting over 1 hour. A key indicator of active disease (BASDAI Q5/Q6).</p>` : ''}

  <!-- Mood -->
  <h2>Mood Distribution</h2>
  <div class="mood-grid">
    <div class="mood-box"><div class="mood-count">${moodCounts.great}</div><div class="mood-name">Great</div></div>
    <div class="mood-box"><div class="mood-count">${moodCounts.good}</div><div class="mood-name">Good</div></div>
    <div class="mood-box"><div class="mood-count">${moodCounts.okay}</div><div class="mood-name">Okay</div></div>
    <div class="mood-box"><div class="mood-count">${moodCounts.low}</div><div class="mood-name">Low</div></div>
    <div class="mood-box"><div class="mood-count">${moodCounts.very_low}</div><div class="mood-name">Very Low</div></div>
  </div>

  <!-- Exercise -->
  <h2>Exercise &amp; Activity</h2>
  <p style="font-size:13px;">Exercise logged on <strong>${exerciseDays} of ${logs.length} days</strong> (${exercisePct}%).
    ${exercisePct >= 50 ? 'Good consistency. Regular movement is one of the best AS management tools.' : exercisePct === 0 ? 'No exercise logged in this period.' : 'Consider increasing frequency. Even short walks count.'}</p>

  ${topTriggers.length > 0 ? `
  <!-- Diet -->
  <h2>Diet &amp; Potential Triggers</h2>
  <table>
    <thead><tr><th>Trigger food / drink</th><th>Days logged</th></tr></thead>
    <tbody>
      ${topTriggers.map(([t, n]) => `<tr><td>${TRIGGER_LABELS[t] ?? t}</td><td>${n}</td></tr>`).join('')}
    </tbody>
  </table>
  <p class="callout">For AS, high starch/wheat, alcohol, processed food, and sugar are common inflammation drivers. Share any diet-pain patterns with your rheumatologist.</p>
  ` : ''}

  <!-- BASDAI -->
  ${basdaiScores && basdaiScores.length > 0 ? `
  <h2>BASDAI Scores</h2>
  <table>
    <thead><tr><th>Date</th><th>BASDAI Score</th><th>Interpretation</th><th>Q1 Fatigue</th><th>Q2 Spinal pain</th><th>Q5–6 Stiffness</th></tr></thead>
    <tbody>
      ${basdaiScores.map(s => {
        const interp = s.score < 2 ? 'Low activity' : s.score < 4 ? 'Moderate' : s.score < 6 ? 'High' : 'Very high';
        const color = s.score < 2 ? '#22C55E' : s.score < 4 ? '#EAB308' : '#EF4444';
        const stiffAvg = ((s.q5 + s.q6) / 2).toFixed(1);
        return `<tr>
          <td>${fmtDateShort(s.date)}</td>
          <td style="font-weight:700;color:${color};">${s.score.toFixed(1)}/10</td>
          <td>${interp}</td>
          <td>${s.q1}/10</td>
          <td>${s.q2}/10</td>
          <td>${stiffAvg}/10</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
  <p class="callout">BASDAI ≥4 indicates high disease activity. This is the threshold at which biologic therapy is typically considered. Scores trend from oldest to newest.</p>
  ` : ''}

  <!-- AS Flares -->
  <h2>AS Flare History</h2>
  <table>
    <thead>
      <tr><th>Start</th><th>End</th><th>Duration</th><th>Severity</th><th>Areas affected</th></tr>
    </thead>
    <tbody>${flareRowsHTML}</tbody>
  </table>

  <!-- Uveitis -->
  <h2>Uveitis Episodes</h2>
  <table>
    <thead>
      <tr><th>Start</th><th>End</th><th>Duration</th><th>Severity</th><th>Eye / Treatment</th></tr>
    </thead>
    <tbody>${uveitisRowsHTML}</tbody>
  </table>

  <!-- Biologic injections -->
  ${biologicInjections.length > 0 ? `
  <h2>Biologic Injections</h2>
  <table>
    <thead><tr><th>Date</th><th>Medication</th><th>Response / Notes</th></tr></thead>
    <tbody>${injectionRowsHTML}</tbody>
  </table>
  ` : ''}

  <!-- Medication adherence -->
  <h2>Medication Adherence</h2>
  <div class="adherence-row">
    <div class="adh-box">
      <div class="adh-count" style="color:#22C55E;">${medYes}</div>
      <div class="adh-label">Fully taken</div>
    </div>
    <div class="adh-box">
      <div class="adh-count" style="color:#EAB308;">${medPartial}</div>
      <div class="adh-label">Partial</div>
    </div>
    <div class="adh-box">
      <div class="adh-count" style="color:#EF4444;">${medNo}</div>
      <div class="adh-label">Missed</div>
    </div>
    <div class="adh-box">
      <div class="adh-count" style="color:#78716C;">${totalCheckins}</div>
      <div class="adh-label">Total check-ins</div>
    </div>
    ${adherencePct !== null ? `
    <div class="adh-box">
      <div class="adh-count" style="color:${adherencePct >= 80 ? '#22C55E' : adherencePct >= 50 ? '#EAB308' : '#EF4444'};">${adherencePct}%</div>
      <div class="adh-label">Adherence rate</div>
    </div>` : ''}
  </div>

  <!-- Patient notes -->
  <h2>Patient Notes (all entries)</h2>
  ${notesHTML}

  <div class="footer">
    Generated by Spondy &bull; ${generatedAt} &bull; This report is intended as a supplement to, not a replacement for, clinical assessment.
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
