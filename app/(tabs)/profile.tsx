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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';

import { Button } from '@/components/common/Button';
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
import { generateAndShareReport } from '@/services/pdfExport';
import { getDailyLogs, getUveitisEpisodes, getBasdaiScores, deleteAllUserData } from '@/services/database';
import {
  MedicationReminder,
  BiologicInjection,
  AgeRange,
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
  profile: { age_range: AgeRange | null; diagnosis_years: DiagnosisYears | null; severity: Severity | null; medications: Medication[]; pain_locations: PainLocation[]; pain_types: PainType[]; conditions: AssociatedCondition[]; morning_stiffness: MorningStiffness | null; challenges: LifestyleChallenge[] } | null;
  onSave: (updates: {
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

function ProfileEditModal({ visible, onClose, profile, onSave, isDark }: ProfileEditModalProps) {
  const bg = isDark ? Colors.backgroundDark : Colors.background;
  const cardBorder = isDark ? Colors.borderDark : Colors.border;
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;

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

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
        <View style={[styles.editModalHeader, { borderBottomColor: cardBorder }]}>
          <Text style={[styles.editModalTitle, { color: textPrimary }]}>Edit profile</Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.8}>
            <Text style={[styles.editModalClose, { color: textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.editModalContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.editSectionTitle, { color: textSecondary }]}>About you</Text>
            <ChipGroup
              label="Age range"
              options={['under_25', '25_35', '35_45', '45_55', '55_plus']}
              labelMap={AGE_RANGE_LABELS}
              selected={ageRange}
              onToggle={(v) => setAgeRange(v as AgeRange)}
              isDark={isDark}
            />
            <ChipGroup
              label="Years with AS"
              options={['under_1', '1_3', '3_5', '5_10', '10_plus']}
              labelMap={DIAGNOSIS_YEARS_LABELS}
              selected={diagnosisYears}
              onToggle={(v) => setDiagnosisYears(v as DiagnosisYears)}
              isDark={isDark}
            />
            <ChipGroup
              label="Disease activity"
              options={['mild', 'moderate', 'severe']}
              labelMap={SEVERITY_LABELS}
              selected={severity}
              onToggle={(v) => setSeverity(v as Severity)}
              isDark={isDark}
            />
            <ChipGroup
              label="Morning stiffness"
              options={['under_30', '30_60', '1_2_hours', 'over_2_hours']}
              labelMap={MORNING_STIFFNESS_LABELS}
              selected={morningStiffness}
              onToggle={(v) => setMorningStiffness(v as MorningStiffness)}
              isDark={isDark}
            />

            <Text style={[styles.editSectionTitle, { color: textSecondary }]}>Symptoms</Text>
            <ChipGroup
              label="Pain locations"
              options={['lower_back', 'upper_back', 'hips', 'knees', 'shoulders', 'neck', 'chest', 'jaw']}
              labelMap={PAIN_LOCATION_LABELS}
              selected={painLocations}
              onToggle={(v) => setPainLocations((arr) => toggle(arr, v as PainLocation))}
              isDark={isDark}
            />
            <ChipGroup
              label="Types of pain"
              options={['stiffness', 'sharp_pain', 'burning', 'aching', 'fatigue']}
              labelMap={PAIN_TYPE_LABELS}
              selected={painTypes}
              onToggle={(v) => setPainTypes((arr) => toggle(arr, v as PainType))}
              isDark={isDark}
            />

            <Text style={[styles.editSectionTitle, { color: textSecondary }]}>Other</Text>
            <ChipGroup
              label="Associated conditions"
              options={['uveitis', 'psoriasis', 'ibd', 'enthesitis', 'peripheral_joint', 'fatigue', 'brain_fog', 'anxiety_depression']}
              labelMap={CONDITION_LABELS}
              selected={conditions}
              onToggle={(v) => setConditions((arr) => toggle(arr, v as AssociatedCondition))}
              isDark={isDark}
            />
            <ChipGroup
              label="Life challenges"
              options={['sleep', 'exercise', 'work', 'social_life', 'mental_health']}
              labelMap={CHALLENGE_LABELS}
              selected={challenges}
              onToggle={(v) => setChallenges((arr) => toggle(arr, v as LifestyleChallenge))}
              isDark={isDark}
            />

            <Text style={[styles.editSectionTitle, { color: textSecondary }]}>Treatment</Text>
            <ChipGroup
              label="Current treatment"
              options={['adalimumab', 'secukinumab', 'ixekizumab', 'ustekinumab', 'nsaids_only', 'no_medication', 'other']}
              labelMap={MEDICATION_LABELS}
              selected={medications}
              onToggle={(v) => setMedications((arr) => toggle(arr, v as Medication))}
              isDark={isDark}
            />

            <TouchableOpacity
              onPress={handleSave}
              disabled={isSaving}
              activeOpacity={0.8}
              style={[styles.modalSaveBtn, { marginTop: Spacing.lg, opacity: isSaving ? 0.6 : 1 }]}
            >
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.modalSaveText}>Save changes</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
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
          <TextInput
            style={[
              styles.textInput,
              { backgroundColor: inputBg, borderColor: cardBorder, color: textPrimary },
            ]}
            placeholder={t('medications.reminder_placeholder')}
            placeholderTextColor={textSecondary}
            value={reminderTime}
            onChangeText={setReminderTime}
            keyboardType="numbers-and-punctuation"
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
  const { isSubscribed, isLoading: subLoading, purchase, restore } = useSubscription();
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
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showLogInjection, setShowLogInjection] = useState(false);
  const [injectionDefaultMed, setInjectionDefaultMed] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [welcomeInsights, setWelcomeInsights] = useState<string[]>([]);
  const [watchSummary, setWatchSummary] = useState('');

  useEffect(() => {
    if (!user) return;
    AsyncStorage.getItem(`@spondy_welcome_${user.id}`)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        setWelcomeInsights(parsed.insights ?? []);
        setWatchSummary(parsed.watch_summary ?? '');
      })
      .catch(() => {});
  }, [user]);

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
    Alert.prompt(
      t('profile.update_time'),
      'Use 24-hour format (e.g. 20:00)',
      async (value) => {
        if (!value) return;
        try {
          await saveProfile({ notification_time: value });
          if (reminderEnabled) {
            await scheduleDailyCheckIn(value);
          }
        } catch (err) {
          console.error('Update notification time error:', err);
          Alert.alert('Error', t('errors.save_failed'));
        }
      },
      'plain-text',
      profile?.notification_time ?? '20:00'
    );
  }, [profile?.notification_time, reminderEnabled, saveProfile, t]);

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
    try {
      const success = await purchase();
      if (!success) {
        Alert.alert('', t('profile.purchase_unavailable'));
      }
    } catch (err) {
      console.error('Purchase error:', err);
      Alert.alert('', t('errors.save_failed'));
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

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: bg }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Text style={[styles.title, { color: textPrimary }]}>
          {t('profile.title')}
        </Text>

        {/* ── MY PROFILE ──────────────────────────────────────────────────── */}
        <SectionHeader label="My profile" isDark={isDark} firstSection />

        {/* User avatar + email */}
        <View style={[styles.avatarCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.email?.charAt(0).toUpperCase() ?? 'U'}
            </Text>
          </View>
          <Text style={[styles.emailText, { color: textSecondary }]}>
            {user?.email ?? ''}
          </Text>
        </View>

        {/* ── Your Spondy Profile (AI welcome content) ─────────────────────── */}
        {(profile?.welcome_message || welcomeInsights.length > 0) && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.cardTitle, { color: textPrimary, marginBottom: Spacing.xs }]}>
              Your Spondy profile
            </Text>
            {profile?.welcome_message ? (
              <Text style={[styles.profileWelcomeText, { color: textPrimary }]}>
                {profile.welcome_message}
              </Text>
            ) : null}
            {welcomeInsights.length > 0 && welcomeInsights.map((insight, idx) => (
              <View key={idx} style={styles.profileInsightRow}>
                <Text style={[styles.profileInsightBullet, { color: textSecondary }]}>·</Text>
                <Text style={[styles.profileInsightText, { color: textSecondary }]}>{insight}</Text>
              </View>
            ))}
          </View>
        )}

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

        {/* ── Profile summary — 2-column chip grid ───────────────────────── */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: textPrimary }]}>
              {t('profile.summary')}
            </Text>
            <TouchableOpacity
              onPress={() => setShowEditProfile(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.editLink}>{t('profile.edit')}</Text>
            </TouchableOpacity>
          </View>

          {/* 2-column chip/tag grid */}
          <View style={styles.summaryChipGrid}>
            <SummaryChip
              label={t('profile.age_range')}
              value={profile?.age_range ? (AGE_RANGE_LABELS[profile.age_range] ?? '—') : '—'}
              isDark={isDark}
            />
            <SummaryChip
              label={t('profile.years_diagnosed')}
              value={profile?.diagnosis_years ? (DIAGNOSIS_YEARS_LABELS[profile.diagnosis_years] ?? '—') : '—'}
              isDark={isDark}
            />
            <SummaryChip
              label={t('profile.disease_activity')}
              value={profile?.severity ? (SEVERITY_LABELS[profile.severity] ?? '—') : '—'}
              isDark={isDark}
            />
            <SummaryChip
              label="Morning stiffness"
              value={profile?.morning_stiffness ? (MORNING_STIFFNESS_LABELS[profile.morning_stiffness] ?? '—') : '—'}
              isDark={isDark}
            />
            <SummaryChip
              label="Pain locations"
              value={formatList(profile?.pain_locations ?? [], PAIN_LOCATION_LABELS)}
              isDark={isDark}
              wide
            />
            <SummaryChip
              label="Types of pain"
              value={formatList(profile?.pain_types ?? [], PAIN_TYPE_LABELS)}
              isDark={isDark}
              wide
            />
            <SummaryChip
              label="Conditions"
              value={formatList(profile?.conditions ?? [], CONDITION_LABELS)}
              isDark={isDark}
              wide
            />
            <SummaryChip
              label="Life challenges"
              value={formatList(profile?.challenges ?? [], CHALLENGE_LABELS)}
              isDark={isDark}
              wide
            />
          </View>
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
            <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <View style={styles.subHeader}>
                <Text style={[styles.cardTitle, { color: textPrimary }]}>
                  {t('profile.subscription_card_title')}
                </Text>
                <View style={styles.premiumBadge}>
                  <Text style={styles.premiumBadgeText}>Premium</Text>
                </View>
              </View>
              <Text style={[styles.subPrice, { color: textSecondary }]}>
                {t('profile.subscription_card_price')}
              </Text>

              {/* Feature list */}
              {[1, 2, 3, 4].map((n) => (
                <View key={n} style={styles.featureRow}>
                  <Text style={{ color: Colors.primary, fontSize: FontSize.md }}>✓</Text>
                  <Text style={[styles.featureText, { color: textPrimary }]}>
                    {t(`profile.subscription_feature_${n}` as Parameters<typeof t>[0])}
                  </Text>
                </View>
              ))}

              <TouchableOpacity
                onPress={handlePurchase}
                disabled={isPurchasing}
                activeOpacity={0.8}
                style={[styles.purchaseBtn, { opacity: isPurchasing ? 0.6 : 1 }]}
              >
                {isPurchasing ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.purchaseBtnText}>
                    {t('subscription.trial_cta')}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleRestore}
                disabled={isRestoring}
                activeOpacity={0.8}
                style={styles.restoreBtn}
              >
                {isRestoring ? (
                  <ActivityIndicator color={Colors.primary} size="small" />
                ) : (
                  <Text style={[styles.restoreBtnText, { color: Colors.primary }]}>
                    {t('profile.subscription_restore')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )
        )}

        {/* ── APP ───────────────────────────────────────────────────────────── */}
        <SectionHeader label="Notifications" isDark={isDark} />

        {/* ── Notifications card ─────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
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

          {reminderEnabled && (
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

        {/* ── Medications card ─────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.cardTitle, { color: textPrimary, marginBottom: Spacing.sm }]}>
            {t('profile.medications_card')}
          </Text>

          {profile?.medications && profile.medications.filter((m) => m !== 'no_medication').length > 0 ? (
            profile.medications.filter((m) => m !== 'no_medication').map((med) => (
              <View key={med} style={styles.medTreatmentRow}>
                <Text style={[styles.medTreatmentDot, { color: Colors.primary }]}>•</Text>
                <Text style={[styles.medTreatmentName, { color: textPrimary }]}>
                  {MEDICATION_LABELS[med] ?? capitalize(med)}
                </Text>
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: textSecondary, paddingVertical: Spacing.xs }]}>
              No medication selected
            </Text>
          )}
          <TouchableOpacity
            onPress={() => setShowEditProfile(true)}
            activeOpacity={0.8}
            style={{ marginTop: Spacing.xs, marginBottom: Spacing.md }}
          >
            <Text style={[styles.helperText, { color: Colors.primary, marginBottom: 0 }]}>
              Edit treatment in profile →
            </Text>
          </TouchableOpacity>

          {/* ── Reminders subsection ── */}
          <View style={[styles.medSectionDivider, { borderTopColor: cardBorder }]} />
          <View style={[styles.cardHeader, { marginTop: Spacing.md, marginBottom: Spacing.sm }]}>
            <Text style={[styles.medSectionLabel, { color: textSecondary, marginBottom: 0 }]}>Reminders</Text>
            <TouchableOpacity onPress={() => setShowAddMed(true)} activeOpacity={0.8}>
              <Text style={styles.editLink}>+ Add</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.notifRow, { marginBottom: Spacing.sm }]}>
            <View style={styles.notifInfo}>
              <Text style={[styles.notifLabel, { color: textPrimary }]}>
                {t('profile.track_medication_adherence')}
              </Text>
              <Text style={[styles.notifTime, { color: textSecondary }]}>
                {tracksMedication
                  ? t('profile.track_medication_on')
                  : t('profile.track_medication_off')}
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
          ) : medications.length === 0 ? (
            <Text style={[styles.emptyText, { color: textSecondary }]}>
              No reminders set up yet
            </Text>
          ) : (
            medications.map((med) => (
              <View
                key={med.id}
                style={[styles.medRow, { borderBottomColor: cardBorder }]}
              >
                <View style={styles.medInfo}>
                  <Text style={[styles.medName, { color: textPrimary }]}>
                    {med.name}
                  </Text>
                  <View style={styles.medMeta}>
                    {med.dose ? (
                      <Text style={[styles.medDose, { color: textSecondary }]}>
                        {med.dose}
                      </Text>
                    ) : null}
                    <View style={styles.freqBadge}>
                      <Text style={styles.freqBadgeText}>
                        {freqLabel(med.frequency)}
                      </Text>
                    </View>
                    <Text style={[styles.medTime, { color: textSecondary }]}>
                      {med.reminder_time}
                    </Text>
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
          <Text style={[styles.cardTitle, { color: textPrimary }]}>
            {t('profile.share_report_title')}
          </Text>
          <Text style={[styles.subtitleText, { color: textSecondary }]}>
            Includes all logs, flares, stiffness trends, medication adherence, and BASDAI scores.
          </Text>
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

        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
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
    </SafeAreaView>
  );
}

// ─── SummaryChip — 2-column tag for profile summary ──────────────────────────

function SummaryChip({
  label,
  value,
  isDark,
  wide = false,
}: {
  label: string;
  value: string;
  isDark: boolean;
  wide?: boolean;
}) {
  const bg = isDark ? '#2A2420' : Colors.background;
  const border = isDark ? Colors.borderDark : Colors.border;
  const textPri = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSec = isDark ? Colors.textSecondaryDark : Colors.textSecondary;

  return (
    <View
      style={[
        styles.summaryChip,
        { backgroundColor: bg, borderColor: border },
        wide && styles.summaryChipWide,
      ]}
    >
      <Text style={[styles.summaryChipLabel, { color: textPri }]}>{label}</Text>
      <Text style={[styles.summaryChipValue, { color: textSec }]} numberOfLines={wide ? 2 : 1}>
        {value}
      </Text>
    </View>
  );
}

// ─── SummaryRow — kept for backward compatibility (no longer used in main screen) ─

function SummaryRow({
  label,
  value,
  isDark,
}: {
  label: string;
  value: string;
  isDark: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, { color: isDark ? Colors.textSecondaryDark : Colors.textSecondary }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.summaryValue,
          { color: isDark ? Colors.textPrimaryDark : Colors.textPrimary, flexShrink: 1, textAlign: 'right', maxWidth: '65%' },
        ]}
      >
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

  // Summary chip grid — 2 columns
  summaryChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  summaryChip: {
    width: '48%',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    padding: Spacing.sm,
    gap: 2,
  },
  summaryChipWide: {
    width: '100%',
  },
  summaryChipLabel: {
    fontSize: FontSize.xs,
    fontWeight: '400',
  },
  summaryChipValue: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginTop: 1,
  },

  // Legacy summary row (unused but kept)
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  summaryLabel: {
    fontSize: FontSize.sm,
  },
  summaryValue: {
    fontSize: FontSize.sm,
    fontWeight: '600',
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
  version: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  // Welcome content card
  profileWelcomeText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.xs,
  },
  profileInsightRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    paddingVertical: 1,
  },
  profileInsightBullet: {
    fontSize: FontSize.md,
    lineHeight: 20,
  },
  profileInsightText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    flex: 1,
  },

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
  editSectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
});
