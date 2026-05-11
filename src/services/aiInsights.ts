import { supabase } from '@/services/supabase';
import { BasdaiScore, DailyLog, Flare, HealthData, UserProfile } from '@/types';

export interface WeeklyInsight {
  summary: string;
  points: Array<{ title: string; detail: string }>;
}

async function callClaude(body: object): Promise<string> {
  const { data, error } = await supabase.functions.invoke('claude-proxy', { body });
  if (error) throw new Error(`Claude proxy error: ${error.message}`);
  if (!data?.text) throw new Error('No text in Claude proxy response');
  return data.text;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function buildHealthSummary(healthHistory: HealthData[]): string {
  const withHRV = healthHistory.filter((d) => d.hrv !== null);
  const withSleep = healthHistory.filter((d) => d.sleep_duration !== null);
  const withHR = healthHistory.filter((d) => d.resting_heart_rate !== null);
  const withSteps = healthHistory.filter((d) => d.steps !== null);

  if (withHRV.length === 0 && withSleep.length === 0 && withHR.length === 0) {
    return 'No Apple Health data available.';
  }

  const lines: string[] = [`APPLE HEALTH DATA (last ${healthHistory.length} days with data):`];

  if (withHRV.length > 0) {
    const avgHRV = (withHRV.reduce((s, d) => s + d.hrv!, 0) / withHRV.length).toFixed(1);
    const recent = withHRV.slice(-3);
    const earlier = withHRV.slice(0, -3);
    let trend = '';
    if (recent.length >= 2 && earlier.length >= 2) {
      const rHRV = recent.reduce((s, d) => s + d.hrv!, 0) / recent.length;
      const eHRV = earlier.reduce((s, d) => s + d.hrv!, 0) / earlier.length;
      const pct = ((eHRV - rHRV) / eHRV) * 100;
      if (pct >= 10) trend = ` (↓ ${pct.toFixed(0)}% vs earlier — possible inflammation signal)`;
      else if (pct <= -10) trend = ` (↑ recovering)`;
    }
    lines.push(`- Average HRV: ${avgHRV}ms${trend}`);
  }

  if (withSleep.length > 0) {
    const avgSleep = (withSleep.reduce((s, d) => s + d.sleep_duration!, 0) / withSleep.length).toFixed(1);
    const poorNights = withSleep.filter((d) => d.sleep_duration! < 5.5).length;
    lines.push(`- Average sleep: ${avgSleep}h${poorNights > 0 ? ` (${poorNights} night${poorNights > 1 ? 's' : ''} under 5.5h)` : ''}`);
  }

  const withSQ = healthHistory.filter((d) => d.sleep_quality !== null);
  if (withSQ.length > 0) {
    const avgSQ = Math.round(withSQ.reduce((s, d) => s + d.sleep_quality!, 0) / withSQ.length);
    lines.push(`- Average sleep quality (deep+REM): ${avgSQ}%`);
  }

  if (withHR.length > 0) {
    const avgHR = Math.round(withHR.reduce((s, d) => s + d.resting_heart_rate!, 0) / withHR.length);
    const recent = withHR.slice(-3);
    const earlier = withHR.slice(0, -3);
    let trend = '';
    if (recent.length >= 2 && earlier.length >= 2) {
      const rHR = recent.reduce((s, d) => s + d.resting_heart_rate!, 0) / recent.length;
      const eHR = earlier.reduce((s, d) => s + d.resting_heart_rate!, 0) / earlier.length;
      if (rHR - eHR >= 5) trend = ` (↑ elevated vs earlier)`;
    }
    lines.push(`- Average resting heart rate: ${avgHR}bpm${trend}`);
  }

  if (withSteps.length > 0) {
    const avgSteps = Math.round(withSteps.reduce((s, d) => s + d.steps!, 0) / withSteps.length);
    lines.push(`- Average daily steps: ${avgSteps.toLocaleString()}`);
  }

  return lines.join('\n');
}

function buildDataSummary(logs: DailyLog[], flares: Flare[], healthHistory?: HealthData[], basdaiScores?: BasdaiScore[]): string {
  if (logs.length === 0) {
    return 'No tracking data available for this period.';
  }

  const avgPain = (logs.reduce((s, l) => s + l.pain_score, 0) / logs.length).toFixed(1);
  const avgFatigue = (logs.reduce((s, l) => s + l.fatigue_score, 0) / logs.length).toFixed(1);

  const moodCounts: Record<string, number> = {};
  for (const log of logs) {
    if (log.mood) {
      moodCounts[log.mood] = (moodCounts[log.mood] ?? 0) + 1;
    }
  }
  const moodSummary = Object.entries(moodCounts)
    .map(([mood, count]) => `${mood}: ${count} days`)
    .join(', ');

  const medicationAdherence = logs.filter((l) => l.medications_taken === 'yes').length;
  const medicationPartial = logs.filter((l) => l.medications_taken === 'partial').length;
  const medicationMissed = logs.filter((l) => l.medications_taken === 'no').length;

  const notes = logs
    .filter((l) => l.notes && l.notes.trim().length > 0)
    .map((l) => `  [${formatDate(l.date)}] ${l.notes.trim()}`)
    .join('\n');

  const flareSummary =
    flares.length === 0
      ? 'No flares logged in this period.'
      : flares
          .map(
            (f) =>
              `  - ${formatDate(f.start_date)} to ${f.end_date ? formatDate(f.end_date) : 'ongoing'} (${f.severity}, areas: ${f.areas_affected.join(', ')})`
          )
          .join('\n');

  // Simple sleep/pain correlation detection
  let correlationNote = '';
  if (logs.length >= 5) {
    const poorSleepDays = logs.filter(
      (l) => l.stiffness_duration === 'over_2_hours' || l.stiffness_duration === '1_2_hours'
    );
    if (poorSleepDays.length > 0) {
      const avgPainOnPoorSleepDays = (
        poorSleepDays.reduce((s, l) => s + l.pain_score, 0) / poorSleepDays.length
      ).toFixed(1);
      correlationNote = `\nOn days with long morning stiffness (${poorSleepDays.length} days), average pain was ${avgPainOnPoorSleepDays}/10 vs overall average of ${avgPain}/10.`;
    }
  }

  const healthSection = healthHistory && healthHistory.length > 0
    ? `\n\n${buildHealthSummary(healthHistory)}`
    : '';

  // Diet summary
  const TRIGGER_LABELS: Record<string, string> = {
    alcohol: 'Alcohol', processed: 'Processed food', high_sugar: 'High sugar',
    high_starch: 'High starch/wheat', dairy: 'Dairy', red_meat: 'Red meat', nightshades: 'Nightshades',
  };
  let dietSection = '';
  const dietLogs = logs.filter((l) => l.diet_quality !== null);
  if (dietLogs.length > 0) {
    const qCounts: Record<string, number> = { clean: 0, mostly_clean: 0, mixed: 0, poor: 0 };
    dietLogs.forEach((l) => { if (l.diet_quality) qCounts[l.diet_quality]++; });

    const triggerCounts: Record<string, number> = {};
    dietLogs.forEach((l) => {
      (l.diet_triggers ?? []).forEach((t) => { triggerCounts[t] = (triggerCounts[t] ?? 0) + 1; });
    });
    const topTriggers = Object.entries(triggerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([t, n]) => `${TRIGGER_LABELS[t] ?? t} (${n}d)`)
      .join(', ');

    // Pain on poor/mixed vs clean days
    const inflammatoryDays = dietLogs.filter((l) => l.diet_quality === 'poor' || l.diet_quality === 'mixed');
    const cleanDays = dietLogs.filter((l) => l.diet_quality === 'clean' || l.diet_quality === 'mostly_clean');
    let dietCorrelation = '';
    if (inflammatoryDays.length >= 2 && cleanDays.length >= 2) {
      const avgPainInflam = (inflammatoryDays.reduce((s, l) => s + l.pain_score, 0) / inflammatoryDays.length).toFixed(1);
      const avgPainClean = (cleanDays.reduce((s, l) => s + l.pain_score, 0) / cleanDays.length).toFixed(1);
      dietCorrelation = `\n- Avg pain on inflammatory diet days: ${avgPainInflam}/10 vs clean days: ${avgPainClean}/10`;
    }

    dietSection = `\n\nDIET (${dietLogs.length} days logged):
- Quality: clean ${qCounts.clean}d, mostly clean ${qCounts.mostly_clean}d, mixed ${qCounts.mixed}d, poor ${qCounts.poor}d
${topTriggers ? `- Most frequent triggers: ${topTriggers}` : '- No specific triggers logged'}${dietCorrelation}
- Note: For AS, high starch/wheat, alcohol, processed food and sugar are known inflammation drivers.`;
  }

  // Exercise section
  let exerciseSection = '';
  const exerciseDays = logs.filter(l => (l as any).exercise_done);
  if (exerciseDays.length > 0) {
    const pct = Math.round((exerciseDays.length / logs.length) * 100);
    exerciseSection = `\n\nEXERCISE: Logged exercise on ${exerciseDays.length} of ${logs.length} days (${pct}%).`;
  }

  // Period section (only present when user tracks period data)
  let periodSection = '';
  const periodLogs = logs.filter(l => l.period_active === true);
  if (periodLogs.length > 0) {
    const nonPeriodLogs = logs.filter(l => l.period_active === false || l.period_active === null);
    let correlationLine = '';
    if (periodLogs.length >= 2 && nonPeriodLogs.length >= 2) {
      const avgPainPeriod = (periodLogs.reduce((s, l) => s + l.pain_score, 0) / periodLogs.length).toFixed(1);
      const avgPainNonPeriod = (nonPeriodLogs.reduce((s, l) => s + l.pain_score, 0) / nonPeriodLogs.length).toFixed(1);
      const avgFatiguePeriod = (periodLogs.reduce((s, l) => s + l.fatigue_score, 0) / periodLogs.length).toFixed(1);
      correlationLine = `\n- Avg pain on period days: ${avgPainPeriod}/10 vs non-period days: ${avgPainNonPeriod}/10; avg fatigue on period days: ${avgFatiguePeriod}/10`;
    }
    periodSection = `\n\nMENSTRUAL CYCLE DATA: Period active on ${periodLogs.length} logged days.${correlationLine}`;
  }

  // BASDAI section
  let basdaiSection = '';
  if (basdaiScores && basdaiScores.length > 0) {
    const latest = basdaiScores[0];
    const interp = latest.score < 2 ? 'low activity' : latest.score < 4 ? 'moderate' : latest.score < 6 ? 'high (at biologic threshold)' : 'very high';
    basdaiSection = `\n\nBASDI SCORE (most recent, ${latest.date}): ${latest.score}/10 — ${interp}`;
    if (basdaiScores.length >= 2) {
      const prev = basdaiScores[1];
      const diff = latest.score - prev.score;
      basdaiSection += `. Previous score was ${prev.score} (${diff > 0 ? `↑ +${diff.toFixed(1)}` : diff < 0 ? `↓ ${diff.toFixed(1)}` : 'unchanged'}).`;
    }
  }

  return `
TRACKING DATA SUMMARY (last 28 days, ${logs.length} days logged):
- Average pain score: ${avgPain}/10
- Average fatigue score: ${avgFatigue}/10
- Mood breakdown: ${moodSummary || 'not recorded'}
- Medication adherence: ${medicationAdherence} days fully taken, ${medicationPartial} partial, ${medicationMissed} missed${correlationNote}

FLARES:
${flareSummary}

USER NOTES (free text from check-ins):
${notes || '  None'}${dietSection}${healthSection}${exerciseSection}${periodSection}${basdaiSection}
`.trim();
}

function buildProfileSummary(profile: UserProfile): string {
  const sexLine = profile.biological_sex && profile.biological_sex !== 'prefer_not_to_say'
    ? `- Biological sex: ${profile.biological_sex}${profile.biological_sex === 'female' ? ' (period tracking enabled — menstrual cycle data may be present in logs)' : ''}\n`
    : '';
  return `
USER PROFILE:
${sexLine}- Age range: ${profile.age_range ?? 'not specified'}
- Years diagnosed: ${profile.diagnosis_years ?? 'not specified'}
- Disease activity: ${profile.severity ?? 'not specified'}
- Medications: ${profile.medications.join(', ') || 'none'}
- Pain locations: ${profile.pain_locations.join(', ') || 'none specified'}
- Pain types: ${profile.pain_types.join(', ') || 'none specified'}
- Associated conditions: ${profile.conditions.join(', ') || 'none'}
- Morning stiffness: ${profile.morning_stiffness ?? 'not specified'}
- Main challenges: ${profile.challenges.join(', ') || 'none specified'}
${profile.ai_context ? `- Additional context from user: ${profile.ai_context}` : ''}
`.trim();
}

// ─── generateWeeklyInsight ────────────────────────────────────────────────────

export async function generateWeeklyInsight(params: {
  logs: DailyLog[];
  flares: Flare[];
  profile: UserProfile;
  healthHistory?: HealthData[];
  basdaiScores?: BasdaiScore[];
  aiContext?: string;
}): Promise<WeeklyInsight> {
  const { logs, flares, profile, healthHistory, basdaiScores, aiContext } = params;

  const systemPrompt = `You are Spondy, a warm and knowledgeable health companion for someone living with Ankylosing Spondylitis.
Analyse the user's data and respond with a JSON object in exactly this structure:
{
  "summary": "2-3 warm sentences giving an overall picture of the week — the main theme or standout pattern.",
  "points": [
    { "title": "3-5 word title", "detail": "2-3 sentences of specific insight for this point." },
    { "title": "3-5 word title", "detail": "2-3 sentences of specific insight for this point." },
    { "title": "3-5 word title", "detail": "2-3 sentences of specific insight for this point." }
  ]
}

Rules:
- 3 points always (no more, no less)
- Never say "you are at risk" or anything diagnostic
- Use language like "your data suggests", "it might be worth", "consider"
- Be specific to their actual data — mention real numbers or patterns you see
- Be warm and encouraging, like a knowledgeable friend
- The JSON must be valid and parseable — no markdown, no text outside the JSON`;

  const userMessage = `Here is my health data:

${buildProfileSummary(profile)}

${buildDataSummary(logs, flares, healthHistory, basdaiScores)}
${aiContext ? `\nAdditional context: ${aiContext}` : ''}`;

  try {
    const text = await callClaude({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }],
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');

    return JSON.parse(jsonMatch[0]) as WeeklyInsight;
  } catch (err) {
    console.error('generateWeeklyInsight error:', err);
    throw new Error('AI insights are temporarily unavailable. The rest of the app is working normally.');
  }
}

// ─── sendChatMessage ──────────────────────────────────────────────────────────

export async function sendChatMessage(params: {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  logs: DailyLog[];
  flares: Flare[];
  profile: UserProfile;
  healthHistory?: HealthData[];
  basdaiScores?: BasdaiScore[];
  aiContext?: string;
}): Promise<string> {
  const { messages, logs, flares, profile, healthHistory, basdaiScores, aiContext } = params;

  const systemPrompt = `You are Spondy AI, a warm and knowledgeable health companion for someone living with Ankylosing Spondylitis (AS).
You have access to the user's tracking data and can help them understand their patterns, potential triggers, and AS management.

Here is the user's profile and recent data:

${buildProfileSummary(profile)}

${buildDataSummary(logs, flares, healthHistory, basdaiScores)}
${aiContext ? `\nAdditional context from user: ${aiContext}` : ''}

Guidelines for your responses:
- Be conversational, warm, and encouraging — like a knowledgeable friend who also has AS
- Never say "you are at risk", make diagnoses, or give medical advice
- Use language like "your data suggests", "it might be worth exploring", "consider"
- Be specific to their actual data when relevant
- Keep responses concise (2-4 sentences usually) unless they ask for detail
- If asked about something outside your knowledge, say so honestly`;

  try {
    return await callClaude({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
  } catch (err) {
    console.error('sendChatMessage error:', err);
    throw new Error(
      'AI chat is temporarily unavailable. Please try again in a moment.'
    );
  }
}
