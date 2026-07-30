import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';

import { InfoButton } from '@/components/common/InfoButton';
import { OptionCard } from '@/components/onboarding/OptionCard';
import { MultiSelectCard } from '@/components/onboarding/MultiSelectCard';
import { supabase } from '@/services/supabase';
import { Colors } from '@/constants/colors';
import { FontSize, FontFamily, Spacing, BorderRadius } from '@/constants/theme';
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
import { getAiConsent, setAiConsent } from '@/services/aiConsent';
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
  if (!value) return '';
  return value.replace('_', '-').replace('plus', '+').replace('under', 'Under ');
}

function formatDiagnosisYears(value: string | null | undefined): string {
  if (!value) return '';
  if (value === 'under_1') return 'Under 1 year';
  if (value === '10_plus') return '10+ years';
  return value.replace('_', '-') + ' years';
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
  '25_35': '25-34',
  '35_45': '35-44',
  '45_55': '45-54',
  '55_plus': '55 and over',
};

const DIAGNOSIS_YEARS_LABELS: Record<string, string> = {
  under_1: 'Less than a year',
  '1_3': '1-3 years',
  '3_5': '3-5 years',
  '5_10': '5-10 years',
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
  '30_60': '30-60 min',
  '1_2_hours': '1-2 hours',
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
  if (!items || items.length === 0) return '';
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
    <Text style={{ fontSize: FontSize.md, fontWeight: '700', fontFamily: FontFamily.bold, color, marginTop: Spacing.xl, marginBottom: Spacing.sm }}>
      {label}
    </Text>
  );
}

function ProfileEditModal({ visible, onClose, profile, onSave, isDark }: ProfileEditModalProps) {
  const { t } = useTranslation();
  const { top: topInset } = useSafeAreaInsets();
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
      Alert.alert(t('common.error'), t('profile_alerts.error_save_profile'));
    } finally {
      setIsSaving(false);
    }
  }

  const compactCard = { paddingVertical: 8, marginBottom: 4 } as const;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: bg, paddingTop: topInset }}>
        <View style={[styles.editModalHeader, { borderBottomColor: cardBorder }]}>
          <Text style={[styles.editModalTitle, { color: textPrimary }]}>{t('profile.edit')}</Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.8}>
            <Text style={[styles.editModalClose, { color: textSecondary }]}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.editModalContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <EditSectionHeader label={t('profile_alerts.about_me')} color={textSecondary} />

          <Text style={[styles.editFieldLabel, { color: textSecondary }]}>{t('profile_alerts.biological_sex')}</Text>
          {(['male', 'female', 'prefer_not_to_say'] as BiologicalSex[]).map(v => (
            <OptionCard key={v} style={compactCard} label={BIOLOGICAL_SEX_LABELS[v]} isSelected={biologicalSex === v} onPress={() => setBiologicalSex(v)} />
          ))}

          <Text style={[styles.editFieldLabel, { color: textSecondary }]}>{t('onboarding.age_range')}</Text>
          {(['under_25', '25_35', '35_45', '45_55', '55_plus'] as AgeRange[]).map(v => (
            <OptionCard key={v} style={compactCard} label={AGE_RANGE_LABELS[v]} isSelected={ageRange === v} onPress={() => setAgeRange(v)} />
          ))}

          <Text style={[styles.editFieldLabel, { color: textSecondary }]}>{t('profile_alerts.years_with_as')}</Text>
          {(['under_1', '1_3', '3_5', '5_10', '10_plus'] as DiagnosisYears[]).map(v => (
            <OptionCard key={v} style={compactCard} label={DIAGNOSIS_YEARS_LABELS[v]} isSelected={diagnosisYears === v} onPress={() => setDiagnosisYears(v)} />
          ))}

          <Text style={[styles.editFieldLabel, { color: textSecondary }]}>{t('onboarding.disease_activity')}</Text>
          {(['mild', 'moderate', 'severe'] as Severity[]).map(v => (
            <OptionCard key={v} style={compactCard} label={SEVERITY_LABELS[v]} isSelected={severity === v} onPress={() => setSeverity(v)} />
          ))}

          <Text style={[styles.editFieldLabel, { color: textSecondary }]}>{t('profile_alerts.morning_stiffness')}</Text>
          {(['under_30', '30_60', '1_2_hours', 'over_2_hours'] as MorningStiffness[]).map(v => (
            <OptionCard key={v} style={compactCard} label={MORNING_STIFFNESS_LABELS[v]} isSelected={morningStiffness === v} onPress={() => setMorningStiffness(v)} />
          ))}

          <EditSectionHeader label={t('profile_alerts.symptoms_section')} color={textSecondary} />

          <Text style={[styles.editFieldLabel, { color: textSecondary }]}>{t('profile_alerts.pain_locations')}</Text>
          {(['lower_back', 'upper_back', 'hips', 'knees', 'shoulders', 'neck', 'chest', 'jaw', 'heels', 'other'] as PainLocation[]).map(v => (
            <MultiSelectCard key={v} style={compactCard} label={PAIN_LOCATION_LABELS[v]} isSelected={painLocations.includes(v)} onPress={() => setPainLocations(arr => toggle(arr, v))} />
          ))}

          <Text style={[styles.editFieldLabel, { color: textSecondary }]}>{t('profile_alerts.pain_types')}</Text>
          {(['stiffness', 'sharp_pain', 'burning', 'aching', 'fatigue'] as PainType[]).map(v => (
            <MultiSelectCard key={v} style={compactCard} label={PAIN_TYPE_LABELS[v]} isSelected={painTypes.includes(v)} onPress={() => setPainTypes(arr => toggle(arr, v))} />
          ))}

          <EditSectionHeader label={t('profile_alerts.conditions_section')} color={textSecondary} />

          <Text style={[styles.editFieldLabel, { color: textSecondary }]}>{t('profile_alerts.conditions')}</Text>
          {(['uveitis', 'psoriasis', 'ibd', 'enthesitis', 'peripheral_joint', 'fatigue', 'brain_fog', 'anxiety_depression'] as AssociatedCondition[]).map(v => (
            <MultiSelectCard key={v} style={compactCard} label={CONDITION_LABELS[v]} isSelected={conditions.includes(v)} onPress={() => setConditions(arr => toggle(arr, v))} />
          ))}

          <EditSectionHeader label={t('profile_alerts.lifestyle_section')} color={textSecondary} />

          <Text style={[styles.editFieldLabel, { color: textSecondary }]}>{t('profile_alerts.challenges')}</Text>
          {(['sleep', 'exercise', 'work', 'social_life', 'mental_health'] as LifestyleChallenge[]).map(v => (
            <MultiSelectCard key={v} style={compactCard} label={CHALLENGE_LABELS[v]} isSelected={challenges.includes(v)} onPress={() => setChallenges(arr => toggle(arr, v))} />
          ))}

          <EditSectionHeader label={t('profile_alerts.treatment_section')} color={textSecondary} />

          <Text style={[styles.editFieldLabel, { color: textSecondary }]}>{t('profile_alerts.current_treatment')}</Text>
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
              <Text style={styles.modalSaveText}>{t('common.save_changes')}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── AddMedicationModal ───────────────────────────────────────────────────────

interface AddMedicationModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (med: Omit<MedicationReminder, 'id' | 'user_id'>) => Promise<void>;
  onUpdate?: (id: string, updates: Partial<MedicationReminder>) => Promise<void>;
  onOpenEditProfile?: () => void;
  editingMed?: MedicationReminder | null;
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
  onUpdate,
  onOpenEditProfile,
  editingMed,
  isDark,
  profileMeds,
}: AddMedicationModalProps) {
  const { height: screenHeight } = useWindowDimensions();
  const { top: topInset } = useSafeAreaInsets();
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [frequency, setFrequency] = useState<MedicationReminder['frequency']>('daily');
  const [reminderTime, setReminderTime] = useState('08:00');
  const [asNeeded, setAsNeeded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = !!editingMed;

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
    setAsNeeded(false);
  }

  React.useEffect(() => {
    if (visible && editingMed) {
      setName(editingMed.name);
      setDose(editingMed.dose ?? '');
      setFrequency(editingMed.frequency);
      setReminderTime(editingMed.reminder_time);
      setAsNeeded(editingMed.as_needed ?? false);
    } else if (visible && !editingMed) {
      reset();
    }
  }, [visible, editingMed]);

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('', t('profile_alerts.error_med_name'));
      return;
    }
    setIsSaving(true);
    try {
      if (isEditing && editingMed && onUpdate) {
        await onUpdate(editingMed.id!, {
          name: name.trim(),
          dose: dose.trim(),
          frequency,
          reminder_time: reminderTime,
          as_needed: asNeeded,
        });
      } else {
        await onSave({
          name: name.trim(),
          dose: dose.trim(),
          frequency,
          reminder_time: reminderTime,
          as_needed: asNeeded,
          active: true,
        });
        logEvent(Events.MEDICATION_ADDED).catch(() => {});
      }
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: cardBg, borderColor: cardBorder, maxHeight: screenHeight - topInset - Spacing.md },
          ]}
        >
          <Text style={[styles.modalTitle, { color: textPrimary }]}>
            {isEditing ? 'Edit medication' : t('medications.add_title')}
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Quick-fill from profile treatment — only shown when adding */}
          {!isEditing && (
            <View style={{ marginBottom: Spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs, marginTop: Spacing.sm }}>
                <Text style={[styles.fieldLabel, { color: textSecondary, marginBottom: 0, marginTop: 0 }]}>{t('profile_alerts.from_treatment')}</Text>
                {onOpenEditProfile && (
                  <TouchableOpacity
                    onPress={() => { handleClose(); onOpenEditProfile(); }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600', fontFamily: FontFamily.semiBold }}>{t('profile_alerts.edit_treatment_link')}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {profileMeds && profileMeds.filter((m) => m !== 'no_medication').length > 0 ? (
                <>
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
                    {t('profile_alerts.treatment_tap_hint')}
                  </Text>
                </>
              ) : (
                <Text style={[styles.helperText, { color: textSecondary, marginBottom: 0 }]}>
                  {t('profile_alerts.no_treatment_yet')}
                </Text>
              )}
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
                onPress={() => { setFrequency(freq); setAsNeeded(false); }}
                activeOpacity={0.8}
                style={[
                  styles.chip,
                  {
                    backgroundColor: !asNeeded && frequency === freq ? Colors.primary : inputBg,
                    borderColor: !asNeeded && frequency === freq ? Colors.primary : cardBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: !asNeeded && frequency === freq ? '#FFFFFF' : textSecondary },
                  ]}
                >
                  {freqLabels[freq]}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => setAsNeeded(true)}
              activeOpacity={0.8}
              style={[
                styles.chip,
                {
                  backgroundColor: asNeeded ? Colors.primary : inputBg,
                  borderColor: asNeeded ? Colors.primary : cardBorder,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: asNeeded ? '#FFFFFF' : textSecondary }]}>
                {t('medications.as_needed')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Reminder time — hidden for PRN meds */}
          {!asNeeded && (
            <>
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
            </>
          )}

          </ScrollView>

          {/* Actions — outside ScrollView so keyboard never buries them */}
          <View style={styles.modalActions}>
            <TouchableOpacity
              onPress={handleClose}
              style={[styles.modalCancelBtn, { borderColor: cardBorder }]}
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
                  {isEditing ? t('common.save_changes') : t('medications.save')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
  const { t } = useTranslation();
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
      Alert.alert(t('common.error'), t('profile_alerts.error_save_injection'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContainer, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.modalTitle, { color: textPrimary }]}>{t('profile_alerts.log_injection')}</Text>

          <Text style={[styles.fieldLabel, { color: textSecondary }]}>{t('profile_alerts.injection_medication')}</Text>
          <TextInput
            style={[styles.textInput, { backgroundColor: inputBg, borderColor: cardBorder, color: textPrimary }]}
            value={medicationName}
            onChangeText={setMedicationName}
            placeholder="Medication name"
            placeholderTextColor={textSecondary}
          />

          <Text style={[styles.fieldLabel, { color: textSecondary }]}>{t('profile_alerts.injection_date')}</Text>
          <TextInput
            style={[styles.textInput, { backgroundColor: inputBg, borderColor: cardBorder, color: textPrimary }]}
            value={injectedAt}
            onChangeText={setInjectedAt}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={textSecondary}
          />

          <Text style={[styles.fieldLabel, { color: textSecondary }]}>{t('profile_alerts.injection_interval')}</Text>
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

          <Text style={[styles.fieldLabel, { color: textSecondary }]}>{t('profile_alerts.injection_lot')}</Text>
          <TextInput
            style={[styles.textInput, { backgroundColor: inputBg, borderColor: cardBorder, color: textPrimary }]}
            value={lotNumber}
            onChangeText={setLotNumber}
            placeholder="e.g. ABC123"
            placeholderTextColor={textSecondary}
          />

          <Text style={[styles.fieldLabel, { color: textSecondary }]}>{t('profile_alerts.injection_notes')}</Text>
          <TextInput
            style={[styles.textInput, { backgroundColor: inputBg, borderColor: cardBorder, color: textPrimary }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Any notes..."
            placeholderTextColor={textSecondary}
          />

          <View style={styles.modalActions}>
            <TouchableOpacity onPress={onClose} style={[styles.modalCancelBtn, { borderColor: cardBorder }]} activeOpacity={0.8}>
              <Text style={[styles.modalCancelText, { color: textSecondary }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} disabled={isSaving} style={[styles.modalSaveBtn, { opacity: isSaving ? 0.6 : 1 }]} activeOpacity={0.8}>
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.modalSaveText}>{t('common.save')}</Text>
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
    updateMedication,
    deleteMedication,
  } = useMedications();
  const { flares } = useFlares();
  const { isSubscribed, isLoading: subLoading, monthlyPrice, trialDays, purchase, restore } = useSubscription();
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

  const version = Constants.expoConfig?.version ?? '1.0.1';

  const profileRowSubtitle = useMemo(() => {
    const parts: string[] = [];
    if (profile?.severity) parts.push(SEVERITY_LABELS[profile.severity]);
    if (profile?.diagnosis_years) parts.push(DIAGNOSIS_YEARS_LABELS[profile.diagnosis_years]);
    if ((profile?.conditions?.length ?? 0) > 0) {
      const count = profile!.conditions.length;
      parts.push(`${count} condition${count > 1 ? 's' : ''}`);
    }
    return parts.join(' · ');
  }, [profile]);

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

  // Restore persisted reminder toggle on mount — scheduling is owned by _layout.tsx
  useEffect(() => {
    if (!user) return;
    AsyncStorage.getItem(`@spondy_reminder_enabled_${user.id}`)
      .then((val) => {
        const enabled = val === null ? true : val === 'true';
        setReminderEnabled(enabled);
      })
      .catch(() => {});
  }, [user]);

  const [aiContext, setAiContext] = useState(profile?.ai_context ?? '');
  const [isSavingAiContext, setIsSavingAiContext] = useState(false);
  const [editingAiContext, setEditingAiContext] = useState(false);

  const [aiConsented, setAiConsentedState] = useState<boolean>(false);
  useEffect(() => {
    getAiConsent().then((val) => setAiConsentedState(val === true));
  }, []);

  const handleToggleAiConsent = useCallback((value: boolean) => {
    if (value) {
      Alert.alert(
        t('profile_privacy.ai_consent_alert_title'),
        t('profile_privacy.ai_consent_alert_body'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('profile_privacy.ai_consent_alert_agree'),
            onPress: () => {
              setAiConsent(true);
              setAiConsentedState(true);
            },
          },
        ]
      );
    } else {
      setAiConsent(false);
      setAiConsentedState(false);
    }
  }, [t]);

  const [showAddMed, setShowAddMed] = useState(false);
  const [editingMed, setEditingMed] = useState<MedicationReminder | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportFromDate, setReportFromDate] = useState<string>('');
  const [showReportDatePicker, setShowReportDatePicker] = useState(false);
  const [pendingReportDate, setPendingReportDate] = useState<string>('');
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
                      Alert.alert('', t('profile_alerts.error_delete_data'));
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
      logEvent(Events.REPORT_GENERATED).catch(() => {});
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
        Alert.alert('', t('common.no_purchases'));
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
      t('common.change_email'),
      t('common.enter_new_email'),
      async (newEmail) => {
        if (!newEmail?.trim()) return;
        const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
        if (error) Alert.alert(t('common.error'), t('profile_alerts.error_update_email'));
        else Alert.alert('', t('profile_alerts.confirm_email_change'));
      },
      'plain-text',
      user?.email ?? ''
    );
  }, [user?.email]);

  const handleChangePassword = useCallback(() => {
    Alert.prompt(
      t('common.new_password'),
      t('common.password_hint'),
      async (newPassword) => {
        if (!newPassword || newPassword.length < 8) {
          Alert.alert('', t('profile_alerts.error_password_short'));
          return;
        }
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) Alert.alert(t('common.error'), t('profile_alerts.error_update_password'));
        else Alert.alert('', t('profile_alerts.password_updated'));
      },
      'secure-text'
    );
  }, []);

  const handleSendFeedback = useCallback(() => {
    if (!feedbackText.trim()) return;
    const subject = encodeURIComponent('Spondy Feedback');
    const body = encodeURIComponent(feedbackText.trim() + (user?.email ? `\n\n- ${user.email}` : ''));
    Linking.openURL(`mailto:joseph.brockbank@gmail.com?subject=${subject}&body=${body}`);
    setFeedbackText('');
    setShowFeedback(false);
  }, [feedbackText, user?.email]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: bg }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── User header ─────────────────────────────────────────────────── */}
        <View style={styles.profileHeader}>
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
                catch { Alert.alert(t('common.error'), t('profile_alerts.error_save_name')); }
              }}
              onBlur={async () => {
                setEditingName(false);
                try { await saveProfile({ preferred_name: nameValue.trim() || null }); }
                catch { Alert.alert(t('common.error'), t('profile_alerts.error_save_name')); }
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

        {/* ── Profile ─────────────────────────────────────────────────────── */}
        <View style={[styles.settingsCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => setShowEditProfile(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.settingsRowLabel, { color: textPrimary }]}>{t('profile.edit')}</Text>
            <Text style={[styles.chevron, { color: textSecondary }]}>›</Text>
          </TouchableOpacity>

          {isSubscribed && (
            <>
              <View style={[styles.rowDivider, { backgroundColor: cardBorder }]} />

              <TouchableOpacity
                style={styles.settingsRow}
                onPress={() => setEditingAiContext(!editingAiContext)}
                activeOpacity={0.7}
              >
                <View style={styles.settingsRowLeft}>
                  <Text style={[styles.settingsRowLabel, { color: textPrimary }]}>{t('profile_alerts.about_me')}</Text>
                  {!editingAiContext && (
                    <Text style={[styles.settingsRowSub, { color: textSecondary }]} numberOfLines={1}>
                      {aiContext || "Personalise your AI's understanding"}
                    </Text>
                  )}
                </View>
                {!editingAiContext && <Text style={[styles.chevron, { color: textSecondary }]}>›</Text>}
              </TouchableOpacity>
            </>
          )}

          {editingAiContext && (
            <View style={styles.aiContextExpanded}>
              <TextInput
                style={[
                  styles.aiContextInput,
                  { backgroundColor: inputBg, borderColor: Colors.primary, color: textPrimary },
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
                  <Text style={[styles.cancelContextText, { color: textSecondary }]}>{t('common.cancel')}</Text>
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
            </View>
          )}
        </View>

        {/* ── Subscription ────────────────────────────────────────────────── */}
        {!subLoading && (
          isSubscribed ? (
            <View style={[styles.settingsCard, { backgroundColor: cardBg, borderColor: Colors.primary }]}>
              <View style={[styles.settingsRow, { paddingRight: Spacing.md }]}>
                <Text style={[styles.settingsRowLabel, { color: textPrimary, fontSize: FontSize.md }]}>
                  {t('profile.subscription_active')}
                </Text>
                <View style={styles.premiumBadge}>
                  <Text style={styles.premiumBadgeText}>{t('common.premium')}</Text>
                </View>
              </View>
              <View style={[styles.rowDivider, { backgroundColor: Colors.primary + '30' }]} />
              <TouchableOpacity
                onPress={handleManageSubscription}
                activeOpacity={0.8}
                style={styles.settingsRow}
              >
                <Text style={[styles.settingsRowLabel, { color: Colors.primary }]}>
                  {t('profile.subscription_manage')}
                </Text>
                <Text style={[styles.chevron, { color: Colors.primary }]}>›</Text>
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
                    <Text style={styles.premiumBadgeText}>{t('common.premium')}</Text>
                  </View>
                  <Text style={[styles.premiumTeaserTitle, { color: textPrimary }]}>
                    {t('premium_teaser.ai_title')}
                  </Text>
                  <Text style={[styles.premiumTeaserBody, { color: textSecondary }]}>
                    {monthlyPrice && trialDays
                      ? t('premium_teaser.profile_body_with_price', { price: monthlyPrice, days: trialDays })
                      : t('premium_teaser.profile_body')}
                  </Text>
                </View>
                <Text style={[styles.premiumTeaserArrow, { color: Colors.primary }]}>→</Text>
              </View>
            </TouchableOpacity>
          )
        )}

        {/* ── Notifications & Medications ─────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: textSecondary }]}>{t('profile.notifications')}</Text>
        <View style={[styles.settingsCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {/* Daily check-in */}
          <View style={styles.settingsRow}>
            <Text style={[styles.settingsRowLabel, { color: textPrimary }]}>
              {t('profile.daily_reminder')}
            </Text>
            <Switch
              value={reminderEnabled}
              onValueChange={handleToggleReminder}
              trackColor={{ true: Colors.primary, false: cardBorder }}
              thumbColor="#FFFFFF"
            />
          </View>

          {reminderEnabled && !showTimePicker && (
            <>
              <View style={[styles.rowDivider, { backgroundColor: cardBorder }]} />
              <TouchableOpacity
                onPress={handleUpdateTime}
                activeOpacity={0.7}
                style={styles.settingsRow}
              >
                <Text style={[styles.settingsRowLabel, { color: textPrimary }]}>{t('medications.reminder_time')}</Text>
                <Text style={[styles.settingsRowValue, { color: Colors.primary }]}>
                  {profile?.notification_time ?? '20:00'} ›
                </Text>
              </TouchableOpacity>
            </>
          )}

          {reminderEnabled && showTimePicker && (
            <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm }}>
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
                  <Text style={{ color: textSecondary, fontWeight: '500', fontFamily: FontFamily.medium }}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveTime}
                  style={styles.timePickerSave}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '600', fontFamily: FontFamily.semiBold }}>{t('common.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={[styles.rowDivider, { backgroundColor: cardBorder }]} />

          {/* Medication tracking */}
          <View style={styles.settingsRow}>
            <View style={styles.settingsRowLeft}>
              <Text style={[styles.settingsRowLabel, { color: textPrimary }]}>
                {t('profile.track_medication_adherence')}
              </Text>
              <Text style={[styles.settingsRowSub, { color: textSecondary }]}>
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

          {/* Medications list */}
          {medsLoading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.md }} />
          ) : (
            medications.map((med) => (
              <React.Fragment key={med.id}>
                <View style={[styles.rowDivider, { backgroundColor: cardBorder }]} />
                <TouchableOpacity
                  style={styles.medListRow}
                  onPress={() => { setEditingMed(med); setShowAddMed(true); }}
                  activeOpacity={0.7}
                >
                  <View style={styles.medInfo}>
                    <Text style={[styles.medName, { color: textPrimary }]}>{med.name}</Text>
                    <View style={styles.medMeta}>
                      {med.dose ? <Text style={[styles.medDose, { color: textSecondary }]}>{med.dose}</Text> : null}
                      {med.as_needed ? (
                        <View style={[styles.freqBadge, { backgroundColor: Colors.warning + '20' }]}>
                          <Text style={[styles.freqBadgeText, { color: Colors.warning }]}>{t('medications.as_needed')}</Text>
                        </View>
                      ) : (
                        <>
                          <View style={styles.freqBadge}>
                            <Text style={styles.freqBadgeText}>{freqLabel(med.frequency)}</Text>
                          </View>
                          <Text style={[styles.medTime, { color: textSecondary }]}>{med.reminder_time}</Text>
                        </>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDeleteMed(med.id!, med.name)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.deleteIcon}>✕</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              </React.Fragment>
            ))
          )}

          {/* Add medication — only visible when tracking is on */}
          {tracksMedication && (
            <>
              <View style={[styles.rowDivider, { backgroundColor: cardBorder }]} />
              <TouchableOpacity
                onPress={() => { setEditingMed(null); setShowAddMed(true); }}
                activeOpacity={0.7}
                style={styles.settingsRow}
              >
                <Text style={[styles.settingsRowLabel, { color: Colors.primary }]}>+ {t('profile.add_medication')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Health data ──────────────────────────────────────────────────── */}
        {healthAvailable && (
          <>
            <Text style={[styles.sectionLabel, { color: textSecondary }]}>{t('profile.health_data')}</Text>
            <View style={[styles.settingsCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <View style={[styles.settingsRow, { paddingRight: Spacing.md }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
                  <Text style={[styles.settingsRowLabel, { color: textPrimary }]}>
                    {Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'}
                  </Text>
                  <InfoButton
                    title="Apple Health"
                    message={`Connecting Apple Health lets Spondy read data from your iPhone and Apple Watch, giving you a more complete picture of how your body is doing:\n\n• Steps and active energy (how much you moved)\n• Sleep duration (how rest affects your symptoms)\n• Heart rate variability (a useful recovery indicator)\n• Blood oxygen and respiratory rate (overnight recovery signals)\n• Mindful minutes (meditation and breathing sessions)\n\nAll data stays on your device and in your private account. Nothing is shared with third parties.`}
                    color={textSecondary}
                  />
                </View>
                {healthLoading ? (
                  <ActivityIndicator color={Colors.primary} size="small" />
                ) : (
                  <Switch
                    value={healthConnected}
                    onValueChange={(value) => value ? connectHealth() : disconnectHealthData()}
                    trackColor={{ true: Colors.primary, false: cardBorder }}
                    thumbColor="#FFFFFF"
                  />
                )}
              </View>
            </View>
          </>
        )}

        {/* ── Treatment ───────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: textSecondary }]}>{t('profile_alerts.treatment_section')}</Text>

        {/* Biologic injections card */}
        {profile?.medications && profile.medications.some(m => BIOLOGIC_MEDS.includes(m)) && (
          <View style={[styles.settingsCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => {
                const firstBiologic = profile.medications.find(m => BIOLOGIC_MEDS.includes(m)) ?? '';
                setInjectionDefaultMed(MEDICATION_LABELS[firstBiologic] ?? firstBiologic);
                setShowLogInjection(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.settingsRowLabel, { color: textPrimary }]}>{t('profile_alerts.biologic_injections')}</Text>
              <Text style={[styles.settingsRowValue, { color: Colors.primary }]}>+ Log ›</Text>
            </TouchableOpacity>

            {profile.medications.filter(m => BIOLOGIC_MEDS.includes(m)).map((med, idx) => {
              const lastInj = biologicInjections.find(i =>
                i.medication_name.toLowerCase().includes(med.toLowerCase()) ||
                (MEDICATION_LABELS[med] ?? '').toLowerCase().includes(i.medication_name.toLowerCase())
              );
              const due = lastInj ? (() => {
                const d = new Date(lastInj.injected_at + 'T12:00:00');
                d.setDate(d.getDate() + lastInj.interval_days);
                return d;
              })() : null;
              const daysUntil = due ? Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
              const dueColor = daysUntil == null ? textSecondary : daysUntil <= 0 ? Colors.error : daysUntil <= 2 ? Colors.warning : Colors.success;
              return (
                <React.Fragment key={med}>
                  <View style={[styles.rowDivider, { backgroundColor: cardBorder }]} />
                  <View style={[styles.settingsRow, { minHeight: 48 }]}>
                    <View style={styles.settingsRowLeft}>
                      <Text style={[styles.settingsRowLabel, { color: textPrimary }]}>{MEDICATION_LABELS[med] ?? med}</Text>
                      {lastInj && (
                        <Text style={[styles.settingsRowSub, { color: textSecondary }]}>{t('profile_alerts.injection_last', { date: lastInj.injected_at })}</Text>
                      )}
                    </View>
                    <Text style={[styles.settingsRowValue, { color: dueColor }]}>
                      {daysUntil == null ? t('profile_alerts.injection_none_logged') : daysUntil <= 0 ? t('profile_alerts.injection_due_today') : daysUntil === 1 ? t('profile_alerts.injection_due_tomorrow') : t('profile_alerts.injection_due_in', { days: daysUntil })}
                    </Text>
                  </View>
                </React.Fragment>
              );
            })}

            {biologicInjections.length > 0 && (
              <>
                <View style={[styles.rowDivider, { backgroundColor: cardBorder }]} />
                <Text style={[styles.settingsRowSub, { color: textSecondary, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm }]}>
                  Recent injections
                </Text>
                {biologicInjections.slice(0, 3).map((inj) => (
                  <React.Fragment key={inj.id}>
                    <View style={[styles.rowDivider, { backgroundColor: cardBorder }]} />
                    <View style={styles.medListRow}>
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
                  </React.Fragment>
                ))}
              </>
            )}
          </View>
        )}

        {/* Share with doctor card */}
        <View style={[styles.settingsCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={[styles.settingsRow, { paddingRight: Spacing.md }]}>
            <Text style={[styles.settingsRowLabel, { color: textPrimary }]}>
              {t('profile.share_report_title')}
            </Text>
            <InfoButton
              title={t('profile_alerts.report_info_title')}
              message={t('profile_alerts.report_info_message')}
              color={textSecondary}
            />
          </View>
          <View style={[styles.rowDivider, { backgroundColor: cardBorder }]} />
          {!showReportDatePicker ? (
            <TouchableOpacity
              onPress={() => {
                setPendingReportDate(reportFromDate);
                setShowReportDatePicker(true);
              }}
              activeOpacity={0.7}
              style={styles.settingsRow}
            >
              <Text style={[styles.settingsRowSub, { color: textSecondary }]}>{t('profile_alerts.from_last_appointment')}</Text>
              <Text style={[styles.reportDateValue, { color: reportFromDate ? textPrimary : Colors.primary }]}>
                {reportFromDate
                  ? new Date(reportFromDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  : t('profile_alerts.last_12_months')} ›
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm }}>
              <DateTimePicker
                value={pendingReportDate ? new Date(pendingReportDate + 'T12:00:00') : new Date()}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={(_event, date) => {
                  if (date) {
                    const y = date.getFullYear();
                    const m = String(date.getMonth() + 1).padStart(2, '0');
                    const d = String(date.getDate()).padStart(2, '0');
                    setPendingReportDate(`${y}-${m}-${d}`);
                  }
                }}
                textColor={isDark ? Colors.textPrimaryDark : Colors.textPrimary}
                style={{ width: '100%', height: 150 }}
              />
              <View style={styles.timePickerActions}>
                <TouchableOpacity
                  onPress={() => setShowReportDatePicker(false)}
                  style={[styles.timePickerCancel, { borderColor: cardBorder }]}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: textSecondary, fontWeight: '500', fontFamily: FontFamily.medium }}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setReportFromDate(pendingReportDate); setShowReportDatePicker(false); }}
                  style={styles.timePickerSave}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '600', fontFamily: FontFamily.semiBold }}>{t('common.set')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          <View style={[styles.rowDivider, { backgroundColor: cardBorder }]} />
          <TouchableOpacity
            onPress={handleGenerateReport}
            disabled={isGeneratingReport}
            activeOpacity={0.8}
            style={[styles.settingsRow, { opacity: isGeneratingReport ? 0.6 : 1 }]}
          >
            {isGeneratingReport ? (
              <View style={styles.reportBtnRow}>
                <ActivityIndicator color={Colors.primary} size="small" />
                <Text style={[styles.settingsRowLabel, { color: Colors.primary }]}>
                  {t('profile.share_report_generating')}
                </Text>
              </View>
            ) : (
              <>
                <Text style={[styles.settingsRowLabel, { color: Colors.primary }]}>
                  {t('profile.share_report_cta')}
                </Text>
                <Text style={[styles.chevron, { color: Colors.primary }]}>›</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Account ─────────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: textSecondary }]}>{t('profile.account')}</Text>
        <View style={[styles.settingsCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {/* Feedback */}
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => setShowFeedback(true)}
            activeOpacity={0.7}
          >
            <View style={styles.settingsRowLeft}>
              <Text style={[styles.settingsRowLabel, { color: textPrimary }]}>{t('profile_alerts.share_feedback_title')}</Text>
              <Text style={[styles.settingsRowSub, { color: textSecondary }]}>
                Bugs, ideas, or anything on your mind
              </Text>
            </View>
            <Text style={[styles.chevron, { color: textSecondary }]}>›</Text>
          </TouchableOpacity>

          <View style={[styles.rowDivider, { backgroundColor: cardBorder }]} />

          {/* Email */}
          <TouchableOpacity style={styles.settingsRow} onPress={handleChangeEmail} activeOpacity={0.7}>
            <View style={styles.settingsRowLeft}>
              <Text style={[styles.settingsRowLabel, { color: textPrimary }]}>{t('common.email')}</Text>
              <Text style={[styles.settingsRowSub, { color: textSecondary }]} numberOfLines={1}>
                {user?.email}
              </Text>
            </View>
            <Text style={[styles.settingsRowValue, { color: Colors.primary }]}>{t('common.change')}</Text>
          </TouchableOpacity>

          {/* Password */}
          {isEmailAuth && (
            <>
              <View style={[styles.rowDivider, { backgroundColor: cardBorder }]} />
              <TouchableOpacity style={styles.settingsRow} onPress={handleChangePassword} activeOpacity={0.7}>
                <View style={styles.settingsRowLeft}>
                  <Text style={[styles.settingsRowLabel, { color: textPrimary }]}>{t('common.password')}</Text>
                  <Text style={[styles.settingsRowSub, { color: textSecondary }]}>••••••••</Text>
                </View>
                <Text style={[styles.settingsRowValue, { color: Colors.primary }]}>{t('common.change')}</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={[styles.rowDivider, { backgroundColor: cardBorder }]} />

          {/* Sign out */}
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={handleSignOut}
            activeOpacity={0.7}
            disabled={isSigningOut}
          >
            {isSigningOut ? (
              <ActivityIndicator color={Colors.error} size="small" />
            ) : (
              <Text style={[styles.settingsRowLabel, { color: Colors.error }]}>
                {t('auth.sign_out')}
              </Text>
            )}
          </TouchableOpacity>

          <View style={[styles.rowDivider, { backgroundColor: cardBorder }]} />

          {/* Delete account */}
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={handleDeleteAccount}
            activeOpacity={0.7}
            disabled={isDeletingAccount}
          >
            {isDeletingAccount ? (
              <ActivityIndicator color={Colors.error} size="small" />
            ) : (
              <Text style={[styles.settingsRowLabel, { color: Colors.error, opacity: 0.7 }]}>
                {t('profile_alerts.delete_data_button')}
              </Text>
            )}
          </TouchableOpacity>
          <Text style={[styles.deleteDataNote, { color: textSecondary, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm }]}>
            Permanently deletes all logs, flares, medications, and profile data.
          </Text>
        </View>

        {/* ── Data & AI Privacy ───────────────────────────────────────────── */}
        <View style={[styles.settingsCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={[styles.settingsRow, { paddingRight: Spacing.md }]}>
            <View style={styles.settingsRowLeft}>
              <Text style={[styles.settingsRowLabel, { color: textPrimary }]}>
                {t('profile_privacy.ai_consent_toggle_label')}
              </Text>
              <Text style={[styles.settingsRowSub, { color: textSecondary }]}>
                {t('profile_privacy.ai_consent_toggle_subtitle')}
              </Text>
            </View>
            <Switch
              value={aiConsented}
              onValueChange={handleToggleAiConsent}
              trackColor={{ true: Colors.primary, false: isDark ? Colors.borderDark : Colors.border }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Text style={[styles.aiPrivacyBody, { color: textSecondary, paddingHorizontal: Spacing.md, paddingBottom: Spacing.xs }]}>
            {t('profile_privacy.ai_body_1')}
          </Text>
          <Text style={[styles.aiPrivacyBody, { color: textSecondary, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md }]}>
            {t('profile_privacy.ai_body_2')}
          </Text>
        </View>

        {/* ── Medical Sources & Disclaimer ────────────────────────────────── */}
        <View style={[styles.settingsCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.settingsRow}>
            <Text style={[styles.settingsRowLabel, { color: textPrimary }]}>
              {t('profile_privacy.sources_title')}
            </Text>
          </View>
          <Text style={[styles.aiPrivacyBody, { color: textSecondary, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm }]}>
            {t('profile_privacy.sources_disclaimer')}
          </Text>
          <View style={[styles.rowDivider, { backgroundColor: cardBorder }]} />
          <TouchableOpacity
            onPress={() => Linking.openURL('https://nass.co.uk')}
            activeOpacity={0.7}
            style={styles.settingsRow}
          >
            <Text style={[styles.settingsRowLabel, { color: Colors.primary }]}>
              {t('profile_privacy.sources_nass')}
            </Text>
            <Text style={[styles.chevron, { color: Colors.primary }]}>›</Text>
          </TouchableOpacity>
          <View style={[styles.rowDivider, { backgroundColor: cardBorder }]} />
          <TouchableOpacity
            onPress={() => Linking.openURL('https://spondylitis.org')}
            activeOpacity={0.7}
            style={styles.settingsRow}
          >
            <Text style={[styles.settingsRowLabel, { color: Colors.primary }]}>
              {t('profile_privacy.sources_saa')}
            </Text>
            <Text style={[styles.chevron, { color: Colors.primary }]}>›</Text>
          </TouchableOpacity>
          <View style={[styles.rowDivider, { backgroundColor: cardBorder }]} />
          <TouchableOpacity
            onPress={() => Linking.openURL('https://www.basdai.com')}
            activeOpacity={0.7}
            style={styles.settingsRow}
          >
            <Text style={[styles.settingsRowLabel, { color: Colors.primary }]}>
              {t('profile_privacy.sources_basdai')}
            </Text>
            <Text style={[styles.chevron, { color: Colors.primary }]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Privacy policy + version */}
        <TouchableOpacity
          onPress={() => Linking.openURL('https://gist.github.com/joekalise/fb689414dba7ade9f6d7383ccad9cf1f')}
          activeOpacity={0.7}
          style={styles.privacyLink}
        >
          <Text style={[styles.privacyLinkText, { color: textSecondary }]}>{t('profile_alerts.privacy_policy')}</Text>
        </TouchableOpacity>
        <Text style={[styles.version, { color: textSecondary }]}>
          {t('profile.version', { version })}
        </Text>
      </ScrollView>
      </KeyboardAvoidingView>

      <AddMedicationModal
        visible={showAddMed}
        onClose={() => { setShowAddMed(false); setEditingMed(null); }}
        onSave={addMedication}
        onUpdate={updateMedication}
        onOpenEditProfile={() => setShowEditProfile(true)}
        editingMed={editingMed}
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
        trialDays={trialDays}
        isPurchasing={isPurchasing}
        isRestoring={isRestoring}
        isDark={isDark}
      />

      {/* Feedback modal */}
      <Modal visible={showFeedback} animationType="slide" transparent onRequestClose={() => setShowFeedback(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContainer, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <Text style={[styles.modalTitle, { color: textPrimary }]}>{t('profile_alerts.share_feedback_title')}</Text>
              <Text style={[styles.fieldLabel, { color: textSecondary }]}>{t('profile_alerts.feedback_prompt')}</Text>
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
                  <Text style={[styles.modalCancelText, { color: textSecondary }]}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSendFeedback}
                  style={[styles.modalSaveBtn, { opacity: feedbackText.trim() ? 1 : 0.4 }]}
                  disabled={!feedbackText.trim()}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalSaveText}>{t('common.send')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },

  // Settings-style layout
  profileHeader: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  settingsCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    minHeight: 52,
  },
  settingsRowLeft: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  settingsRowLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    fontFamily: FontFamily.semiBold,
    fontFamily: FontFamily.semiBold,
  },
  settingsRowSub: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  settingsRowValue: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    fontFamily: FontFamily.semiBold,
    fontFamily: FontFamily.semiBold,
  },
  chevron: {
    fontSize: 20,
    fontWeight: '300',
    fontFamily: FontFamily.regular,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
  },
  medListRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    fontFamily: FontFamily.bold,
    fontFamily: FontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  aiContextExpanded: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },

  // Section header (legacy — kept for SectionHeader component)
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
    fontFamily: FontFamily.bold,
    fontFamily: FontFamily.bold,
    color: Colors.textSecondary,
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
    fontFamily: FontFamily.bold,
    fontFamily: FontFamily.bold,
    color: '#FFFFFF',
  },
  nameDisplay: {
    fontSize: FontSize.md,
    fontWeight: '700',
    fontFamily: FontFamily.bold,
    fontFamily: FontFamily.bold,
  },
  nameInput: {
    fontSize: FontSize.md,
    fontWeight: '700',
    fontFamily: FontFamily.bold,
    fontFamily: FontFamily.bold,
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
  medInfo: {
    flex: 1,
  },
  medName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    fontFamily: FontFamily.bold,
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.semiBold,
    fontFamily: FontFamily.semiBold,
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
    fontFamily: FontFamily.bold,
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.semiBold,
    fontFamily: FontFamily.semiBold,
  },
  deleteDataNote: {
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
    lineHeight: 16,
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
  aiPrivacyBody: {
    fontSize: FontSize.xs,
    lineHeight: 18,
  },
  version: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  privacyLink: {
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    marginTop: Spacing.sm,
  },
  privacyLinkText: {
    fontSize: FontSize.xs,
    textDecorationLine: 'underline',
  },
  reportBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  reportDateValue: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    fontFamily: FontFamily.semiBold,
    fontFamily: FontFamily.semiBold,
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
    fontFamily: FontFamily.bold,
    fontFamily: FontFamily.bold,
  },
  premiumTeaserBody: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  premiumTeaserArrow: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: FontFamily.semiBold,
    fontFamily: FontFamily.semiBold,
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
    fontFamily: FontFamily.bold,
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.extraBold,
    fontFamily: FontFamily.extraBold,
    marginBottom: Spacing.md,
  },
  fieldLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    fontFamily: FontFamily.semiBold,
    fontFamily: FontFamily.semiBold,
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
    fontFamily: FontFamily.semiBold,
    fontFamily: FontFamily.semiBold,
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
    fontFamily: FontFamily.semiBold,
    fontFamily: FontFamily.semiBold,
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
    fontFamily: FontFamily.bold,
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.bold,
    fontFamily: FontFamily.bold,
  },
  editModalClose: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    fontFamily: FontFamily.semiBold,
    fontFamily: FontFamily.semiBold,
  },
  editModalContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  editFieldLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    fontFamily: FontFamily.semiBold,
    fontFamily: FontFamily.semiBold,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
});
