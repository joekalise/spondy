import { supabase } from '@/services/supabase';
import { BasdaiScore, DailyLog, Flare, HealthData, UserProfile } from '@/types';

export interface WeeklyInsight {
  summary: string;
  points: Array<{ title: string; detail: string }>;
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

async function callClaude(body: object): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/claude-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token ?? SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Claude proxy error: ${response.status}`);
  const data = await response.json();
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
    return 'No health data available.';
  }

  const lines: string[] = [`HEALTH DATA (last ${healthHistory.length} days with data):`];

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

function buildDataSummary(
  logs: DailyLog[],
  flares: Flare[],
  healthHistory?: HealthData[],
  basdaiScores?: BasdaiScore[],
  humidityData?: { humidity: number; trend: string } | null
): string {
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

  // Humidity context
  let humiditySection = '';
  if (humidityData) {
    const level = humidityData.humidity > 70 ? 'high (linked to worse AS symptoms in research)' : humidityData.humidity >= 40 ? 'moderate' : 'low';
    humiditySection = `\n\nHUMIDITY: ${humidityData.humidity}% — ${level}, trend: ${humidityData.trend}. Note: both a dedicated ankylosing spondylitis study and a large general chronic-pain study found humid days linked to more reported pain, with barometric pressure alone not holding up once temperature was accounted for.`;
  }

  return `
TRACKING DATA SUMMARY (${logs.length} days logged):
- Average pain score: ${avgPain}/10
- Average fatigue score: ${avgFatigue}/10
- Mood breakdown: ${moodSummary || 'not recorded'}
- Medication adherence: ${medicationAdherence} days fully taken, ${medicationPartial} partial, ${medicationMissed} missed${correlationNote}

FLARES:
${flareSummary}

USER NOTES (free text from check-ins):
${notes || '  None'}${dietSection}${healthSection}${exerciseSection}${periodSection}${basdaiSection}${humiditySection}
`.trim();
}

function buildProfileSummary(profile: UserProfile): string {
  const sexLine = profile.biological_sex && profile.biological_sex !== 'prefer_not_to_say'
    ? `- Biological sex: ${profile.biological_sex}${profile.biological_sex === 'female' ? ' (period tracking enabled — menstrual cycle data may be present in logs)' : ''}\n`
    : '';
  const smokingLine = profile.smoking_status
    ? `- Smoking status: ${profile.smoking_status} (research links current smoking to higher AS disease activity and radiographic progression — mention only if directly relevant to a pattern in the data, never as unsolicited advice to quit)\n`
    : '';
  return `
USER PROFILE:
${sexLine}${smokingLine}- Age range: ${profile.age_range ?? 'not specified'}
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
  humidityData?: { humidity: number; trend: string } | null;
  aiContext?: string;
  language?: string;
}): Promise<WeeklyInsight> {
  const { logs, flares, profile, healthHistory, basdaiScores, humidityData, aiContext, language } = params;

  const isEarlyData = logs.length < 7;

  const systemPrompt = `${language && language !== 'en-GB' ? `Respond in ${language}.\n\n` : ''}You are Spondy, a knowledgeable health companion for someone living with Ankylosing Spondylitis.

Your job is to find genuine, specific correlations and patterns in the user's data — not generic advice.

Analyse the data and respond with a JSON object in exactly this structure:
{
  "summary": "2-3 sentences identifying the single most important pattern or trend this period. Be specific — mention actual numbers.",
  "points": [
    { "title": "3-5 word title", "detail": "2-3 sentences of specific insight for this point." },
    { "title": "3-5 word title", "detail": "2-3 sentences of specific insight for this point." },
    { "title": "3-5 word title", "detail": "2-3 sentences of specific insight for this point." }
  ]
}

Rules:
- 3 points always (no more, no less)
- Every point must reference actual numbers from the data — average scores, specific dates, counts, percentages. Never say "your pain has been high" when you can say "your pain averaged 6.4 this week vs 4.1 the week before"
- Prioritise correlations over observations: look for relationships between sleep and pain, diet and fatigue, HRV and flare days, steps and mood, medication adherence and scores. If the data shows a correlation, lead with it and give the actual numbers
- If there are not enough data points for a correlation, report the most notable individual pattern with real numbers${isEarlyData ? '\n- This is an early insight with fewer than 7 days of data. Be honest about that — say "in your first X days" rather than implying a full week of data. Focus on what IS visible and frame it as a baseline to build on.' : ''}
- Never give generic AS advice that isn't grounded in their specific data
- Never say "you are at risk" or anything diagnostic
- Use language like "your data suggests", "it looks like", "on days when"
- Be direct and specific — this person wants to understand their own body, not be reassured
- The JSON must be valid and parseable — no markdown, no text outside the JSON`;

  const userMessage = `Here is my health data:

${buildProfileSummary(profile)}

${buildDataSummary(logs, flares, healthHistory, basdaiScores, humidityData)}
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
  humidityData?: { humidity: number; trend: string } | null;
  aiContext?: string;
  language?: string;
}): Promise<string> {
  const { messages, logs, flares, profile, healthHistory, basdaiScores, humidityData, aiContext, language } = params;

  const systemPrompt = `${language && language !== 'en-GB' ? `Respond in ${language}.\n\n` : ''}You are Spondy, an AI built specifically for people with Ankylosing Spondylitis. You have full access to this user's tracking data — their symptoms, flares, health metrics, medications, and patterns over time.

Here is the user's profile and recent data:

${buildProfileSummary(profile)}

${buildDataSummary(logs, flares, healthHistory, basdaiScores, humidityData)}
${aiContext ? `\nAdditional context from user: ${aiContext}` : ''}

How to respond:
- You know this person's data. Use it. When they ask a question, connect it to what you can actually see — their scores, their patterns, their flares. Don't give generic AS advice when you have their specific numbers.
- If their question relates to something in the data, lead with what the data shows. Use real numbers: averages, trends, specific dates, comparisons.
- Be direct and honest. If the data shows something concerning, say so clearly without being alarmist. If things look good, say that too.
- Match the length of your response to the question. A simple question gets a short answer. A complex question about patterns or triggers deserves a thorough one.
- Talk like a knowledgeable friend who also has AS — not a medical professional covering themselves legally, and not a wellness app being relentlessly positive.
- Never diagnose, never say "you are at risk", never recommend specific medications or doses.
- If they ask about something genuinely outside your knowledge or their data, say so and suggest they ask their rheumatologist.
- Don't start responses with "I" or with filler phrases like "Great question!" or "Of course!".`;

  try {
    return await callClaude({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
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
