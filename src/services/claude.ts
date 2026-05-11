import { supabase } from '@/services/supabase';
import { OnboardingData, WelcomeContent } from '@/types';

async function callClaude(body: object): Promise<string> {
  const { data, error } = await supabase.functions.invoke('claude-proxy', { body });
  if (error) throw new Error(`Claude proxy error: ${error.message}`);
  if (!data?.text) throw new Error('No text in Claude proxy response');
  return data.text;
}

function buildOnboardingPrompt(data: OnboardingData): string {
  const medicationLabels: Record<string, string> = {
    adalimumab: 'Adalimumab (Humira)',
    secukinumab: 'Secukinumab (Cosentyx)',
    ixekizumab: 'Ixekizumab (Taltz)',
    ustekinumab: 'Ustekinumab (Stelara)',
    nsaids_only: 'NSAIDs only',
    no_medication: 'no medication',
    other: 'other treatment',
  };

  const locationLabels: Record<string, string> = {
    lower_back: 'lower back/sacroiliac',
    upper_back: 'upper back',
    hips: 'hips',
    knees: 'knees',
    shoulders: 'shoulders',
    neck: 'neck/cervical spine',
    chest: 'chest/ribs',
    jaw: 'jaw (TMJ)',
  };

  const conditionLabels: Record<string, string> = {
    uveitis: 'uveitis',
    psoriasis: 'psoriasis',
    ibd: 'inflammatory bowel disease',
    fatigue: 'significant fatigue',
    brain_fog: 'brain fog',
    anxiety_depression: 'anxiety/depression',
  };

  const ageLabels: Record<string, string> = {
    under_25: 'under 25',
    '25_35': '25–35',
    '35_45': '35–45',
    '45_55': '45–55',
    '55_plus': '55+',
  };

  const diagnosisLabels: Record<string, string> = {
    under_1: 'less than 1 year',
    '1_3': '1–3 years',
    '3_5': '3–5 years',
    '5_10': '5–10 years',
    '10_plus': 'more than 10 years',
  };

  const stiffnessLabels: Record<string, string> = {
    under_30: 'under 30 minutes',
    '30_60': '30–60 minutes',
    '1_2_hours': '1–2 hours',
    over_2_hours: 'more than 2 hours',
  };

  const sexLine = data.biological_sex && data.biological_sex !== 'prefer_not_to_say'
    ? `- Biological sex: ${data.biological_sex}${data.biological_sex === 'female' ? ' (note: AS often presents with more peripheral joint involvement in women; hormonal fluctuations may affect symptom severity)' : ''}\n`
    : '';

  return `You are a warm, knowledgeable companion for someone living with Ankylosing Spondylitis (AS).

Here is their profile:
${sexLine}- Age range: ${ageLabels[data.age_range ?? ''] ?? 'unknown'}
- Years since AS diagnosis: ${diagnosisLabels[data.diagnosis_years ?? ''] ?? 'unknown'}
- Current disease activity: ${data.severity ?? 'unknown'}
- Current treatment: ${data.medications.map(m => medicationLabels[m] ?? m).join(', ') || 'none specified'}
- Pain locations: ${data.pain_locations.map(l => locationLabels[l] ?? l).join(', ') || 'none specified'}
- Pain types: ${data.pain_types.join(', ') || 'none specified'}
- Associated conditions: ${data.conditions.map(c => conditionLabels[c] ?? c).join(', ') || 'none'}
- Morning stiffness duration: ${stiffnessLabels[data.morning_stiffness ?? ''] ?? 'unknown'}
- Biggest lifestyle challenges: ${data.challenges.join(', ') || 'none specified'}

Please respond with a JSON object with exactly this structure:
{
  "welcome_message": "A warm, personal 2-3 sentence welcome that acknowledges what they're going through specifically. Make them feel understood. Use 'you' and 'your'. Never use clinical language or anything alarming. Tone: like a knowledgeable friend who also has AS.",
  "insights": [
    "First condition-specific insight relevant to their profile — something genuinely useful they might not know. 1-2 sentences.",
    "Second insight — different aspect of their profile. 1-2 sentences.",
    "Third insight — practical, actionable, warm. 1-2 sentences."
  ],
  "watch_summary": "1-2 sentences describing what Spondy will specifically monitor for this person based on their profile. Be specific to their conditions and challenges."
}

Rules:
- Never say "you are at risk", "you will flare", or anything that sounds like a diagnosis
- Always use language like "your data suggests", "might be worth", "consider"
- Be warm, not clinical
- Be specific to their actual profile — don't give generic AS advice
- If they have uveitis, mention it specifically
- The JSON must be valid and parseable`;
}

export async function generateWelcomeContent(
  data: OnboardingData
): Promise<WelcomeContent> {
  const prompt = buildOnboardingPrompt(data);

  const text = await callClaude({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in Claude response');
  }

  return JSON.parse(jsonMatch[0]) as WelcomeContent;
}
