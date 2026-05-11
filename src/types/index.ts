export type AgeRange = 'under_25' | '25_35' | '35_45' | '45_55' | '55_plus';
export type BiologicalSex = 'male' | 'female' | 'prefer_not_to_say';
export type DiagnosisYears = 'under_1' | '1_3' | '3_5' | '5_10' | '10_plus';
export type Severity = 'mild' | 'moderate' | 'severe';
export type Medication =
  | 'adalimumab'
  | 'secukinumab'
  | 'ixekizumab'
  | 'ustekinumab'
  | 'nsaids_only'
  | 'no_medication'
  | 'other';
export type PainLocation =
  | 'lower_back'
  | 'upper_back'
  | 'hips'
  | 'knees'
  | 'shoulders'
  | 'neck'
  | 'chest'
  | 'jaw'
  | 'heels'
  | 'other';
export type PainType = 'stiffness' | 'sharp_pain' | 'burning' | 'aching' | 'fatigue';
export type AssociatedCondition =
  | 'uveitis'
  | 'psoriasis'
  | 'ibd'
  | 'fatigue'
  | 'brain_fog'
  | 'anxiety_depression'
  | 'enthesitis'
  | 'peripheral_joint';

export type FlareType = 'as' | 'enthesitis' | 'peripheral';
export type MorningStiffness = 'under_30' | '30_60' | '1_2_hours' | 'over_2_hours';
export type LifestyleChallenge =
  | 'sleep'
  | 'exercise'
  | 'work'
  | 'social_life'
  | 'mental_health';
export type Mood = 'great' | 'good' | 'okay' | 'low' | 'very_low';
export type FlareSeverity = 'mild' | 'moderate' | 'severe';
export type DietQuality = 'clean' | 'mostly_clean' | 'mixed' | 'poor';
export type DietTrigger =
  | 'alcohol'
  | 'processed'
  | 'high_sugar'
  | 'high_starch'
  | 'dairy'
  | 'red_meat'
  | 'nightshades';

export interface UserProfile {
  id?: string;
  user_id: string;
  biological_sex?: BiologicalSex | null;
  age_range: AgeRange | null;
  diagnosis_years: DiagnosisYears | null;
  severity: Severity | null;
  medications: Medication[];
  pain_locations: PainLocation[];
  pain_types: PainType[];
  conditions: AssociatedCondition[];
  morning_stiffness: MorningStiffness | null;
  challenges: LifestyleChallenge[];
  notification_time: string;
  ai_context: string;
  onboarding_complete: boolean;
  welcome_message?: string;
  preferred_name?: string | null;
}

export interface DailyLog {
  id?: string;
  user_id: string;
  date: string;
  pain_score: number;
  fatigue_score: number;
  stiffness_duration: MorningStiffness | null;
  mood: Mood | null;
  notes: string;
  medications_taken: 'yes' | 'no' | 'partial';
  diet_quality: DietQuality | null;
  diet_triggers: DietTrigger[] | null;
  exercise_done: boolean;
  exercise_minutes: number | null;
  exercise_type: string | null;
  period_active?: boolean | null;
}

export interface HealthData {
  id?: string;
  user_id: string;
  date: string;
  steps: number | null;
  sleep_duration: number | null;
  sleep_quality: number | null;
  hrv: number | null;
  resting_heart_rate: number | null;
  active_calories: number | null;
  workouts: number | null;
}

export interface Flare {
  id?: string;
  user_id: string;
  start_date: string;
  end_date: string | null;
  severity: FlareSeverity;
  areas_affected: string[];
  notes: string;
  flare_type?: FlareType;
}

export interface Nudge {
  id?: string;
  user_id: string;
  sent_at: string;
  trigger_type: string;
  message: string;
}

export interface MedicationReminder {
  id?: string;
  user_id: string;
  name: string;
  dose: string;
  frequency: 'daily' | 'weekly' | 'fortnightly' | 'monthly';
  reminder_time: string;
  active: boolean;
}

export interface OnboardingData {
  biological_sex: BiologicalSex | null;
  age_range: AgeRange | null;
  diagnosis_years: DiagnosisYears | null;
  severity: Severity | null;
  medications: Medication[];
  pain_locations: PainLocation[];
  pain_types: PainType[];
  conditions: AssociatedCondition[];
  morning_stiffness: MorningStiffness | null;
  challenges: LifestyleChallenge[];
  notification_time: string;
}

export interface WelcomeContent {
  welcome_message: string;
  insights: string[];
  watch_summary: string;
}

export interface BasdaiScore {
  id?: string;
  user_id: string;
  date: string;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  q5: number;
  q6: number;
  score: number;
}

export interface BiologicInjection {
  id?: string;
  user_id: string;
  medication_name: string;
  injected_at: string;
  interval_days: number;
  lot_number: string;
  notes: string;
  response_rating: number | null;
}

export type UveitisEye = 'left' | 'right' | 'both';
export type UveitisSymptom = 'red_eye' | 'photophobia' | 'blurred_vision' | 'eye_pain' | 'floaters';

export interface UveitisEpisode {
  id?: string;
  user_id: string;
  start_date: string;
  end_date: string | null;
  affected_eye: UveitisEye;
  severity: FlareSeverity;
  symptoms: UveitisSymptom[];
  treatment_received: boolean;
  notes: string;
}
