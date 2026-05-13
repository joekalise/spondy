import React, { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  Alert,
  Modal,
  Switch,
} from 'react-native';
import { DragSlider } from '@/components/common/DragSlider';
import { useTranslation } from 'react-i18next';
import { Colors } from '@/constants/colors';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useDailyLog } from '@/hooks/useDailyLog';
import { useHealthData } from '@/hooks/useHealthData';
import { useMedicationTracking } from '@/hooks/useMedicationTracking';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { getDailyLog, getDailyLogs, saveDailyLog as dbSaveLog } from '@/services/database';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { Button } from '@/components/common/Button';
import { ProfileButton } from '@/components/common/ProfileButton';
import { DailyLog, Mood, MorningStiffness, DietQuality, DietTrigger } from '@/types';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function localDateString(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateLabelShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function dateLabelFull(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function moodEmoji(mood: Mood | null): string {
  switch (mood) {
    case 'great': return '😊';
    case 'good': return '🙂';
    case 'okay': return '😐';
    case 'low': return '😔';
    case 'very_low': return '😞';
    default: return '—';
  }
}

function dietQualityEmoji(quality: DietQuality): string {
  switch (quality) {
    case 'clean': return '🥗';
    case 'mostly_clean': return '🥙';
    case 'mixed': return '🍽️';
    case 'poor': return '🍕';
  }
}

// DragSlider is imported from @/components/common/DragSlider

// ─── Stiffness / Medication option rows ──────────────────────────────────────

const STIFFNESS_OPTIONS: { value: MorningStiffness; labelKey: string }[] = [
  { value: 'none', labelKey: 'onboarding.morning_stiffness.none' },
  { value: 'under_30', labelKey: 'onboarding.morning_stiffness.under_30' },
  { value: '30_60', labelKey: 'onboarding.morning_stiffness.30_60' },
  { value: '1_2_hours', labelKey: 'onboarding.morning_stiffness.1_2_hours' },
  { value: 'over_2_hours', labelKey: 'onboarding.morning_stiffness.over_2_hours' },
];

interface OptionRowProps {
  options: { value: string; label: string }[];
  selected: string | null;
  onSelect: (v: string) => void;
  isDark: boolean;
  accentColor?: string;
}

function OptionRow({ options, selected, onSelect, isDark, accentColor = Colors.primary }: OptionRowProps) {
  return (
    <View style={styles.moodRow}>
      {options.map((opt) => {
        const isSelected = opt.value === selected;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onSelect(opt.value)}
            style={[
              styles.moodButton,
              isDark && styles.moodButtonDark,
              isSelected && { borderColor: accentColor, backgroundColor: accentColor + '22' },
            ]}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.optionLabel,
              isDark && styles.textSecDark,
              isSelected && { color: accentColor, fontWeight: '700' },
            ]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Mood Selector ────────────────────────────────────────────────────────────

const MOOD_OPTIONS: { value: Mood; emoji: string; labelKey: string; color: string }[] = [
  { value: 'great', emoji: '😊', labelKey: 'tracker.mood_great', color: Colors.moodGreat },
  { value: 'good', emoji: '🙂', labelKey: 'tracker.mood_good', color: Colors.moodGood },
  { value: 'okay', emoji: '😐', labelKey: 'tracker.mood_okay', color: Colors.moodOkay },
  { value: 'low', emoji: '😔', labelKey: 'tracker.mood_low', color: Colors.moodLow },
  { value: 'very_low', emoji: '😞', labelKey: 'tracker.mood_very_low', color: Colors.moodVeryLow },
];

// ─── Diet constants ───────────────────────────────────────────────────────────

const DIET_QUALITY_OPTIONS: { value: DietQuality; label: string; color: string }[] = [
  { value: 'clean', label: 'Clean', color: '#16A34A' },
  { value: 'mostly_clean', label: 'Mostly ok', color: '#65A30D' },
  { value: 'mixed', label: 'Mixed', color: '#D97706' },
  { value: 'poor', label: 'Poor', color: '#DC2626' },
];

const DIET_TRIGGER_OPTIONS: { value: DietTrigger; label: string }[] = [
  { value: 'high_starch', label: 'Starch/wheat' },
  { value: 'alcohol', label: 'Alcohol' },
  { value: 'processed', label: 'Processed food' },
  { value: 'high_sugar', label: 'High sugar' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'red_meat', label: 'Red meat' },
  { value: 'nightshades', label: 'Nightshades' },
];

const EXERCISE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'physio', label: 'Physio exercises' },
  { value: 'swimming', label: 'Swimming' },
  { value: 'walking', label: 'Walking' },
  { value: 'yoga', label: 'Yoga / stretching' },
  { value: 'cycling', label: 'Cycling' },
  { value: 'gym', label: 'Gym' },
  { value: 'other', label: 'Other' },
];

// ─── Log Summary ──────────────────────────────────────────────────────────────

function LogSummary({
  painScore,
  fatigueScore,
  mood,
  isDark,
  t,
}: {
  painScore: number;
  fatigueScore: number;
  mood: Mood | null;
  isDark: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const moodOption = MOOD_OPTIONS.find((m) => m.value === mood);
  return (
    <View style={styles.summaryRow}>
      <View style={[styles.summaryItem, isDark && styles.summaryItemDark]}>
        <Text style={[styles.summaryLabel, isDark && styles.textSecDark]}>{t('tracker.pain_score')}</Text>
        <Text style={[styles.summaryValue, isDark && styles.textPrimaryDark]}>{t('tracker.pain_score_value', { score: painScore })}</Text>
      </View>
      <View style={[styles.summaryItem, isDark && styles.summaryItemDark]}>
        <Text style={[styles.summaryLabel, isDark && styles.textSecDark]}>{t('tracker.fatigue_score')}</Text>
        <Text style={[styles.summaryValue, isDark && styles.textPrimaryDark]}>{t('tracker.pain_score_value', { score: fatigueScore })}</Text>
      </View>
      {moodOption && (
        <View style={[styles.summaryItem, isDark && styles.summaryItemDark]}>
          <Text style={[styles.summaryLabel, isDark && styles.textSecDark]}>{t('tracker.mood')}</Text>
          <Text style={[styles.summaryValue, { color: moodOption.color }]}>{moodOption.emoji} {t(moodOption.labelKey)}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Day Log Form (reused in both main screen and modal) ─────────────────────

interface DayLogFormProps {
  painScore: number;
  setPainScore: (n: number) => void;
  fatigueScore: number;
  setFatigueScore: (n: number) => void;
  stiffness: MorningStiffness | null;
  setStiffness: (v: MorningStiffness) => void;
  mood: Mood | null;
  setMood: (v: Mood) => void;
  medsTaken: 'yes' | 'no' | 'partial';
  setMedsTaken: (v: 'yes' | 'no' | 'partial') => void;
  notes: string;
  setNotes: (v: string) => void;
  dietQuality: DietQuality | null;
  setDietQuality: (v: DietQuality | null) => void;
  dietTriggers: DietTrigger[];
  setDietTriggers: (v: DietTrigger[]) => void;
  exerciseDone: boolean;
  setExerciseDone: (v: boolean) => void;
  exerciseType: string | null;
  setExerciseType: (v: string | null) => void;
  exerciseMinutes: number | null;
  setExerciseMinutes: (v: number | null) => void;
  tracksMedication: boolean;
  isFemale: boolean;
  periodActive: boolean;
  setPeriodActive: (v: boolean) => void;
  isDark: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
  isSaving: boolean;
  onSave: () => void;
}

function DayLogForm({
  painScore, setPainScore,
  fatigueScore, setFatigueScore,
  stiffness, setStiffness,
  mood, setMood,
  medsTaken, setMedsTaken,
  notes, setNotes,
  dietQuality, setDietQuality,
  dietTriggers, setDietTriggers,
  exerciseDone, setExerciseDone,
  exerciseType, setExerciseType,
  exerciseMinutes, setExerciseMinutes,
  tracksMedication,
  isFemale, periodActive, setPeriodActive,
  isDark, t, isSaving, onSave,
}: DayLogFormProps) {
  const stiffnessOptions = STIFFNESS_OPTIONS.map((opt) => ({ value: opt.value, label: t(opt.labelKey) }));
  const medOptions = [
    { value: 'yes', label: t('tracker.medications_yes') },
    { value: 'partial', label: t('tracker.medications_partial') },
    { value: 'no', label: t('tracker.medications_no') },
  ];

  return (
    <>
      {/* Symptoms card — pain + fatigue merged into ONE section */}
      <View style={[styles.section, isDark && styles.sectionDark]}>
        <Text style={[styles.sectionLabel, isDark && styles.textPrimaryDark]}>Symptoms today</Text>

        {/* Pain subsection */}
        <View style={styles.symptomSubSection}>
          <View style={styles.symptomSubHeader}>
            <Text style={[styles.symptomSubLabel, isDark && styles.textSecDark]}>{t('tracker.pain_score')}</Text>
          </View>
          <DragSlider value={painScore} onChange={setPainScore} isDark={isDark} />
          <Text style={[styles.hint, isDark && styles.textSecDark]}>{t('tracker.pain_score_hint')}</Text>
        </View>

        {/* Divider */}
        <View style={[styles.symptomDivider, isDark && styles.symptomDividerDark]} />

        {/* Fatigue subsection */}
        <View style={styles.symptomSubSection}>
          <View style={styles.symptomSubHeader}>
            <Text style={[styles.symptomSubLabel, isDark && styles.textSecDark]}>{t('tracker.fatigue_score')}</Text>
          </View>
          <DragSlider value={fatigueScore} onChange={setFatigueScore} isDark={isDark} />
          <Text style={[styles.hint, isDark && styles.textSecDark]}>{t('tracker.fatigue_score_hint')}</Text>
        </View>
      </View>

      <View style={[styles.section, isDark && styles.sectionDark]}>
        <Text style={[styles.sectionLabel, isDark && styles.textPrimaryDark]}>{t('tracker.stiffness_duration')}</Text>
        <OptionRow options={stiffnessOptions} selected={stiffness} onSelect={(v) => setStiffness(v as MorningStiffness)} isDark={isDark} />
      </View>

      <View style={[styles.section, isDark && styles.sectionDark]}>
        <Text style={[styles.sectionLabel, isDark && styles.textPrimaryDark]}>{t('tracker.mood')}</Text>
        <View style={styles.moodRow}>
          {MOOD_OPTIONS.map((opt) => {
            const selected = mood === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setMood(opt.value)}
                style={[
                  styles.moodButton,
                  isDark && styles.moodButtonDark,
                  selected && { borderColor: opt.color, backgroundColor: opt.color + '22' },
                ]}
                activeOpacity={0.7}
              >
                <Text style={styles.moodEmoji}>{opt.emoji}</Text>
                <Text style={[styles.moodLabel, isDark && styles.textSecDark, selected && { color: opt.color, fontWeight: '700' }]}>
                  {t(opt.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {tracksMedication && (
        <View style={[styles.section, isDark && styles.sectionDark]}>
          <Text style={[styles.sectionLabel, isDark && styles.textPrimaryDark]}>{t('tracker.medications_taken')}</Text>
          <OptionRow options={medOptions} selected={medsTaken} onSelect={(v) => setMedsTaken(v as 'yes' | 'no' | 'partial')} isDark={isDark} />
        </View>
      )}

      {isFemale && (
        <View style={[styles.section, isDark && styles.sectionDark]}>
          <View style={styles.periodRow}>
            <Text style={[styles.sectionLabel, isDark && styles.textPrimaryDark, { marginBottom: 0 }]}>{t('tracker.period_today')}</Text>
            <Switch
              value={periodActive}
              onValueChange={setPeriodActive}
              trackColor={{ true: Colors.primary, false: isDark ? Colors.borderDark : Colors.border }}
              thumbColor="#FFFFFF"
            />
          </View>
          {periodActive && (
            <Text style={[styles.hint, isDark && styles.textSecDark, { marginTop: 4 }]}>{t('tracker.period_active')}</Text>
          )}
        </View>
      )}

      {/* Nutrition */}
      <View style={[styles.section, isDark && styles.sectionDark]}>
        <Text style={[styles.sectionLabel, isDark && styles.textPrimaryDark]}>Nutrition today</Text>
        <View style={styles.dietQualityRow}>
          {DIET_QUALITY_OPTIONS.map((opt) => {
            const selected = dietQuality === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setDietQuality(selected ? null : opt.value)}
                activeOpacity={0.7}
                style={[
                  styles.dietQualityChip,
                  isDark && styles.chipDark,
                  selected && { backgroundColor: opt.color + '22', borderColor: opt.color },
                ]}
              >
                <Text style={[
                  styles.chipText,
                  isDark && !selected && styles.chipTextDark,
                  selected && { color: opt.color, fontWeight: '700' },
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[styles.sectionSubLabel, isDark && styles.textSecDark]}>Notable today</Text>
        <View style={styles.chipRow}>
          {DIET_TRIGGER_OPTIONS.map((opt) => {
            const selected = dietTriggers.includes(opt.value);
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setDietTriggers(
                  selected
                    ? dietTriggers.filter((t) => t !== opt.value)
                    : [...dietTriggers, opt.value]
                )}
                activeOpacity={0.7}
                style={[
                  styles.chip,
                  isDark && styles.chipDark,
                  selected && { backgroundColor: '#DC262620', borderColor: '#DC2626' },
                ]}
              >
                <Text style={[
                  styles.chipText,
                  isDark && !selected && styles.chipTextDark,
                  selected && { color: '#DC2626', fontWeight: '700' },
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[styles.hint, isDark && styles.textSecDark]}>
          Common inflammation triggers for AS, tracked for patterns
        </Text>
      </View>

      {/* Exercise */}
      <View style={[styles.section, isDark && styles.sectionDark]}>
        <View style={styles.exerciseHeaderRow}>
          <Text style={[styles.sectionLabel, isDark && styles.textPrimaryDark]}>Exercise today</Text>
          <Switch
            value={exerciseDone}
            onValueChange={setExerciseDone}
            trackColor={{ true: Colors.success, false: isDark ? Colors.borderDark : Colors.border }}
            thumbColor="#FFFFFF"
          />
        </View>
        {exerciseDone && (
          <>
            <View style={styles.chipRow}>
              {EXERCISE_TYPE_OPTIONS.map((opt) => {
                const selected = exerciseType === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setExerciseType(selected ? null : opt.value)}
                    activeOpacity={0.7}
                    style={[styles.chip, isDark && styles.chipDark, selected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, isDark && !selected && styles.chipTextDark, selected && styles.chipTextSelected]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.exerciseMinutesRow}>
              <Text style={[styles.sectionSubLabel, isDark && styles.textSecDark, { marginTop: 0 }]}>Duration (minutes)</Text>
              <View style={styles.minutesBtns}>
                {[15, 30, 45, 60, 90].map((m) => {
                  const sel = exerciseMinutes === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => setExerciseMinutes(sel ? null : m)}
                      style={[styles.minutesPill, { backgroundColor: sel ? Colors.success : 'transparent', borderColor: Colors.success + '60' }]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.minutesPillText, { color: sel ? '#FFF' : Colors.success }]}>{m}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </>
        )}
      </View>

      {/* Notes — last thing before save */}
      <View style={[styles.section, isDark && styles.sectionDark]}>
        <Text style={[styles.sectionLabel, isDark && styles.textPrimaryDark]}>{t('tracker.notes')}</Text>
        <TextInput
          style={[styles.notesInput, isDark && styles.notesInputDark]}
          placeholder={t('tracker.notes_placeholder')}
          placeholderTextColor={isDark ? Colors.textSecondaryDark : Colors.textSecondary}
          value={notes}
          onChangeText={(v) => setNotes(v.slice(0, 500))}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      <Button label={t('tracker.save')} onPress={onSave} isLoading={isSaving} style={styles.saveButton} />
    </>
  );
}

// ─── Day Log Modal ────────────────────────────────────────────────────────────

interface DayLogModalProps {
  date: string;
  initialLog: DailyLog | null;
  userId: string;
  tracksMedication: boolean;
  isFemale: boolean;
  isDark: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onSaved: (log: DailyLog) => void;
  onClose: () => void;
}

function DayLogModal({ date, initialLog, userId, tracksMedication, isFemale, isDark, t, onSaved, onClose }: DayLogModalProps) {
  const [painScore, setPainScore] = useState(initialLog?.pain_score ?? 0);
  const [fatigueScore, setFatigueScore] = useState(initialLog?.fatigue_score ?? 0);
  const [stiffness, setStiffness] = useState<MorningStiffness | null>(initialLog?.stiffness_duration ?? null);
  const [mood, setMood] = useState<Mood | null>(initialLog?.mood ?? null);
  const [medsTaken, setMedsTaken] = useState<'yes' | 'no' | 'partial'>(initialLog?.medications_taken ?? 'yes');
  const [notes, setNotes] = useState(initialLog?.notes ?? '');
  const [dietQuality, setDietQuality] = useState<DietQuality | null>(initialLog?.diet_quality ?? null);
  const [dietTriggers, setDietTriggers] = useState<DietTrigger[]>(initialLog?.diet_triggers ?? []);
  const [exerciseDone, setExerciseDone] = useState(initialLog?.exercise_done ?? false);
  const [exerciseType, setExerciseType] = useState<string | null>(initialLog?.exercise_type ?? null);
  const [exerciseMinutes, setExerciseMinutes] = useState<number | null>(initialLog?.exercise_minutes ?? null);
  const [periodActive, setPeriodActive] = useState(initialLog?.period_active ?? false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const saved = await dbSaveLog({
        user_id: userId,
        date,
        pain_score: painScore,
        fatigue_score: fatigueScore,
        stiffness_duration: stiffness,
        mood,
        medications_taken: medsTaken,
        notes,
        diet_quality: dietQuality,
        diet_triggers: dietTriggers,
        exercise_done: exerciseDone,
        exercise_type: exerciseType,
        exercise_minutes: exerciseMinutes,
        period_active: isFemale ? periodActive : null,
      });
      if (saved) onSaved(saved);
      onClose();
    } catch {
      Alert.alert(t('errors.save_failed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.modalScreen, isDark && styles.screenDark]}>
        <View style={[styles.modalHeader, isDark && styles.modalHeaderDark]}>
          <TouchableOpacity onPress={onClose} style={styles.modalCancel}>
            <Text style={[styles.modalCancelText, isDark && styles.textSecDark]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, isDark && styles.textPrimaryDark]}>
            {dateLabelFull(date)}
          </Text>
          <View style={styles.modalCancel} />
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingTop: Spacing.md }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <DayLogForm
            painScore={painScore} setPainScore={setPainScore}
            fatigueScore={fatigueScore} setFatigueScore={setFatigueScore}
            stiffness={stiffness} setStiffness={setStiffness}
            mood={mood} setMood={setMood}
            medsTaken={medsTaken} setMedsTaken={setMedsTaken}
            notes={notes} setNotes={setNotes}
            dietQuality={dietQuality} setDietQuality={setDietQuality}
            dietTriggers={dietTriggers} setDietTriggers={setDietTriggers}
            exerciseDone={exerciseDone} setExerciseDone={setExerciseDone}
            exerciseType={exerciseType} setExerciseType={setExerciseType}
            exerciseMinutes={exerciseMinutes} setExerciseMinutes={setExerciseMinutes}
            tracksMedication={tracksMedication}
            isFemale={isFemale} periodActive={periodActive} setPeriodActive={setPeriodActive}
            isDark={isDark} t={t}
            isSaving={isSaving} onSave={handleSave}
          />
          <View style={styles.bottomPad} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Date Picker Modal ────────────────────────────────────────────────────────

interface DatePickerModalProps {
  isDark: boolean;
  maxDate: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}

function DatePickerModal({ isDark, maxDate, onSelect, onClose }: DatePickerModalProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const maxD = new Date(maxDate + 'T12:00:00');

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    const next = new Date(year, month + 1, 1);
    if (next <= new Date(maxDate + 'T12:00:00')) {
      if (month === 11) { setYear(y => y + 1); setMonth(0); }
      else setMonth(m => m + 1);
    }
  };

  const cells: (number | null)[] = [
    ...Array(firstDay === 0 ? 6 : firstDay - 1).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const handleDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const d = new Date(dateStr + 'T12:00:00');
    if (d <= maxD) {
      onSelect(dateStr);
      onClose();
    }
  };

  const isFuture = (day: number) => {
    const d = new Date(year, month, day);
    return d > maxD;
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.modalScreen, isDark && styles.screenDark]}>
        <View style={[styles.modalHeader, isDark && styles.modalHeaderDark]}>
          <TouchableOpacity onPress={onClose} style={styles.modalCancel}>
            <Text style={[styles.modalCancelText, isDark && styles.textSecDark]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, isDark && styles.textPrimaryDark]}>Browse entries</Text>
          <View style={styles.modalCancel} />
        </View>

        <View style={styles.calendarContainer}>
          <View style={styles.calendarNav}>
            <TouchableOpacity onPress={prevMonth} style={styles.calNavBtn}>
              <Text style={[styles.calNavText, isDark && styles.textPrimaryDark]}>‹</Text>
            </TouchableOpacity>
            <Text style={[styles.calMonthLabel, isDark && styles.textPrimaryDark]}>{monthName}</Text>
            <TouchableOpacity onPress={nextMonth} style={styles.calNavBtn}>
              <Text style={[styles.calNavText, isDark && styles.textPrimaryDark]}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.calDayHeaders}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <Text key={i} style={[styles.calDayHeader, isDark && styles.textSecDark]}>{d}</Text>
            ))}
          </View>

          <View style={styles.calGrid}>
            {cells.map((day, i) => {
              if (day === null) return <View key={`empty-${i}`} style={styles.calCell} />;
              const disabled = isFuture(day);
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.calCell, styles.calDay, isDark && styles.calDayDark, disabled && styles.calDayDisabled]}
                  onPress={() => !disabled && handleDay(day)}
                  activeOpacity={disabled ? 1 : 0.7}
                >
                  <Text style={[styles.calDayText, isDark && !disabled && styles.textPrimaryDark, disabled && styles.calDayTextDisabled]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Recent Logs Card ─────────────────────────────────────────────────────────

interface RecentLogsCardProps {
  logs: DailyLog[];
  today: string;
  isDark: boolean;
  hasOlderLogs: boolean;
  onEdit: (date: string, log: DailyLog) => void;
  onBrowseOlder: () => void;
}

function RecentLogsCard({ logs, isDark, hasOlderLogs, onEdit, onBrowseOlder }: RecentLogsCardProps) {
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <View style={[styles.recentCard, isDark && styles.recentCardDark]}>
      <Text style={[styles.recentCardTitle, isDark && styles.textPrimaryDark]}>Recent check-ins</Text>

      {sorted.map((log) => (
        <TouchableOpacity
          key={log.date}
          style={[styles.recentRow, isDark && styles.recentRowDark]}
          onPress={() => onEdit(log.date, log)}
          activeOpacity={0.7}
        >
          <View style={styles.recentRowLeft}>
            <Text style={[styles.recentDate, isDark && styles.textPrimaryDark]}>{dateLabelShort(log.date)}</Text>
            <Text style={[styles.recentStats, isDark && styles.textSecDark]}>
              Pain {log.pain_score}/10 · Fatigue {log.fatigue_score}/10 · {moodEmoji(log.mood)}
              {log.diet_quality ? ` · ${dietQualityEmoji(log.diet_quality)}` : ''}
            </Text>
          </View>
          <Text style={[styles.recentChevron, isDark && styles.textSecDark]}>›</Text>
        </TouchableOpacity>
      ))}

      {hasOlderLogs && (
        <TouchableOpacity style={styles.browseOlderBtn} onPress={onBrowseOlder} activeOpacity={0.7}>
          <Text style={styles.browseOlderText}>Browse older entries</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TrackScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();
  const { profile } = useProfile();
  const isFemale = profile?.biological_sex === 'female';

  const todayStr = localDateString(0);

  const { todayLog, todayLogged, streak, isLoading, error, saveLog, refresh } = useDailyLog();
  const { isConnected: healthConnected, todayData: healthData, recheck: recheckHealth } = useHealthData();
  const { tracks: tracksMedication } = useMedicationTracking();

  useFocusEffect(useCallback(() => { refresh(); recheckHealth(); }, [refresh, recheckHealth]));

  // Recent logs (last 7 days, excluding today) + whether older entries exist
  const [recentLogs, setRecentLogs] = useState<DailyLog[]>([]);
  const [hasOlderLogs, setHasOlderLogs] = useState(false);
  const loadRecentLogs = useCallback(async () => {
    if (!user) return;
    try {
      const logs = await getDailyLogs(user.id, 100);
      const cutoff = localDateString(7);
      setRecentLogs(logs.filter((l) => l.date !== todayStr && l.date >= cutoff));
      setHasOlderLogs(logs.some((l) => l.date < cutoff));
    } catch {}
  }, [user, todayStr]);

  useFocusEffect(useCallback(() => { loadRecentLogs(); }, [loadRecentLogs]));

  // Modal state
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [modalLog, setModalLog] = useState<DailyLog | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loadingModal, setLoadingModal] = useState(false);

  const openEntryForDate = useCallback(async (date: string, knownLog?: DailyLog | null) => {
    if (!user) return;
    if (knownLog !== undefined) {
      setModalLog(knownLog);
      setModalDate(date);
      return;
    }
    setLoadingModal(true);
    try {
      const log = await getDailyLog(user.id, date);
      setModalLog(log);
      setModalDate(date);
    } catch {
      setModalLog(null);
      setModalDate(date);
    } finally {
      setLoadingModal(false);
    }
  }, [user]);

  // Today's form state
  const [editing, setEditing] = useState(false);
  const [painScore, setPainScore] = useState(0);
  const [fatigueScore, setFatigueScore] = useState(0);
  const [stiffness, setStiffness] = useState<MorningStiffness | null>(null);
  const [mood, setMood] = useState<Mood | null>(null);
  const [medsTaken, setMedsTaken] = useState<'yes' | 'no' | 'partial'>('yes');
  const [notes, setNotes] = useState('');
  const [dietQuality, setDietQuality] = useState<DietQuality | null>(null);
  const [dietTriggers, setDietTriggers] = useState<DietTrigger[]>([]);
  const [exerciseDone, setExerciseDone] = useState(false);
  const [exerciseType, setExerciseType] = useState<string | null>(null);
  const [exerciseMinutes, setExerciseMinutes] = useState<number | null>(null);
  const [periodActive, setPeriodActive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync form when today's log loads
  useEffect(() => {
    if (todayLog) {
      setPainScore(todayLog.pain_score);
      setFatigueScore(todayLog.fatigue_score);
      setStiffness(todayLog.stiffness_duration);
      setMood(todayLog.mood);
      setMedsTaken(todayLog.medications_taken ?? 'yes');
      setNotes(todayLog.notes ?? '');
      setDietQuality(todayLog.diet_quality ?? null);
      setDietTriggers(todayLog.diet_triggers ?? []);
      setExerciseDone(todayLog.exercise_done ?? false);
      setExerciseType(todayLog.exercise_type ?? null);
      setExerciseMinutes(todayLog.exercise_minutes ?? null);
      setPeriodActive(todayLog.period_active ?? false);
    } else {
      setPainScore(0);
      setFatigueScore(0);
      setStiffness(null);
      setMood(null);
      setMedsTaken('yes');
      setNotes('');
      setDietQuality(null);
      setDietTriggers([]);
      setExerciseDone(false);
      setExerciseType(null);
      setExerciseMinutes(null);
      setPeriodActive(false);
    }
    setEditing(false);
    setSaved(false);
  }, [todayLog]);

  const handleSaveToday = useCallback(async () => {
    if (!user) return;
    setIsSaving(true);
    setSaved(false);
    try {
      await saveLog({ pain_score: painScore, fatigue_score: fatigueScore, stiffness_duration: stiffness, mood, medications_taken: medsTaken, notes, diet_quality: dietQuality, diet_triggers: dietTriggers, exercise_done: exerciseDone, exercise_type: exerciseType, exercise_minutes: exerciseMinutes, period_active: isFemale ? periodActive : null });
      setEditing(false);
      setSaved(true);
    } catch {
      Alert.alert(t('errors.save_failed'));
    } finally {
      setIsSaving(false);
    }
  }, [user, saveLog, painScore, fatigueScore, stiffness, mood, medsTaken, notes, dietQuality, dietTriggers, exerciseDone, exerciseType, exerciseMinutes, t]);

  const showForm = !todayLogged || editing;

  // Yesterday context
  const yesterdayStr = localDateString(1);
  const yesterdayLog = recentLogs.find((l) => l.date === yesterdayStr) ?? null;

  // Today's date label
  const todayDateLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.screen, isDark && styles.screenDark]}>
        <LoadingSpinner fullScreen message={t('common.loading')} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, isDark && styles.screenDark]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Log header */}
        <View style={styles.logHeaderRow}>
          <View style={styles.logHeader}>
            <Text style={[styles.logHeaderDate, isDark && styles.textPrimaryDark]}>
              {todayDateLabel}
            </Text>
            <Text style={[styles.logHeaderSubtitle, isDark && styles.textSecDark]}>
              {todayLogged ? 'Logged today' : 'Log for today'}
            </Text>
          </View>
          <ProfileButton />
        </View>

        {error && <ErrorMessage message={error} onRetry={refresh} retryLabel={t('common.retry')} />}

        {/* Logged today banner — summary lives on Today tab, this is just confirmation + edit */}
        {todayLogged && todayLog && !editing && (
          <View style={[styles.loggedCard, isDark && styles.loggedCardDark]}>
            <View style={styles.loggedCardHeader}>
              <Text style={styles.loggedTick}>✓</Text>
              <View style={styles.loggedCardTextGroup}>
                <Text style={[styles.loggedTitle, isDark && styles.textPrimaryDark]}>
                  {t('tracker.already_logged_title')}
                </Text>
                <Text style={[styles.loggedSubtitle, isDark && styles.textSecDark]}>
                  {t('tracker.already_logged_subtitle')}
                </Text>
              </View>
              {streak > 0 && (
                <View style={styles.streakBadge}>
                  <Text style={styles.streakBadgeText}>🔥 {streak}</Text>
                </View>
              )}
            </View>
            <Button label={t('tracker.edit_today')} onPress={() => setEditing(true)} variant="outline" style={styles.editButton} />
          </View>
        )}

        {saved && !editing && (
          <View style={[styles.successCard, isDark && styles.successCardDark]}>
            <Text style={styles.successText}>{t('tracker.saved_success')}</Text>
          </View>
        )}

        {/* Today's form */}
        {showForm && (
          <DayLogForm
            painScore={painScore} setPainScore={setPainScore}
            fatigueScore={fatigueScore} setFatigueScore={setFatigueScore}
            stiffness={stiffness} setStiffness={setStiffness}
            mood={mood} setMood={setMood}
            medsTaken={medsTaken} setMedsTaken={setMedsTaken}
            notes={notes} setNotes={setNotes}
            dietQuality={dietQuality} setDietQuality={setDietQuality}
            dietTriggers={dietTriggers} setDietTriggers={setDietTriggers}
            exerciseDone={exerciseDone} setExerciseDone={setExerciseDone}
            exerciseType={exerciseType} setExerciseType={setExerciseType}
            exerciseMinutes={exerciseMinutes} setExerciseMinutes={setExerciseMinutes}
            tracksMedication={tracksMedication}
            isFemale={isFemale} periodActive={periodActive} setPeriodActive={setPeriodActive}
            isDark={isDark} t={t}
            isSaving={isSaving} onSave={handleSaveToday}
          />
        )}

        {/* Recent 7-day history — only shown if there are logged days */}
        {recentLogs.length > 0 && (
          <RecentLogsCard
            logs={recentLogs}
            today={todayStr}
            isDark={isDark}
            hasOlderLogs={hasOlderLogs}
            onEdit={(date, log) => openEntryForDate(date, log)}
            onBrowseOlder={() => setShowDatePicker(true)}
          />
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Edit modal for past entries */}
      {modalDate && user && (
        <DayLogModal
          date={modalDate}
          initialLog={modalLog}
          userId={user.id}
          tracksMedication={tracksMedication}
          isFemale={isFemale}
          isDark={isDark}
          t={t}
          onSaved={(saved) => {
            setRecentLogs((prev) => {
              const filtered = prev.filter((l) => l.date !== saved.date);
              return [...filtered, saved].sort((a, b) => b.date.localeCompare(a.date));
            });
          }}
          onClose={() => { setModalDate(null); setModalLog(null); }}
        />
      )}

      {/* Date picker for older entries */}
      {showDatePicker && (
        <DatePickerModal
          isDark={isDark}
          maxDate={localDateString(8)}
          onSelect={(date) => openEntryForDate(date, undefined)}
          onClose={() => setShowDatePicker(false)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  screenDark: {
    backgroundColor: Colors.backgroundDark,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },

  // Health strip
  healthStrip: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  healthStripDark: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
  },
  healthStripLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  healthStripStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  healthStat: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },

  logHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  logHeader: {
    paddingBottom: Spacing.xs,
    gap: 2,
    flex: 1,
    marginRight: Spacing.sm,
  },
  logHeaderDate: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  logHeaderSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  logHeaderYesterday: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  textPrimaryDark: {
    color: Colors.textPrimaryDark,
  },
  textSecDark: {
    color: Colors.textSecondaryDark,
  },

  // Logged card
  loggedCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  loggedCardDark: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
  },
  loggedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loggedTick: {
    fontSize: FontSize.xl,
    color: Colors.success,
    fontWeight: '700',
  },
  loggedCardTextGroup: {
    flex: 1,
  },
  loggedTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  loggedSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  streakBadge: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  streakBadgeText: {
    color: '#FFF',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  summaryItem: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  summaryItemDark: {
    backgroundColor: '#3D3530',
  },
  summaryLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  summaryValue: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  editButton: {
    marginTop: Spacing.xs,
  },

  // Success card
  successCard: {
    backgroundColor: Colors.success + '20',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.success,
  },
  successCardDark: {
    backgroundColor: '#052E16',
    borderColor: Colors.success,
  },
  successText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.success,
    textAlign: 'center',
  },

  // Form sections
  section: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  sectionDark: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
  },
  sectionLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  periodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  // Symptom sub-sections (inside the merged card)
  symptomSubSection: {
    gap: Spacing.sm,
  },
  symptomSubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  symptomSubLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  symptomDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
  symptomDividerDark: {
    backgroundColor: Colors.borderDark,
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    justifyContent: 'center',
  },
  chip: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipDark: {
    borderColor: Colors.borderDark,
    backgroundColor: Colors.backgroundDark,
  },
  chipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: '500',
    textAlign: 'center',
  },
  chipTextDark: {
    color: Colors.textPrimaryDark,
  },
  chipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Mood
  moodRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  moodButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    gap: 2,
  },
  moodButtonDark: {
    borderColor: Colors.borderDark,
    backgroundColor: Colors.backgroundDark,
  },
  moodEmoji: {
    fontSize: 22,
  },
  moodLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  optionLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Notes
  notesInput: {
    minHeight: 96,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    padding: Spacing.sm,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  notesInputDark: {
    borderColor: Colors.borderDark,
    backgroundColor: Colors.backgroundDark,
    color: Colors.textPrimaryDark,
  },

  saveButton: {
    marginTop: Spacing.xs,
  },
  exerciseHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exerciseMinutesRow: {
    gap: Spacing.xs,
  },
  minutesBtns: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  minutesPill: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    minWidth: 44,
    alignItems: 'center',
  },
  minutesPillText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  dietQualityRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  dietQualityChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  sectionSubLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  bottomPad: {
    height: Spacing.xl,
  },

  // Recent logs card
  recentCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  recentCardDark: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
  },
  recentCardTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  recentRowDark: {
    borderTopColor: Colors.borderDark,
  },
  recentRowLeft: {
    flex: 1,
    gap: 2,
  },
  recentDate: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  recentStats: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  recentEmpty: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  recentChevron: {
    fontSize: 20,
    color: Colors.textSecondary,
    fontWeight: '300',
  },
  browseOlderBtn: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  browseOlderText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.primary,
  },

  // Modal
  modalScreen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalHeaderDark: {
    borderBottomColor: Colors.borderDark,
  },
  modalCancel: {
    width: 64,
  },
  modalCancelText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  modalTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },

  // Calendar
  calendarContainer: {
    padding: Spacing.md,
  },
  calendarNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  calNavBtn: {
    padding: Spacing.sm,
  },
  calNavText: {
    fontSize: 28,
    fontWeight: '300',
    color: Colors.textPrimary,
    lineHeight: 28,
  },
  calMonthLabel: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  calDayHeaders: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
  },
  calDayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
    paddingVertical: Spacing.xs,
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDay: {
    borderRadius: BorderRadius.sm,
  },
  calDayDark: {},
  calDayDisabled: {
    opacity: 0.25,
  },
  calDayText: {
    fontSize: FontSize.md,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  calDayTextDisabled: {
    color: Colors.textSecondary,
  },
});
