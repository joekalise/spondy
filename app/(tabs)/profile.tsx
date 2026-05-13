import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Modal,
  Alert,
  useColorScheme,
  ActivityIndicator,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';

import { Button } from '@/components/common/Button';
import { InfoButton } from '@/components/common/InfoButton';
import { OptionCard } from '@/components/onboarding/OptionCard';
import { MultiSelectCard } from '@/components/onboarding/MultiSelectCard';
import { supabase } from '@/services/supabase';
import { Colors } from '@/constants/colors';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useMedications } from '@/hooks/useMedications';
import { useSubscription } from '@/hooks/useSubscription';
import { useFlares } from '@/hooks/useFlares';
import { useHealthData } from '@/hooks/useHealthData';
import { useMedicationTracking } from '@/hooks/useMedicationTracking';
import { useBiologicInjections, BIOLOGIC_INTERVALS } from '@/hooks/useBiologicInjections';
import { scheduleDailyCheckIn, cancelNotification } from '@/services/notifications';
import { PremiumModal } from '@/components/common/PremiumModal';
import { logEvent, Events } from '@/services/analytics';
import { generateAndShareReport } from '@/services/pdfExport';
import { getDailyLogs, getUveitisEpisodes, getBasdaiScores, deleteAllUserData } from '@/services/database';
import {
  MedicationReminder,
  BiologicInjection,
  AgeRange,
  BiologicalSex,
  DiagnosisYears,
  Severity,
  Medication,
  PainLocation,
  PainType,
  AssociatedCondition,
  MorningStiffness,
  LifestyleChallenge,
} from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeStringToDate(t: string): Date {
  const [h, m] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(isNaN(h) ? 20 : h, isNaN(m) ? 0 : m, 0, 0);
  return d;
}

function dateToTimeString(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatAgeRange(value: string | null | undefined): string {
  if (!value) return '—';
  return value.replace('_', '–').replace('plus', '+').replace('under', 'Under ');
}

function formatDiagnosisYears(value: string | null | undefined): string {
  if (!value) return '—';
  if (value === 'under_1') return 'Under 1 year';
  if (value === '10_plus') return '10+ years';
  return value.replace('_', '–') + ' years';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const MEDICATION_LABELS: Record<string, string> = {
  adalimumab: 'Adalimumab (Humira)',
  secukinumab: 'Secukinumab (Cosentyx)',
  ixekizumab: 'Ixekizumab (Taltz)',
  ustekinumab: 'Ustekinumab (Stelara)',
  nsaids_only: 'NSAIDs only',
  no_medication: 'No medication',
  other: 'Other treatment',
};

function formatOnboardingMeds(meds: string[]): string {
  const filtered = meds.filter((m) => m !== 'no_medication');
  if (filtered.length === 0) return 'None';
  return filtered.map((m) => MEDICATION_LABELS[m] ?? capitalize(m)).join(', ');
}

const BIOLOGICAL_SEX_LABELS: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  prefer_not_to_say: 'Prefer not to say',
};

const AGE_RANGE_LABELS: Record<string, string> = {
  under_25: 'Under 25',
  '25_35': '25–35',
  '35_45': '35–45',
  '45_55': '45–55',
  '55_plus': '55 and over',
};

const DIAGNOSIS_YEARS_LABELS: Record<string, string> = {
  under_1: 'Less than a year',
  '1_3': '1–3 years',
  '3_5': '3–5 years',
  '5_10': '5–10 years',
  '10_plus': '10+ years',
};

const SEVERITY_LABELS: Record<string, string> = {
  mild: 'Mild',
  moderate: 'Moderate',
  severe: 'Severe',
};

const PAIN_LOCATION_LABELS: Record<string, string> = {
  lower_back: 'Lower back',
  upper_back: 'Upper back',
  hips: 'Hips',
  knees: 'Knees',
  shoulders: 'Shoulders',
  neck: 'Neck',
  chest: 'Chest',
  jaw: 'Jaw',
  heels: 'Heels',
  other: 'Other',
};

const PAIN_TYPE_LABELS: Record<string, string> = {
  stiffness: 'Morning stiffness',
  sharp_pain: 'Sharp pain',
  burning: 'Burning',
  aching: 'Deep aching',
  fatigue: 'AS fatigue',
};

const CONDITION_LABELS: Record<string, string> = {
  uveitis: 'Uveitis',
  psoriasis: 'Psoriasis',
  ibd: 'IBD',
  enthesitis: 'Enthesitis',
  peripheral_joint: 'Peripheral joints',
  fatigue: 'Significant fatigue',
  brain_fog: 'Brain fog',
  anxiety_depression: 'Anxiety / depression',
};

const MORNING_STIFFNESS_LABELS: Record<string, string> = {
  under_30: 'Under 30 min',
  '30_60': '30–60 min',
  '1_2_hours': '1–2 hours',
  over_2_hours: 'Over 2 hours',
};

const CHALLENGE_LABELS: Record<string, string> = {
  sleep: 'Sleep quality',
  exercise: 'Staying active',
  work: 'Work / productivity',
  social_life: 'Social life',
  mental_health: 'Mental health',
};

function formatList(items: string[], labelMap: Record<string, string>): string {
  if (!items || items.length === 0) return '—';
  return items.map((i) => labelMap[i] ?? capitalize(i)).join(', ');
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

function SectionHeader({ label, isDark, firstSection }: { label: string; isDark: boolean; firstSection?: boolean }) {
  return (
    <View style={[styles.sectionHeaderRow, isDark && styles.sectionHeaderRowDark, firstSection && styles.sectionHeaderRowFirst]}>
      <Text style={[styles.sectionHeaderLabel, isDark && { color: Colors.textSecondaryDark }]}>
        {label}
      </Text>
    </View>
  );
}

// ─── ChipGroup ────────────────────────────────────────────────────────────────

function ChipGroup({
  label,
  options,
  labelMap,
  selected,
  onToggle,
  isDark,
}: {
  label: string;
  options: string[];
  labelMap: Record<string, string>;
  selected: string | null | string[];
  onToggle: (val: string) => void;
  isDark: boolean;
}) {
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;
  const inputBg = isDark ? Colors.backgroundDark : Colors.background;
  const cardBorder = isDark ? Colors.borderDark : Colors.border;

  const isSelected = (val: string): boolean => {
    if (Array.isArray(selected)) return selected.includes(val);
    return selected === val;
  };

  return (
    <View style={{ marginBottom: Spacing.md }}>
      <Text style={[styles.fieldLabel, { color: textSecondary }]}>{label}</Text>
      <View style={styles.chipsRow}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt}
            onPress={() => onToggle(opt)}
            activeOpacity={0.8}
            style={[
              styles.chip,
              {
                backgroundColor: isSelected(opt) ? Colors.primary : inputBg,
                borderColor: isSelected(opt) ? Colors.primary : cardBorder,
              },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                { color: isSelected(opt) ? '#FFFFFF' : textSecondary },
              ]}
            >
              {labelMap[opt] ?? opt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ─── ProfileEditModal ─────────────────────────────────────────────────────────

interface ProfileEditModalProps {
  visible: boolean;
  onClose: () => void;
  profile: { biological_sex?: BiologicalSex | null; age_range: AgeRange | null; diagnosis_years: DiagnosisYears | null; severity: Severity | null; medications: Medication[]; pain_locations: PainLocation[]; pain_types: PainType[]; conditions: AssociatedCondition[]; morning_stiffness: MorningStiffness | null; challenges: LifestyleChallenge[] } | null;
  onSave: (updates: {
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
  }) => Promise<void>;
  isDark: boolean;
}

function EditSectionHeader({ label, color }: { label: string; color: string }) {
  return (
    <Text style={{ fontSize: FontSize.md, fontWeight: '700', color, marginTop: Spacing.xl, marginBottom: Spacing.sm }}>
      {label}
    </Text>
  );
}

function ProfileEditModal({ visible, onClose, profile, onSave, isDark }: ProfileEditModalProps) {
  const bg = isDark ? Colors.backgroundDark : Colors.background;
  const cardBorder = isDark ? Colors.borderDark : Colors.border;
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;

  const [biologicalSex, setBiologicalSex] = useState<BiologicalSex | null>(null);
  const [ageRange, setAgeRange] = useState<AgeRange | null>(null);
  const [diagnosisYears, setDiagnosisYears] = useState<DiagnosisYears | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [painLocations, setPainLocations] = useState<PainLocation[]>([]);
  const [painTypes, setPainTypes] = useState<PainType[]>([]);
  const [conditions, setConditions] = useState<AssociatedCondition[]>([]);
  const [morningStiffness, setMorningStiffness] = useState<MorningStiffness | null>(null);
  const [challenges, setChallenges] = useState<LifestyleChallenge[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (profile && visible) {
      setBiologicalSex(profile.biological_sex ?? null);
      setAgeRange(profile.age_range);
      setDiagnosisYears(profile.diagnosis_years);
      setSeverity(profile.severity);
      setMedications(profile.medications ?? []);
      setPainLocations(profile.pain_locations ?? []);
      setPainTypes(profile.pain_types ?? []);
      setConditions(profile.conditions ?? []);
      setMorningStiffness(profile.morning_stiffness);
      setChallenges(profile.challenges ?? []);
    }
  }, [profile, visible]);

  function toggle<T extends string>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await onSave({
        biological_sex: biologicalSex,
        age_range: ageRange,
        diagnosis_years: diagnosisYears,
        severity,
        medications,
        pain_locations: painLocations,
        pain_types: painTypes,
        conditions,
        morning_stiffness: morningStiffness,
        challenges,
      });
      onClose();
    } catch (err) {
      console.error('ProfileEditModal save error:', err);
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  const compactCard = { paddingVertical: 8, marginBottom: 4 } as const;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
        <View style={[styles.editModalHeader, { borderBottomColor: cardBorder }]}>
          <Text style={[styles.editModalTitle, { color: textPrimary }]}>Edit profile</Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.8}>
            <Text style={[styles.editModalClose, { color: textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.editModalContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <EditSectionHeader label="About you" color={textSecondary} />

          <Text style={[styles.editFieldLabel, { color: textSecondary }]}>Biological sex</Text>
          {(['male', 'female', 'prefer_not_to_say'] as BiologicalSex[]).map(v => (
            <OptionCard key={v} style={compactCard} label={BIOLOGICAL_SEX_LABELS[v]} isSelected={biologicalSex === v} onPress={() => setBiologicalSex(v)} />
          ))}

          <Text style={[styles.editFieldLabel, { color: textSecondary }]}>Age range</Text>
          {(['under_25', '25_35', '35_45', '45_55', '55_plus'] as AgeRange[]).map(v => (
            <OptionCard key={v} style={compactCard} label={AGE_RANGE_LABELS[v]} isSelected={ageRange === v} onPress={() => setAgeRange(v)} />
          ))}

          <Text style={[styles.editFieldLabel, { color: textSecondary }]}>Years with AS</Text>
          {(['under_1', '1_3', '3_5', '5_10', '10_plus'] as DiagnosisYears[]).map(v => (
            <OptionCard key={v} style={compactCard} label={DIAGNOSIS_YEARS_LABELS[v]} isSelected={diagnosisYears === v} onPress={() => setDiagnosisYears(v)} />
          ))}

          <Text style={[styles.editFieldLabel, { color: textSecondary }]}>Disease activity</Text>
          {(['mild', 'moderate', 'severe'] as Severity[]).map(v => (
            <OptionCard key={v} style={compactCard} label={SEVERITY_LABELS[v]} isSelected={severity === v} onPress={() => setSeverity(v)} />
          ))}

          <Text style={[styles.editFieldLabel, { color: textSecondary }]}>Morning stiffness</Text>
          {(['under_30', '30_60', '1_2_hours', 'over_2_hours'] as MorningStiffness[]).map(v => (
            <OptionCard key={v} style={compactCard} label={MORNING_STIFFNESS_LABELS[v]} isSelected={morningStiffness === v} onPress={() => setMorningStiffness(v)} />
          ))}

          <EditSectionHeader label="Symptoms" color={textSecondary} />

          <Text style={[styles.editFieldLabel, { color: textSecondary }]}>Pain locations</Text>
          {(['lower_back', 'upper_back', 'hips', 'knees', 'shoulders', 'neck', 'chest', 'jaw', 'heels', 'other'] as PainLocation[]).map(v => (
            <MultiSelectCard key={v} style={compactCard} label={PAIN_LOCATION_LABELS[v]} isSelected={painLocations.includes(v)} onPress={() => setPainLocations(arr => toggle(arr, v))} />
          ))}

          <Text style={[styles.editFieldLabel, { color: textSecondary }]}>Types of pain</Text>
          {(['stiffness', 'sharp_pain', 'burning', 'aching', 'fatigue'] as PainType[]).map(v => (
            <MultiSelectCard key={v} style={compactCard} label={PAIN_TYPE_LABELS[v]} isSelected={painTypes.includes(v)} onPress={() => setPainTypes(arr => toggle(arr, v))} />
          ))}

          <EditSectionHeader label="Conditions" color={textSecondary} />

          <Text style={[styles.editFieldLabel, { color: textSecondary }]}>Associated conditions</Text>
          {(['uveitis', 'psoriasis', 'ibd', 'enthesitis', 'peripheral_joint', 'fatigue', 'brain_fog', 'anxiety_depression'] as AssociatedCondition[]).map(v => (
            <MultiSelectCard key={v} style={compactCard} label={CONDITION_LABELS[v]} isSelected={conditions.includes(v)} onPress={() => setConditions(arr => toggle(arr, v))} />
          ))}

          <EditSectionHeader label="Lifestyle" color={textSecondary} />

          <Text style={[styles.editFieldLabel, { color: textSecondary }]}>Life challenges</Text>
          {(['sleep', 'exercise', 'work', 'social_life', 'mental_health'] as LifestyleChallenge[]).map(v => (
            <MultiSelectCard key={v} style={compactCard} label={CHALLENGE_LABELS[v]} isSelected={challenges.includes(v)} onPress={() => setChallenges(arr => toggle(arr, v))} />
          ))}

          <EditSectionHeader label="Treatment" color={textSecondary} />

          <Text style={[styles.editFieldLabel, { color: textSecondary }]}>Current treatment</Text>
          {(['adalimumab', 'secukinumab', 'ixekizumab', 'ustekinumab', 'nsaids_only', 'no_medication', 'other'] as Medication[]).map(v => (
            <MultiSelectCard key={v} style={compactCard} label={MEDICATION_LABELS[v]} isSelected={medications.includes(v)} onPress={() => setMedications(arr => toggle(arr, v))} />
          ))}

          <TouchableOpacity
            onPress={handleSave}
            disabled={isSaving}
            activeOpacity={0.8}
            style={[styles.modalSaveBtn, { marginTop: Spacing.xl, opacity: isSaving ? 0.6 : 1 }]}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.modalSaveText}>Save changes</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── AddMedicationModal ───────────────────────────────────────────────────────

interface AddMedicationModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (med: Omit<MedicationReminder, 'id' | 'user_id'>) => Promise<void>;
  isDark: boolean;
  profileMeds?: string[];
}

const FREQUENCIES: MedicationReminder['frequency'][] = [
  'daily',
  'weekly',
  'fortnightly',
  'monthly',
];

function AddMedicationModal({
  visible,
  onClose,
  onSave,
  isDark,
  profileMeds,
}: AddMedicationModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [frequency, setFrequency] = useState<MedicationReminder['frequency']>('daily');
  const [reminderTime, setReminderTime] = useState('08:00');
  const [isSaving, setIsSaving] = useState(false);

  const cardBg = isDark ? Colors.surfaceDark : Colors.surface;
  const cardBorder = isDark ? Colors.borderDark : Colors.border;
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;
  const inputBg = isDark ? Colors.backgroundDark : Colors.background;

  function reset() {
    setName('');
    setDose('');
    setFrequency('daily');
    setReminderTime('08:00');
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('', 'Please enter a medication name.');
      return;
    }
    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        dose: dose.trim(),
        frequency,
        reminder_time: reminderTime,
        active: true,
      });
      reset();
      onClose();
    } catch (err) {
      console.error('Add medication error:', err);
      Alert.alert('Error', t('errors.save_failed'));
    } finally {
      setIsSaving(false);
    }
  }

  function handleClose() {
    reset();
    onClose();
  }

  const freqLabels: Record<MedicationReminder['frequency'], string> = {
    daily: t('medications.daily'),
    weekly: t('medications.weekly'),
    fortnightly: t('medications.fortnightly'),
    monthly: t('medications.monthly'),
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: cardBg, borderColor: cardBorder },
          ]}
        >
          <Text style={[styles.modalTitle, { color: textPrimary }]}>
            {t('medications.add_title')}
          </Text>

          {/* Quick-fill from profile treatment */}
          {profileMeds && profileMeds.filter((m) => m !== 'no_medication').length > 0 && (
            <View style={{ marginBottom: Spacing.md }}>
              <Text style={[styles.fieldLabel, { color: textSecondary }]}>From your treatment</Text>
              <View style={styles.chipsRow}>
                {profileMeds.filter((m) => m !== 'no_medication').map((med) => {
                  const label = MEDICATION_LABELS[med] ?? capitalize(med);
                  return (
                    <TouchableOpacity
                      key={med}
                      onPress={() => setName(label)}
                      activeOpacity={0.8}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: name === label ? Colors.primary : inputBg,
                          borderColor: name === label ? Colors.primary : cardBorder,
                        },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: name === label ? '#FFFFFF' : textSecondary }]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={[styles.helperText, { color: textSecondary, marginBottom: 0, marginTop: 4 }]}>
                Tap to pre-fill — then add dose and schedule below
              </Text>
            </View>
          )}

          {/* Medication name */}
          <Text style={[styles.fieldLabel, { color: textSecondary }]}>
            {t('medications.name')}
          </Text>
          <TextInput
            style={[
              styles.textInput,
              { backgroundColor: inputBg, borderColor: cardBorder, color: textPrimary },
            ]}
            placeholder={t('medications.name_placeholder')}
            placeholderTextColor={textSecondary}
            value={name}
            onChangeText={setName}
          />

          {/* Dose */}
          <Text style={[styles.fieldLabel, { color: textSecondary }]}>
            {t('medications.dose')}
          </Text>
          <TextInput
            style={[
              styles.textInput,
              { backgroundColor: inputBg, borderColor: cardBorder, color: textPrimary },
            ]}
            placeholder={t('medications.dose_placeholder')}
            placeholderTextColor={textSecondary}
            value={dose}
            onChangeText={setDose}
          />

          {/* Frequency chips */}
          <Text style={[styles.fieldLabel, { color: textSecondary }]}>
            {t('medications.frequency')}
          </Text>
          <View style={styles.chipsRow}>
            {FREQUENCIES.map((freq) => (
              <TouchableOpacity
                key={freq}
                onPress={() => setFrequency(freq)}
                activeOpacity={0.8}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      frequency === freq ? Colors.primary : inputBg,
                    borderColor:
                      frequency === freq ? Colors.primary : cardBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: frequency === freq ? '#FFFFFF' : textSecondary },
                  ]}
                >
                  {freqLabels[freq]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Reminder time */}
          <Text style={[styles.fieldLabel, { color: textSecondary }]}>
            {t('medications.reminder_time')}
          </Text>
          <DateTimePicker
            value={timeStringToDate(reminderTime)}
            mode="time"
            display="spinner"
            onChange={(_event, date) => {
              if (date) setReminderTime(dateToTimeString(date));
            }}
            textColor={textPrimary}
            style={{ width: '100%', height: 150 }}
          />

          {/* Actions */}
          <View style={styles.modalActions}>
            <TouchableOpacity
              onPress={handleClose}
              style={[
                styles.modalCancelBtn,
                { borderColor: cardBorder },
              ]}
              activeOpacity={0.8}
            >
              <Text style={[styles.modalCancelText, { color: textSecondary }]}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSave}
              style={[styles.modalSaveBtn, { opacity: isSaving ? 0.6 : 1 }]}
              disabled={isSaving}
              activeOpacity={0.8}
            >
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.modalSaveText}>
                  {t('medications.save')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── LogInjectionModal ────────────────────────────────────────────────────────

const BIOLOGIC_MEDS = ['adalimumab', 'secukinumab', 'ixekizumab', 'ustekinumab'];

interface LogInjectionModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (inj: Omit<BiologicInjection, 'id' | 'user_id'>) => Promise<void>;
  defaultMedicationName: string;
  isDark: boolean;
}

function LogInjectionModal({ visible, onClose, onSave, defaultMedicationName, isDark }: LogInjectionModalProps) {
  const today = new Date().toISOString().split('T')[0];
  const [medicationName, setMedicationName] = useState(defaultMedicationName);
  const [injectedAt, setInjectedAt] = useState(today);
  const [intervalDays, setIntervalDays] = useState(
    BIOLOGIC_INTERVALS[defaultMedicationName.toLowerCase()] ?? 14
  );
  const [lotNumber, setLotNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const cardBg = isDark ? Colors.surfaceDark : Colors.surface;
  const cardBorder = isDark ? Colors.borderDark : Colors.border;
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;
  const inputBg = isDark ? Colors.backgroundDark : Colors.background;

  React.useEffect(() => {
    if (visible) {
      setMedicationName(defaultMedicationName);
      setInjectedAt(today);
      setIntervalDays(BIOLOGIC_INTERVALS[defaultMedicationName.toLowerCase()] ?? 14);
      setLotNumber('');
      setNotes('');
    }
  }, [visible, defaultMedicationName]);

  async function handleSave() {
    setIsSaving(true);
    try {
      await onSave({
        medication_name: medicationName,
        injected_at: injectedAt,
        interval_days: intervalDays,
        lot_number: lotNumber,
        notes,
        response_rating: null,
      });
      onClose();
    } catch (err) {
      Alert.alert('Error', 'Failed to save injection.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContainer, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.modalTitle, { color: textPrimary }]}>Log injection</Text>

          <Text style={[styles.fieldLabel, { color: textSecondary }]}>Medication</Text>
          <TextInput
            style={[styles.textInput, { backgroundColor: inputBg, borderColor: cardBorder, color: textPrimary }]}
            value={medicationName}
            onChangeText={setMedicationName}
            placeholder="Medication name"
            placeholderTextColor={textSecondary}
          />

          <Text style={[styles.fieldLabel, { color: textSecondary }]}>Date (YYYY-MM-DD)</Text>
          <TextInput
            style={[styles.textInput, { backgroundColor: inputBg, borderColor: cardBorder, color: textPrimary }]}
            value={injectedAt}
            onChangeText={setInjectedAt}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={textSecondary}
          />

          <Text style={[styles.fieldLabel, { color: textSecondary }]}>Interval (days)</Text>
          <View style={styles.chipsRow}>
            {[14, 28, 84].map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => setIntervalDays(d)}
                activeOpacity={0.8}
                style={[styles.chip, { backgroundColor: intervalDays === d ? Colors.primary : inputBg, borderColor: intervalDays === d ? Colors.primary : cardBorder }]}
              >
                <Text style={[styles.chipText, { color: intervalDays === d ? '#FFFFFF' : textSecondary }]}>{d}d</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.fieldLabel, { color: textSecondary }]}>Lot number (optional)</Text>
          <TextInput
            style={[styles.textInput, { backgroundColor: inputBg, borderColor: cardBorder, color: textPrimary }]}
            value={lotNumber}
            onChangeText={setLotNumber}
            placeholder="e.g. ABC123"
            placeholderTextColor={textSecondary}
          />

          <Text style={[styles.fieldLabel, { color: textSecondary }]}>Notes (optional)</Text>
          <TextInput
            style={[styles.textInput, { backgroundColor: inputBg, borderColor: cardBorder, color: textPrimary }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Any notes..."
            placeholderTextColor={textSecondary}
          />

          <View style={styles.modalActions}>
            <TouchableOpacity onPress={onClose} style={[styles.modalCancelBtn, { borderColor: cardBorder }]} activeOpacity={0.8}>
              <Text style={[styles.modalCancelText, { color: textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} disabled={isSaving} style={[styles.modalSaveBtn, { opacity: isSaving ? 0.6 : 1 }]} activeOpacity={0.8}>
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.modalSaveText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { signOut, user } = useAuth();
  const { profile, saveProfile } = useProfile();
  const {
    medications,
    isLoading: medsLoading,
    addMedication,
    deleteMedication,
  } = useMedications();
  const { flares } = useFlares();
  const { isSubscribed, isLoading: subLoading, monthlyPrice, purchase, restore } = useSubscription();
  const { tracks: tracksMedication, setTracks: setTracksMedication } = useMedicationTracking();
  const { injections: biologicInjections, logInjection, deleteInjection: deleteBiologicInj } = useBiologicInjections();
  const {
    isAvailable: healthAvailable,
    isConnected: healthConnected,
    isLoading: healthLoading,
    todayData: healthData,
    connect: connectHealth,
    sync: syncHealth,
    disconnect: disconnectHealthData,
  } = useHealthData();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const version = Constants.expoConfig?.version ?? '1.0.0';

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(profile?.preferred_name ?? '');
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showLogInjection, setShowLogInjection] = useState(false);
  const [injectionDefaultMed, setInjectionDefaultMed] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pendingTime, setPendingTime] = useState<Date | null>(null);

  // Restore persisted reminder toggle and re-schedule notification on mount
  useEffect(() => {
    if (!user) return;
    AsyncStorage.getItem(`@spondy_reminder_enabled_${user.id}`)
      .then((val) => {
        const enabled = val === null ? true : val === 'true';
        setReminderEnabled(enabled);
        if (enabled && profile?.notification_time) {
          scheduleDailyCheckIn(profile.notification_time).catch(() => {});
        }
      })
      .catch(() => {});
  }, [user, profile?.notification_time]);
  const [aiContext, setAiContext] = useState(profile?.ai_context ?? '');
  const [isSavingAiContext, setIsSavingAiContext] = useState(false);
  const [editingAiContext, setEditingAiContext] = useState(false);
  const [showAddMed, setShowAddMed] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportFromDate, setReportFromDate] = useState<string>('');
  const [editingReportFromDate, setEditingReportFromDate] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Sync aiContext when profile loads
  React.useEffect(() => {
    if (profile?.ai_context) setAiContext(profile.ai_context);
  }, [profile?.ai_context]);

  React.useEffect(() => {
    setNameValue(profile?.preferred_name ?? '');
  }, [profile?.preferred_name]);

  const bg = isDark ? Colors.backgroundDark : Colors.background;
  const cardBg = isDark ? Colors.surfaceDark : Colors.surface;
  const cardBorder = isDark ? Colors.borderDark : Colors.border;
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;
  const inputBg = isDark ? Colors.backgroundDark : Colors.background;

  const handleSignOut = useCallback(() => {
    Alert.alert(t('auth.sign_out'), 'Sign out of Spondy?', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('auth.sign_out'),
        style: 'destructive',
        onPress: async () => {
          setIsSigningOut(true);
          try {
            await signOut();
          } catch (err) {
            console.error('Sign out failed:', err);
          } finally {
            setIsSigningOut(false);
          }
        },
      },
    ]);
  }, [signOut, t]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete all data',
      'This permanently deletes all your logs, flares, medications, and profile data. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'All your data will be deleted and cannot be recovered.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, delete everything',
                  style: 'destructive',
                  onPress: async () => {
                    if (!user) return;
                    setIsDeletingAccount(true);
                    try {
                      await deleteAllUserData(user.id);
                      await signOut();
                    } catch (err) {
                      console.error('Delete account error:', err);
                      Alert.alert('', 'Failed to delete data. Please try again.');
                    } finally {
                      setIsDeletingAccount(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }, [user, signOut]);

  const handleToggleReminder = useCallback(
    async (value: boolean) => {
      setReminderEnabled(value);
      if (user) {
        await AsyncStorage.setItem(`@spondy_reminder_enabled_${user.id}`, String(value));
      }
      if (value && profile?.notification_time) {
        try {
          await scheduleDailyCheckIn(profile.notification_time);
        } catch (err) {
          console.error('scheduleDailyCheckIn error:', err);
        }
      } else if (!value) {
        try {
          await cancelNotification('daily-checkin');
        } catch (err) {
          console.error('cancelNotification error:', err);
        }
      }
    },
    [profile?.notification_time, user]
  );

  const handleUpdateTime = useCallback(() => {
    setPendingTime(timeStringToDate(profile?.notification_time ?? '20:00'));
    setShowTimePicker(true);
  }, [profile?.notification_time]);

  const handleSaveTime = useCallback(async () => {
    if (!pendingTime) return;
    setShowTimePicker(false);
    const value = dateToTimeString(pendingTime);
    try {
      await saveProfile({ notification_time: value });
      if (reminderEnabled) {
        await scheduleDailyCheckIn(value);
      }
    } catch (err) {
      console.error('Update notification time error:', err);
      Alert.alert('Error', t('errors.save_failed'));
    }
  }, [pendingTime, reminderEnabled, saveProfile, t]);

  const handleSaveAiContext = useCallback(async () => {
    setIsSavingAiContext(true);
    try {
      await saveProfile({ ai_context: aiContext });
      setEditingAiContext(false);
    } catch (err) {
      console.error('Save AI context error:', err);
      Alert.alert('Error', t('errors.save_failed'));
    } finally {
      setIsSavingAiContext(false);
    }
  }, [aiContext, saveProfile, t]);

  const handleDeleteMed = useCallback(
    (id: string, name: string) => {
      Alert.alert(
        name,
        'Remove this medication reminder?',
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteMedication(id);
              } catch (err) {
                console.error('Delete medication error:', err);
              }
            },
          },
        ]
      );
    },
    [deleteMedication, t]
  );

  const freqLabel = (freq: MedicationReminder['frequency']): string => {
    switch (freq) {
      case 'daily': return t('medications.daily');
      case 'weekly': return t('medications.weekly');
      case 'fortnightly': return t('medications.fortnightly');
      case 'monthly': return t('medications.monthly');
    }
  };

  const handleGenerateReport = useCallback(async () => {
    if (!user || !profile) return;
    setIsGeneratingReport(true);
    try {
      const daysBack = reportFromDate
        ? Math.ceil((Date.now() - new Date(reportFromDate + 'T00:00:00').getTime()) / 86400000) + 1
        : 365;
      const [logs, uveitisEpisodes, basdaiScores] = await Promise.all([
        getDailyLogs(user.id, daysBack),
        getUveitisEpisodes(user.id),
        getBasdaiScores(user.id, 50),
      ]);
      await generateAndShareReport({
        logs,
        flares,
        uveitisEpisodes,
        medications,
        biologicInjections,
        profile,
        basdaiScores,
        fromDate: reportFromDate || undefined,
      });
    } catch (err) {
      console.error('Generate report error:', err);
      Alert.alert('', t('errors.save_failed'));
    } finally {
      setIsGeneratingReport(false);
    }
  }, [user, profile, flares, medications, biologicInjections, reportFromDate, t]);

  const handlePurchase = useCallback(async () => {
    setIsPurchasing(true);
    logEvent(Events.PURCHASE_STARTED).catch(() => {});
    try {
      const success = await purchase();
      if (success) {
        logEvent(Events.PURCHASE_SUCCESS).catch(() => {});
      } else {
        logEvent(Events.PURCHASE_CANCELLED).catch(() => {});
        Alert.alert('', t('profile.purchase_unavailable'));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logEvent(Events.PURCHASE_ERROR, { message: msg }).catch(() => {});
      Alert.alert('Purchase error', msg);
    } finally {
      setIsPurchasing(false);
    }
  }, [purchase, t]);

  const handleRestore = useCallback(async () => {
    setIsRestoring(true);
    try {
      const success = await restore();
      if (!success) {
        Alert.alert('', 'No previous purchases found.');
      }
    } catch (err) {
      console.error('Restore error:', err);
    } finally {
      setIsRestoring(false);
    }
  }, [restore]);

  const handleManageSubscription = useCallback(() => {
    Linking.openURL('https://apps.apple.com/account/subscriptions');
  }, []);

  const isEmailAuth = user?.app_metadata?.provider === 'email' ||
    user?.identities?.some((i: { provider: string }) => i.provider === 'email');

  const handleChangeEmail = useCallback(() => {
    Alert.prompt(
      'Change email',
      'Enter your new email address.',
      async (newEmail) => {
        if (!newEmail?.trim()) return;
        const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
        if (error) Alert.alert('Error', 'Failed to update email.');
        else Alert.alert('', 'Check your new inbox to confirm the change.');
      },
      'plain-text',
      user?.email ?? ''
    );
  }, [user?.email]);

  const handleChangePassword = useCallback(() => {
    Alert.prompt(
      'New password',
      'At least 8 characters.',
      async (newPassword) => {
        if (!newPassword || newPassword.length < 8) {
          Alert.alert('', 'Password must be at least 8 characters.');
          return;
        }
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) Alert.alert('Error', 'Failed to update password.');
        else Alert.alert('', 'Password updated.');
      },
      'secure-text'
    );
  }, []);

  const handleSendFeedback = useCallback(() => {
    if (!feedbackText.trim()) return;
    const subject = encodeURIComponent('Spondy Feedback');
    const body = encodeURIComponent(feedbackText.trim() + (user?.email ? `\n\n— ${user.email}` : ''));
    Linking.openURL(`mailto:joseph.brockbank@gmail.com?subject=${subject}&body=${body}`);
    setFeedbackText('');
    setShowFeedback(false);
  }, [feedbackText, user?.email]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: bg }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Text style={[styles.title, { color: textPrimary }]}>My profile</Text>

        {/* User avatar + name + email */}
        <View style={[styles.avatarCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(nameValue || user?.email)?.charAt(0).toUpperCase() ?? 'U'}
            </Text>
          </View>
          {editingName ? (
            <TextInput
              style={[styles.nameInput, { color: textPrimary, borderColor: Colors.primary }]}
              value={nameValue}
              onChangeText={setNameValue}
              placeholder="Your first name"
              placeholderTextColor={textSecondary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={async () => {
                setEditingName(false);
                try { await saveProfile({ preferred_name: nameValue.trim() || null }); }
                catch { Alert.alert('Error', 'Could not save name. Please try again.'); }
              }}
              onBlur={async () => {
                setEditingName(false);
                try { await saveProfile({ preferred_name: nameValue.trim() || null }); }
                catch { Alert.alert('Error', 'Could not save name. Please try again.'); }
              }}
            />
          ) : (
            <TouchableOpacity onPress={() => setEditingName(true)} activeOpacity={0.7}>
              <Text style={[styles.nameDisplay, { color: nameValue ? textPrimary : textSecondary }]}>
                {nameValue || 'Add your name'}
              </Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.emailText, { color: textSecondary }]}>
            {user?.email ?? ''}
          </Text>
        </View>

        {/* ── AI context card — "About you" ─────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: textPrimary }]}>
              {t('profile.ai_context_card')}
            </Text>
            {!editingAiContext && (
              <TouchableOpacity onPress={() => setEditingAiContext(true)} activeOpacity={0.8}>
                <Text style={styles.editLink}>{t('profile.edit')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {editingAiContext ? (
            <>
              <TextInput
                style={[
                  styles.aiContextInput,
                  { backgroundColor: inputBg, borderColor: cardBorder, color: textPrimary },
                ]}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                placeholder={t('profile.ai_context_placeholder')}
                placeholderTextColor={textSecondary}
                value={aiContext}
                onChangeText={setAiContext}
                autoFocus
              />
              <Text style={[styles.helperText, { color: textSecondary }]}>
                {t('profile.ai_context_helper')}
              </Text>
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <TouchableOpacity
                  onPress={() => { setAiContext(profile?.ai_context ?? ''); setEditingAiContext(false); }}
                  activeOpacity={0.8}
                  style={[styles.cancelContextBtn, { borderColor: cardBorder }]}
                >
                  <Text style={[styles.cancelContextText, { color: textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveAiContext}
                  disabled={isSavingAiContext}
                  activeOpacity={0.8}
                  style={[styles.saveContextBtn, { flex: 2, opacity: isSavingAiContext ? 0.6 : 1 }]}
                >
                  {isSavingAiContext ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.saveContextText}>{t('profile.save_ai_context')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <Text style={[styles.aiContextReadOnly, { color: aiContext ? textPrimary : textSecondary }]}>
              {aiContext || t('profile.ai_context_placeholder')}
            </Text>
          )}
        </View>

        {/* ── Profile summary ────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: textPrimary }]}>
              {t('profile.summary')}
            </Text>
            <TouchableOpacity onPress={() => setShowEditProfile(true)} activeOpacity={0.8}>
              <Text style={styles.editLink}>{t('profile.edit')}</Text>
            </TouchableOpacity>
          </View>

          {/* About you */}
          {(profile?.biological_sex || profile?.age_range || profile?.diagnosis_years || profile?.severity || profile?.morning_stiffness) ? (
            <>
              <SummarySection label="About you" isDark={isDark} first />
              {profile?.biological_sex && <SummaryRow label="Biological sex" value={BIOLOGICAL_SEX_LABELS[profile.biological_sex]} isDark={isDark} />}
              {profile?.age_range && <SummaryRow label="Age range" value={AGE_RANGE_LABELS[profile.age_range]} isDark={isDark} />}
              {profile?.diagnosis_years && <SummaryRow label="Years with AS" value={DIAGNOSIS_YEARS_LABELS[profile.diagnosis_years]} isDark={isDark} />}
              {profile?.severity && <SummaryRow label="Disease activity" value={SEVERITY_LABELS[profile.severity]} isDark={isDark} />}
              {profile?.morning_stiffness && <SummaryRow label="Morning stiffness" value={MORNING_STIFFNESS_LABELS[profile.morning_stiffness]} isDark={isDark} />}
            </>
          ) : null}

          {/* Symptoms */}
          {((profile?.pain_locations?.length ?? 0) > 0 || (profile?.pain_types?.length ?? 0) > 0) ? (
            <>
              <SummarySection label="Symptoms" isDark={isDark} />
              {(profile?.pain_locations?.length ?? 0) > 0 && <SummaryRow label="Pain locations" value={formatList(profile!.pain_locations, PAIN_LOCATION_LABELS)} isDark={isDark} multiline />}
              {(profile?.pain_types?.length ?? 0) > 0 && <SummaryRow label="Types of pain" value={formatList(profile!.pain_types, PAIN_TYPE_LABELS)} isDark={isDark} multiline />}
            </>
          ) : null}

          {/* Conditions */}
          {(profile?.conditions?.length ?? 0) > 0 ? (
            <>
              <SummarySection label="Conditions" isDark={isDark} />
              <SummaryRow label="" value={formatList(profile!.conditions, CONDITION_LABELS)} isDark={isDark} multiline />
            </>
          ) : null}

          {/* Lifestyle */}
          {(profile?.challenges?.length ?? 0) > 0 ? (
            <>
              <SummarySection label="Lifestyle" isDark={isDark} />
              <SummaryRow label="" value={formatList(profile!.challenges, CHALLENGE_LABELS)} isDark={isDark} multiline />
            </>
          ) : null}

          {/* Treatment */}
          {(profile?.medications?.filter(m => m !== 'no_medication').length ?? 0) > 0 ? (
            <>
              <SummarySection label="Treatment" isDark={isDark} />
              <SummaryRow label="" value={formatOnboardingMeds(profile!.medications)} isDark={isDark} multiline />
            </>
          ) : null}

          {/* Empty state */}
          {!profile?.biological_sex && !profile?.age_range && !profile?.diagnosis_years && !profile?.severity && (profile?.conditions?.length ?? 0) === 0 && (
            <Text style={[styles.emptyText, { color: textSecondary }]}>Tap Edit to fill in your profile.</Text>
          )}
        </View>

        {/* ── SUBSCRIPTION ──────────────────────────────────────────────────── */}
        <SectionHeader label="Subscription" isDark={isDark} />

        {/* ── Subscription card ────────────────────────────────────────────── */}
        {!subLoading && (
          isSubscribed ? (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor: Colors.primary }]}>
              <View style={styles.subActiveRow}>
                <Text style={[styles.cardTitle, { color: textPrimary }]}>
                  {t('profile.subscription_active')}
                </Text>
                <View style={styles.premiumBadge}>
                  <Text style={styles.premiumBadgeText}>Premium</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={handleManageSubscription}
                activeOpacity={0.8}
                style={styles.manageSubBtn}
              >
                <Text style={styles.manageSubText}>{t('profile.subscription_manage')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setShowPremiumModal(true)}
              activeOpacity={0.85}
              style={[styles.card, styles.premiumTeaser, { backgroundColor: cardBg, borderColor: Colors.primary + '50' }]}
            >
              <View style={styles.premiumTeaserRow}>
                <View style={styles.premiumTeaserLeft}>
                  <View style={styles.premiumBadge}>
                    <Text style={styles.premiumBadgeText}>Premium</Text>
                  </View>
                  <Text style={[styles.premiumTeaserTitle, { color: textPrimary }]}>
                    AI-powered insights
                  </Text>
                  <Text style={[styles.premiumTeaserBody, { color: textSecondary }]}>
                    Weekly reports, flare prediction, and a chat with your own data.
                    {monthlyPrice ? ` ${monthlyPrice}/month after a 14-day free trial.` : ' 14-day free trial.'}
                  </Text>
                </View>
                <Text style={[styles.premiumTeaserArrow, { color: Colors.primary }]}>→</Text>
              </View>
            </TouchableOpacity>
          )
        )}

        {/* ── APP ───────────────────────────────────────────────────────────── */}
        <SectionHeader label="Notifications" isDark={isDark} />

        {/* ── Notifications card ─────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {/* Daily check-in */}
          <View style={styles.notifRow}>
            <View style={styles.notifInfo}>
              <Text style={[styles.notifLabel, { color: textPrimary }]}>
                {t('profile.daily_reminder')}
              </Text>
              <Text style={[styles.notifTime, { color: textSecondary }]}>
                {profile?.notification_time ?? '20:00'}
              </Text>
            </View>
            <Switch
              value={reminderEnabled}
              onValueChange={handleToggleReminder}
              trackColor={{ true: Colors.primary, false: cardBorder }}
              thumbColor="#FFFFFF"
            />
          </View>

          {reminderEnabled && !showTimePicker && (
            <TouchableOpacity
              onPress={handleUpdateTime}
              activeOpacity={0.8}
              style={[styles.updateTimeBtn, { borderColor: cardBorder }]}
            >
              <Text style={[styles.updateTimeText, { color: Colors.primary }]}>
                {t('profile.update_time')}
              </Text>
            </TouchableOpacity>
          )}

          {reminderEnabled && showTimePicker && (
            <View>
              <DateTimePicker
                value={pendingTime ?? timeStringToDate(profile?.notification_time ?? '20:00')}
                mode="time"
                display="spinner"
                onChange={(_event, date) => {
                  if (date) setPendingTime(date);
                }}
                textColor={isDark ? Colors.textPrimaryDark : Colors.textPrimary}
                style={{ width: '100%', height: 150 }}
              />
              <View style={styles.timePickerActions}>
                <TouchableOpacity
                  onPress={() => setShowTimePicker(false)}
                  style={[styles.timePickerCancel, { borderColor: cardBorder }]}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: textSecondary, fontWeight: '500' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveTime}
                  style={styles.timePickerSave}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Medication reminders */}
          <View style={[styles.medSectionDivider, { borderTopColor: cardBorder, marginTop: Spacing.md }]} />

          <View style={[styles.notifRow, { marginTop: Spacing.md, marginBottom: Spacing.sm }]}>
            <View style={styles.notifInfo}>
              <Text style={[styles.notifLabel, { color: textPrimary }]}>
                {t('profile.track_medication_adherence')}
              </Text>
              <Text style={[styles.notifTime, { color: textSecondary }]}>
                {tracksMedication ? t('profile.track_medication_on') : t('profile.track_medication_off')}
              </Text>
            </View>
            <Switch
              value={tracksMedication}
              onValueChange={setTracksMedication}
              trackColor={{ true: Colors.primary, false: cardBorder }}
              thumbColor="#FFFFFF"
            />
          </View>

          {medsLoading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.md }} />
          ) : (
            medications.map((med) => (
              <View key={med.id} style={[styles.medRow, { borderBottomColor: cardBorder }]}>
                <View style={styles.medInfo}>
                  <Text style={[styles.medName, { color: textPrimary }]}>{med.name}</Text>
                  <View style={styles.medMeta}>
                    {med.dose ? <Text style={[styles.medDose, { color: textSecondary }]}>{med.dose}</Text> : null}
                    <View style={styles.freqBadge}>
                      <Text style={styles.freqBadgeText}>{freqLabel(med.frequency)}</Text>
                    </View>
                    <Text style={[styles.medTime, { color: textSecondary }]}>{med.reminder_time}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => handleDeleteMed(med.id!, med.name)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.deleteIcon}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* ── HEALTH DATA ──────────────────────────────────────────────────── */}
        {healthAvailable && (
          <>
            <SectionHeader label="Health data" isDark={isDark} />
            <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <View style={styles.healthSimpleRow}>
                <Text style={[styles.healthSimpleName, { color: textPrimary }]}>Apple Health</Text>
                <View style={{ flex: 1 }} />
                {healthConnected && (
                  <View style={[styles.healthConnectedBadge, { backgroundColor: Colors.success + '22' }]}>
                    <Text style={[styles.healthConnectedBadgeText, { color: Colors.success }]}>Connected</Text>
                  </View>
                )}
                <TouchableOpacity
                  onPress={healthConnected ? disconnectHealthData : connectHealth}
                  disabled={healthLoading}
                  activeOpacity={0.8}
                >
                  {healthLoading ? (
                    <ActivityIndicator color={Colors.primary} size="small" />
                  ) : (
                    <Text style={[styles.healthSimpleAction, { color: healthConnected ? Colors.error : Colors.primary }]}>
                      {healthConnected ? t('health.disconnect') : t('health.connect')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* ── TREATMENT ─────────────────────────────────────────────────────── */}
        <SectionHeader label="Treatment" isDark={isDark} />

        {/* ── Biologic injections card ─────────────────────────────────────── */}
        {profile?.medications && profile.medications.some(m => BIOLOGIC_MEDS.includes(m)) && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: textPrimary }]}>Biologic injections</Text>
              <TouchableOpacity
                onPress={() => {
                  const firstBiologic = profile.medications.find(m => BIOLOGIC_MEDS.includes(m)) ?? '';
                  setInjectionDefaultMed(MEDICATION_LABELS[firstBiologic] ?? firstBiologic);
                  setShowLogInjection(true);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.editLink}>+ Log injection</Text>
              </TouchableOpacity>
            </View>

            {/* Per-biologic next due date */}
            {profile.medications.filter(m => BIOLOGIC_MEDS.includes(m)).map(med => {
              const lastInj = biologicInjections.find(i =>
                i.medication_name.toLowerCase().includes(med.toLowerCase()) ||
                (MEDICATION_LABELS[med] ?? '').toLowerCase().includes(i.medication_name.toLowerCase())
              );
              if (!lastInj) return (
                <View key={med} style={styles.injectionRow}>
                  <Text style={[styles.injectionMedName, { color: textPrimary }]}>{MEDICATION_LABELS[med] ?? med}</Text>
                  <Text style={[styles.injectionDue, { color: textSecondary }]}>No injections logged</Text>
                </View>
              );
              const due = new Date(lastInj.injected_at + 'T12:00:00');
              due.setDate(due.getDate() + lastInj.interval_days);
              const daysUntil = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              const dueColor = daysUntil <= 0 ? Colors.error : daysUntil <= 2 ? Colors.warning : Colors.success;
              return (
                <View key={med} style={styles.injectionRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.injectionMedName, { color: textPrimary }]}>{MEDICATION_LABELS[med] ?? med}</Text>
                    <Text style={[styles.injectionLastDate, { color: textSecondary }]}>Last: {lastInj.injected_at}</Text>
                  </View>
                  <Text style={[styles.injectionDue, { color: dueColor, fontWeight: '700' }]}>
                    {daysUntil <= 0 ? 'Due today' : daysUntil === 1 ? 'Due tomorrow' : `Due in ${daysUntil} days`}
                  </Text>
                </View>
              );
            })}

            {/* Recent injection history */}
            {biologicInjections.length > 0 && (
              <>
                <View style={[styles.medSectionDivider, { borderTopColor: cardBorder, marginTop: Spacing.xs }]} />
                <Text style={[styles.medSectionLabel, { color: textSecondary, marginTop: Spacing.sm, marginBottom: Spacing.xs }]}>
                  Recent injections
                </Text>
                {biologicInjections.slice(0, 3).map((inj) => (
                  <View key={inj.id} style={[styles.medRow, { borderBottomColor: cardBorder }]}>
                    <View style={styles.medInfo}>
                      <Text style={[styles.medName, { color: textPrimary }]}>{inj.medication_name}</Text>
                      <Text style={[styles.medDose, { color: textSecondary }]}>{inj.injected_at} · {inj.interval_days}d interval</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => Alert.alert(inj.medication_name, 'Remove this injection record?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => deleteBiologicInj(inj.id!) },
                      ])}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.deleteIcon}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        {/* ── Share with my doctor ────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: textPrimary }]}>
              {t('profile.share_report_title')}
            </Text>
            <InfoButton
              title="What's in the report"
              message="A PDF covering all your daily logs, flares, stiffness trends, medication adherence, and BASDAI scores. Set a date range to cover just since your last appointment, then share it with your rheumatologist."
              color={textSecondary}
            />
          </View>
          {/* From date — last rheumatology appointment */}
          <View style={styles.reportDateRow}>
            <Text style={[styles.reportDateLabel, { color: textSecondary }]}>From last appointment:</Text>
            {editingReportFromDate ? (
              <TextInput
                style={[styles.reportDateInput, { color: textPrimary, borderColor: Colors.primary }]}
                value={reportFromDate}
                onChangeText={setReportFromDate}
                onBlur={() => setEditingReportFromDate(false)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={textSecondary}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => setEditingReportFromDate(false)}
              />
            ) : (
              <TouchableOpacity onPress={() => setEditingReportFromDate(true)} activeOpacity={0.7}>
                <Text style={[styles.reportDateValue, { color: reportFromDate ? textPrimary : Colors.primary }]}>
                  {reportFromDate || 'Last 12 months (tap to set)'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            onPress={handleGenerateReport}
            disabled={isGeneratingReport}
            activeOpacity={0.8}
            style={[styles.reportBtn, { opacity: isGeneratingReport ? 0.6 : 1 }]}
          >
            {isGeneratingReport ? (
              <View style={styles.reportBtnRow}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.reportBtnText}>
                  {t('profile.share_report_generating')}
                </Text>
              </View>
            ) : (
              <Text style={styles.reportBtnText}>
                {t('profile.share_report_cta')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── ACCOUNT ───────────────────────────────────────────────────────── */}
        <SectionHeader label="Account" isDark={isDark} />

        {/* Feedback */}
        <TouchableOpacity
          style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}
          onPress={() => setShowFeedback(true)}
          activeOpacity={0.8}
        >
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: textPrimary }]}>Share your feedback</Text>
            <Text style={[styles.editLink]}>→</Text>
          </View>
          <Text style={[styles.feedbackCardSubtitle, { color: textSecondary }]}>
            Bugs, ideas, or anything on your mind.
          </Text>
        </TouchableOpacity>

        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {/* Email */}
          <TouchableOpacity onPress={handleChangeEmail} activeOpacity={0.8} style={styles.accountRow}>
            <View>
              <Text style={[styles.accountRowLabel, { color: textPrimary }]}>Email address</Text>
              <Text style={[styles.accountRowValue, { color: textSecondary }]}>{user?.email}</Text>
            </View>
            <Text style={[styles.editLink]}>Change</Text>
          </TouchableOpacity>

          {/* Password — only for email auth */}
          {isEmailAuth && (
            <>
              <View style={[styles.innerDivider, { backgroundColor: isDark ? Colors.borderDark : Colors.border }]} />
              <TouchableOpacity onPress={handleChangePassword} activeOpacity={0.8} style={styles.accountRow}>
                <View>
                  <Text style={[styles.accountRowLabel, { color: textPrimary }]}>Password</Text>
                  <Text style={[styles.accountRowValue, { color: textSecondary }]}>••••••••</Text>
                </View>
                <Text style={[styles.editLink]}>Change</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={[styles.innerDivider, { backgroundColor: isDark ? Colors.borderDark : Colors.border }]} />
          <Button
            label={t('auth.sign_out')}
            onPress={handleSignOut}
            variant="outline"
            isLoading={isSigningOut}
            textStyle={{ color: Colors.error }}
            style={{ borderColor: Colors.error }}
          />
          <View style={[styles.innerDivider, { backgroundColor: isDark ? Colors.borderDark : Colors.border }]} />
          <Button
            label={isDeletingAccount ? 'Deleting…' : 'Delete all my data'}
            onPress={handleDeleteAccount}
            variant="outline"
            isLoading={isDeletingAccount}
            textStyle={{ color: Colors.error, opacity: 0.7 }}
            style={{ borderColor: Colors.error + '60' }}
          />
          <Text style={[styles.deleteDataNote, { color: textSecondary }]}>
            Permanently deletes all logs, flares, medications, and profile data.
          </Text>
        </View>

        {/* Version */}
        <Text style={[styles.version, { color: textSecondary }]}>
          {t('profile.version', { version })}
        </Text>
      </ScrollView>

      <AddMedicationModal
        visible={showAddMed}
        onClose={() => setShowAddMed(false)}
        onSave={addMedication}
        isDark={isDark}
        profileMeds={profile?.medications}
      />

      <ProfileEditModal
        visible={showEditProfile}
        onClose={() => setShowEditProfile(false)}
        profile={profile}
        onSave={saveProfile}
        isDark={isDark}
      />

      <LogInjectionModal
        visible={showLogInjection}
        onClose={() => setShowLogInjection(false)}
        onSave={logInjection}
        defaultMedicationName={injectionDefaultMed}
        isDark={isDark}
      />

      <PremiumModal
        visible={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
        onPurchase={handlePurchase}
        onRestore={handleRestore}
        monthlyPrice={monthlyPrice}
        isPurchasing={isPurchasing}
        isRestoring={isRestoring}
        isDark={isDark}
      />

      {/* Feedback modal */}
      <Modal visible={showFeedback} animationType="slide" transparent onRequestClose={() => setShowFeedback(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContainer, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <Text style={[styles.modalTitle, { color: textPrimary }]}>Share your feedback</Text>
              <Text style={[styles.fieldLabel, { color: textSecondary }]}>What's on your mind?</Text>
              <TextInput
                style={[
                  styles.feedbackInput,
                  { backgroundColor: inputBg, borderColor: cardBorder, color: textPrimary },
                ]}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                placeholder="Bugs, ideas, or anything else..."
                placeholderTextColor={textSecondary}
                value={feedbackText}
                onChangeText={setFeedbackText}
                autoFocus
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => { setFeedbackText(''); setShowFeedback(false); }}
                  style={[styles.modalCancelBtn, { borderColor: cardBorder }]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.modalCancelText, { color: textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSendFeedback}
                  style={[styles.modalSaveBtn, { opacity: feedbackText.trim() ? 1 : 0.4 }]}
                  disabled={!feedbackText.trim()}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalSaveText}>Send</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── SummarySection ───────────────────────────────────────────────────────────

function SummarySection({ label, isDark, first }: { label: string; isDark: boolean; first?: boolean }) {
  const textSec = isDark ? Colors.textSecondaryDark : Colors.textSecondary;
  const borderColor = isDark ? Colors.borderDark : Colors.border;
  return (
    <View style={[styles.summarySectionHeader, { borderTopColor: borderColor }, first && styles.summarySectionFirst]}>
      <Text style={[styles.summarySectionLabel, { color: textSec }]}>{label}</Text>
    </View>
  );
}

// ─── SummaryRow ───────────────────────────────────────────────────────────────

function SummaryRow({
  label,
  value,
  isDark,
  multiline = false,
}: {
  label: string;
  value: string;
  isDark: boolean;
  multiline?: boolean;
}) {
  const valueColor = isDark ? Colors.textPrimaryDark : '#000000';
  const textSec = isDark ? Colors.textSecondaryDark : Colors.textSecondary;
  if (!label) {
    return (
      <Text style={[styles.summaryValueFull, { color: valueColor }]} numberOfLines={multiline ? undefined : 2}>
        {value}
      </Text>
    );
  }
  return (
    <View style={styles.summaryRowItem}>
      <Text style={[styles.summaryRowLabel, { color: textSec }]}>{label}</Text>
      <Text style={[styles.summaryRowValue, { color: valueColor }]} numberOfLines={multiline ? undefined : 1}>
        {value}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    marginBottom: Spacing.sm,
  },

  // Section header
  sectionHeaderRow: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  sectionHeaderRowDark: {
    borderTopColor: Colors.borderDark,
  },
  sectionHeaderRowFirst: {
    marginTop: 0,
    borderTopWidth: 0,
  },
  sectionHeaderLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
  },

  avatarCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  nameDisplay: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  nameInput: {
    fontSize: FontSize.md,
    fontWeight: '700',
    borderBottomWidth: 1.5,
    paddingVertical: 2,
    paddingHorizontal: 4,
    minWidth: 120,
    textAlign: 'center',
  },
  emailText: {
    fontSize: FontSize.sm,
  },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  cardTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  editLink: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '600',
  },

  // Summary section header
  summarySectionHeader: {
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.xs,
  },
  summarySectionFirst: {
    marginTop: 0,
    paddingTop: 0,
    borderTopWidth: 0,
  },
  summarySectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },

  // Summary row
  summaryRowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 3,
    gap: Spacing.sm,
  },
  summaryRowLabel: {
    fontSize: FontSize.sm,
    minWidth: 110,
    flexShrink: 0,
  },
  summaryRowValue: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
    flex: 1,
  },
  summaryValueFull: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    paddingVertical: 3,
  },

  notifRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  notifInfo: {
    flex: 1,
  },
  notifLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  notifTime: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  updateTimeBtn: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    alignSelf: 'flex-start',
  },
  updateTimeText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  timePickerActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  timePickerCancel: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  timePickerSave: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FontSize.sm,
    paddingVertical: Spacing.sm,
  },
  medRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  medInfo: {
    flex: 1,
  },
  medName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  medMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  medDose: {
    fontSize: FontSize.xs,
  },
  freqBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  freqBadgeText: {
    fontSize: FontSize.xs,
    color: Colors.primaryDark,
    fontWeight: '600',
  },
  medTime: {
    fontSize: FontSize.xs,
  },
  deleteIcon: {
    fontSize: FontSize.sm,
    color: Colors.error,
    paddingLeft: Spacing.sm,
  },
  aiContextInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    fontSize: FontSize.sm,
    minHeight: 90,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  helperText: {
    fontSize: FontSize.xs,
    lineHeight: 16,
    marginBottom: Spacing.md,
  },
  saveContextBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  saveContextText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  cancelContextBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  cancelContextText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  aiContextReadOnly: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginTop: Spacing.xs,
  },
  innerDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.sm,
  },
  deleteDataNote: {
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
    lineHeight: 16,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  accountRowLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginBottom: 2,
  },
  accountRowValue: {
    fontSize: FontSize.xs,
  },
  feedbackCardSubtitle: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  feedbackInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    fontSize: FontSize.sm,
    minHeight: 120,
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  version: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  // Welcome content card

  // Health card — simplified single row
  healthSimpleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  healthSimpleName: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  healthConnectedBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  healthConnectedBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  healthSimpleAction: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },

  // Share report card
  subtitleText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  reportBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  reportBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  reportBtnText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  reportDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    flexWrap: 'wrap',
  },
  reportDateLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  reportDateValue: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  reportDateInput: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    minWidth: 110,
  },
  // Subscription card
  premiumTeaser: {
    borderWidth: 1.5,
  },
  premiumTeaserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  premiumTeaserLeft: {
    flex: 1,
    gap: Spacing.xs,
  },
  premiumTeaserTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  premiumTeaserBody: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  premiumTeaserArrow: {
    fontSize: 20,
    fontWeight: '600',
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  subActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  premiumBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  premiumBadgeText: {
    fontSize: FontSize.xs,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  subPrice: {
    fontSize: FontSize.sm,
    marginBottom: Spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  featureText: {
    fontSize: FontSize.sm,
    flex: 1,
    lineHeight: 20,
  },
  purchaseBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  purchaseBtnText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  restoreBtn: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  restoreBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  manageSubBtn: {
    paddingVertical: Spacing.xs,
  },
  manageSubText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '600',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    marginBottom: Spacing.md,
  },
  fieldLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  chip: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
  },
  chipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  modalSaveBtn: {
    flex: 2,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  // Medications card sections
  medSectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  medTreatmentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    paddingVertical: 2,
  },
  medTreatmentDot: {
    fontSize: FontSize.md,
    lineHeight: 20,
  },
  medTreatmentName: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    flex: 1,
  },
  medSectionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // Biologic injection rows
  injectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
  },
  injectionMedName: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  injectionLastDate: {
    fontSize: FontSize.xs,
    marginTop: 1,
  },
  injectionDue: {
    fontSize: FontSize.sm,
  },
  // Profile edit modal
  editModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  editModalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  editModalClose: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  editModalContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  editFieldLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
});
