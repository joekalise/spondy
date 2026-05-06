export type AgeRange = 'under_25' | '25_35' | '35_45' | '45_55' | '55_plus';
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
  | 'jaw';
export type PainType = 'stiffness' | 'sharp_pain' | 'burning' | 'aching' | 'fatigue';
export type AssociatedCondition =
  | 'uveitis'
  | 'psoriasis'
  | 'ibd'
  | 'fatigue'
  | 'brain_fog'
  | 'anxiety_depression';
export type MorningStiffness = 'under_30' | '30_60' | '1_2_hours' | 'over_2_hours';
export type LifestyleChallenge =
  | 'sleep'
  | 'exercise'
  | 'work'
  | 'social_life'
  | 'mental_health';
export type Mood = 'great' | 'good' | 'okay' | 'low' | 'very_low';
export type FlareSeverity = 'mild' | 'moderate' | 'severe';

export interface UserProfile {
  id?: string;
  user_id: string;
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
  areas_affected: PainLocation[];
  notes: string;
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
