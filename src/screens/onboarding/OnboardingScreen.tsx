import React, { useState, useCallback } from 'react';
import {
  Alert,
  View,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Text,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';

import { StepHeader } from '@/components/onboarding/StepHeader';
import { OptionCard } from '@/components/onboarding/OptionCard';
import { MultiSelectCard } from '@/components/onboarding/MultiSelectCard';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

import { Colors } from '@/constants/colors';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { generateWelcomeContent } from '@/services/claude';
import { useProfile } from '@/contexts/ProfileContext';
import { useAuth } from '@/contexts/AuthContext';

import { InfoButton } from '@/components/common/InfoButton';
import { requestNotificationPermissions } from '@/services/notifications';
import {
  OnboardingData,
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
  WelcomeContent,
} from '@/types';

const TOTAL_STEPS = 11;

function timeStringToDate(t: string): Date {
  const [h, m] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(isNaN(h) ? 20 : h, isNaN(m) ? 0 : m, 0, 0);
  return d;
}

function dateToTimeString(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const defaultOnboardingData: OnboardingData = {
  biological_sex: null,
  age_range: null,
  diagnosis_years: null,
  severity: null,
  medications: [],
  pain_locations: [],
  pain_types: [],
  conditions: [],
  morning_stiffness: null,
  challenges: [],
  notification_time: '20:00',
};

export function OnboardingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { saveProfile } = useProfile();
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [showWelcome, setShowWelcome] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(defaultOnboardingData);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completingMessage, setCompletingMessage] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewStep, setPreviewStep] = useState(0);
  const PREVIEW_TOTAL = 3;

  const canProceed = useCallback((): boolean => {
    switch (currentStep) {
      case 1:
        return data.age_range !== null;
      case 2:
        return data.biological_sex !== null;
      case 3:
        return data.diagnosis_years !== null;
      case 4:
        return data.severity !== null;
      case 5:
        return data.medications.length > 0;
      case 6:
        return data.pain_locations.length > 0;
      case 7:
        return data.pain_types.length > 0;
      case 8:
        return true; // conditions optional
      case 9:
        return data.morning_stiffness !== null;
      case 10:
        return data.challenges.length > 0;
      case 11:
        return data.notification_time.trim().length > 0;
      default:
        return false;
    }
  }, [currentStep, data]);

  function toggleMulti<T extends string>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
  }

  const handleComplete = async () => {
    if (!user) return;

    setIsCompleting(true);
    setCompletingMessage(t('onboarding.completing.subtitle'));

    let welcomeContent: WelcomeContent = {
      welcome_message:
        "Welcome to Spondy. We're glad you're here. This app will help you track and understand your AS journey.",
      insights: [
        'Consistent daily tracking is one of the most powerful tools for understanding your AS patterns.',
        'Many people with AS find that sleep quality is closely linked to next-day symptom levels.',
        'Small amounts of regular gentle movement can help reduce morning stiffness over time.',
      ],
      watch_summary:
        "Spondy will monitor your daily symptom patterns, sleep, and activity levels to help you spot trends before they become flares.",
    };

    try {
      welcomeContent = await generateWelcomeContent(data);
    } catch (err) {
      console.warn('Claude API failed, using fallback content:', err);
    }

    try {
      await saveProfile({
        user_id: user.id,
        biological_sex: data.biological_sex,
        age_range: data.age_range,
        diagnosis_years: data.diagnosis_years,
        severity: data.severity,
        medications: data.medications,
        pain_locations: data.pain_locations,
        pain_types: data.pain_types,
        conditions: data.conditions,
        morning_stiffness: data.morning_stiffness,
        challenges: data.challenges,
        notification_time: data.notification_time,
        ai_context: '',
        onboarding_complete: false,
        welcome_message: welcomeContent.welcome_message,
      });
    } catch (err) {
      console.error('Failed to save profile during onboarding:', err);
    }

    setIsCompleting(false);

    router.push({
      pathname: '/(onboarding)/profile-ready',
      params: {
        welcome_message: welcomeContent.welcome_message,
        insights: JSON.stringify(welcomeContent.insights),
        watch_summary: welcomeContent.watch_summary,
      },
    });
  };

  const handleNext = () => {
    if (currentStep === 11) {
      requestNotificationPermissions().catch(() => {});
    }
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(s => s + 1);
    } else {
      // Show feature previews before completing
      setShowPreview(true);
      setPreviewStep(0);
    }
  };

  const handleBack = () => {
    if (showPreview) {
      if (previewStep > 0) {
        setPreviewStep(s => s - 1);
      } else {
        setShowPreview(false);
      }
    } else if (currentStep > 1) {
      setCurrentStep(s => s - 1);
    }
  };

  const handlePreviewNext = () => {
    if (previewStep < PREVIEW_TOTAL - 1) {
      setPreviewStep(s => s + 1);
    } else {
      handleComplete();
    }
  };

  if (isCompleting) {
    return (
      <SafeAreaView
        style={[styles.screen, isDark && styles.screenDark]}
      >
        <View style={styles.completingContainer}>
          <LoadingSpinner
            message={completingMessage}
            size="large"
          />
          <Text style={[styles.completingTitle, isDark && styles.textDark]}>
            {t('onboarding.completing.title')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const getStepTitle = () => {
    const keys: Record<number, string> = {
      1: t('onboarding.age_range.title'),
      2: t('onboarding.biological_sex.title'),
      3: t('onboarding.diagnosis_years.title'),
      4: t('onboarding.severity.title'),
      5: t('onboarding.medications.title'),
      6: t('onboarding.pain_locations.title'),
      7: t('onboarding.pain_types.title'),
      8: t('onboarding.conditions.title'),
      9: t('onboarding.morning_stiffness.title'),
      10: t('onboarding.challenges.title'),
      11: t('onboarding.notification_time.title'),
    };
    return keys[currentStep] ?? '';
  };

  const getStepSubtitle = () => {
    const keys: Record<number, string> = {
      1: t('onboarding.age_range.subtitle'),
      2: t('onboarding.biological_sex.subtitle'),
      3: t('onboarding.diagnosis_years.subtitle'),
      4: t('onboarding.severity.subtitle'),
      5: t('onboarding.medications.subtitle'),
      6: t('onboarding.pain_locations.subtitle'),
      7: t('onboarding.pain_types.subtitle'),
      8: t('onboarding.conditions.subtitle'),
      9: t('onboarding.morning_stiffness.subtitle'),
      10: t('onboarding.challenges.subtitle'),
      11: t('onboarding.notification_time.subtitle'),
    };
    return keys[currentStep] ?? '';
  };

  const renderStepContent = () => {
    switch (currentStep) {
      // Step 1: Age range
      case 1:
        return (
          <>
            {(['under_25', '25_35', '35_45', '45_55', '55_plus'] as AgeRange[]).map(v => (
              <OptionCard
                key={v}
                label={t(`onboarding.age_range.${v}`)}
                isSelected={data.age_range === v}
                onPress={() => setData(d => ({ ...d, age_range: v }))}
              />
            ))}
          </>
        );

      // Step 2: Biological sex
      case 2:
        return (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md, gap: Spacing.xs }}>
              <Text style={{ fontSize: FontSize.sm, color: isDark ? Colors.textSecondaryDark : Colors.textSecondary }}>
                Why do we ask this?
              </Text>
              <InfoButton
                title={t('onboarding.biological_sex.info_title')}
                message={t('onboarding.biological_sex.info_message')}
                color={isDark ? Colors.textSecondaryDark : Colors.textSecondary}
              />
            </View>
            {(['male', 'female', 'prefer_not_to_say'] as BiologicalSex[]).map(v => (
              <OptionCard
                key={v}
                label={t(`onboarding.biological_sex.${v}`)}
                isSelected={data.biological_sex === v}
                onPress={() => setData(d => ({ ...d, biological_sex: v }))}
              />
            ))}
          </>
        );

      // Step 3: Diagnosis years
      case 3:
        return (
          <>
            {(['under_1', '1_3', '3_5', '5_10', '10_plus'] as DiagnosisYears[]).map(v => (
              <OptionCard
                key={v}
                label={t(`onboarding.diagnosis_years.${v}`)}
                isSelected={data.diagnosis_years === v}
                onPress={() => setData(d => ({ ...d, diagnosis_years: v }))}
              />
            ))}
          </>
        );

      // Step 4: Severity
      case 4:
        return (
          <>
            {(['mild', 'moderate', 'severe'] as Severity[]).map(v => (
              <OptionCard
                key={v}
                label={t(`onboarding.severity.${v}`)}
                isSelected={data.severity === v}
                onPress={() => setData(d => ({ ...d, severity: v }))}
              />
            ))}
          </>
        );

      // Step 5: Medications (multi)
      case 5:
        return (
          <>
            {(
              [
                'adalimumab',
                'secukinumab',
                'ixekizumab',
                'ustekinumab',
                'nsaids_only',
                'no_medication',
                'other',
              ] as Medication[]
            ).map(v => (
              <MultiSelectCard
                key={v}
                label={t(`onboarding.medications.${v}`)}
                isSelected={data.medications.includes(v)}
                onPress={() =>
                  setData(d => ({
                    ...d,
                    medications: toggleMulti(d.medications, v),
                  }))
                }
              />
            ))}
          </>
        );

      // Step 6: Pain locations (multi)
      case 6:
        return (
          <>
            {(
              [
                'lower_back',
                'upper_back',
                'hips',
                'knees',
                'shoulders',
                'neck',
                'chest',
                'jaw',
                'heels',
                'other',
              ] as PainLocation[]
            ).map(v => (
              <MultiSelectCard
                key={v}
                label={t(`onboarding.pain_locations.${v}`)}
                isSelected={data.pain_locations.includes(v)}
                onPress={() =>
                  setData(d => ({
                    ...d,
                    pain_locations: toggleMulti(d.pain_locations, v),
                  }))
                }
              />
            ))}
          </>
        );

      // Step 7: Pain types (multi)
      case 7:
        return (
          <>
            {(
              ['stiffness', 'sharp_pain', 'burning', 'aching', 'fatigue'] as PainType[]
            ).map(v => (
              <MultiSelectCard
                key={v}
                label={t(`onboarding.pain_types.${v}`)}
                isSelected={data.pain_types.includes(v)}
                onPress={() =>
                  setData(d => ({
                    ...d,
                    pain_types: toggleMulti(d.pain_types, v),
                  }))
                }
              />
            ))}
          </>
        );

      // Step 8: Associated conditions (multi, optional)
      case 8:
        return (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md, gap: Spacing.xs }}>
              <Text style={{ fontSize: FontSize.sm, color: isDark ? Colors.textSecondaryDark : Colors.textSecondary }}>
                Why do we ask this?
              </Text>
              <InfoButton
                title={t('onboarding.conditions.info_title')}
                message={t('onboarding.conditions.info_message')}
                color={isDark ? Colors.textSecondaryDark : Colors.textSecondary}
              />
            </View>
            {(
              [
                'uveitis',
                'psoriasis',
                'ibd',
                'enthesitis',
                'peripheral_joint',
                'fatigue',
                'brain_fog',
                'anxiety_depression',
              ] as AssociatedCondition[]
            ).map(v => (
              <MultiSelectCard
                key={v}
                label={t(`onboarding.conditions.${v}`)}
                isSelected={data.conditions.includes(v)}
                onPress={() =>
                  setData(d => ({
                    ...d,
                    conditions: toggleMulti(d.conditions, v),
                  }))
                }
              />
            ))}
          </>
        );

      // Step 9: Morning stiffness
      case 9:
        return (
          <>
            {(
              ['none', 'under_30', '30_60', '1_2_hours', 'over_2_hours'] as MorningStiffness[]
            ).map(v => (
              <OptionCard
                key={v}
                label={t(`onboarding.morning_stiffness.${v}`)}
                isSelected={data.morning_stiffness === v}
                onPress={() => setData(d => ({ ...d, morning_stiffness: v }))}
              />
            ))}
          </>
        );

      // Step 10: Lifestyle challenges (multi)
      case 10:
        return (
          <>
            {(
              [
                'sleep',
                'exercise',
                'work',
                'social_life',
                'mental_health',
              ] as LifestyleChallenge[]
            ).map(v => (
              <MultiSelectCard
                key={v}
                label={t(`onboarding.challenges.${v}`)}
                isSelected={data.challenges.includes(v)}
                onPress={() =>
                  setData(d => ({
                    ...d,
                    challenges: toggleMulti(d.challenges, v),
                  }))
                }
              />
            ))}
          </>
        );

      // Step 11: Notification time
      case 11:
        return (
          <View style={styles.timePickerContainer}>
            <DateTimePicker
              value={timeStringToDate(data.notification_time)}
              mode="time"
              display="spinner"
              onChange={(_event, date) => {
                if (date) {
                  setData(d => ({ ...d, notification_time: dateToTimeString(date) }));
                }
              }}
              style={styles.timePicker}
              textColor={isDark ? Colors.textPrimaryDark : Colors.textPrimary}
            />
          </View>
        );

      default:
        return null;
    }
  };

  const isLastStep = currentStep === TOTAL_STEPS;
  const isLastPreview = previewStep === PREVIEW_TOTAL - 1;

  const PREVIEW_SLIDES = [
    {
      title: 'See how you\'re really doing',
      subtitle: '',
      mockContent: (
        <View style={[styles.mockCard, isDark && styles.mockCardDark]}>
          {/* Score row */}
          <View style={styles.mockScoreRow}>
            <View>
              <Text style={[styles.mockCardTitle, isDark && styles.mockCardTitleDark]}>Spondy Score</Text>
              <Text style={[styles.mockScoreHint, isDark && styles.mockTextSec]}>This week · 6 days logged</Text>
            </View>
            <View style={[styles.mockScoreCircle, { borderColor: Colors.success }]}>
              <Text style={[styles.mockScoreNum, { color: Colors.success }]}>74</Text>
              <Text style={[styles.mockScoreOut, { color: Colors.success }]}>/100</Text>
            </View>
          </View>

          {/* Mini bar chart */}
          <View style={styles.mockWeekBars}>
            {[55, 42, 68, 80, 62, 78, 74].map((h, i) => (
              <View key={i} style={styles.mockBarWrap}>
                <View style={styles.mockBarTrack}>
                  <View style={[styles.mockBarFill, { height: `${h}%`, backgroundColor: h >= 65 ? Colors.success : Colors.warning }]} />
                </View>
                <Text style={[styles.mockBarLabel, isDark && styles.mockTextSec]}>{['M','T','W','T','F','S','S'][i]}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.mockDivider, isDark && { backgroundColor: Colors.borderDark }]} />

          {/* Stats */}
          {[
            { label: 'Avg pain', value: '4.2 / 10', color: Colors.warning },
            { label: 'Avg fatigue', value: '3.1 / 10', color: Colors.success },
            { label: 'Mood', value: '😊 Mostly good', color: Colors.success },
            { label: 'Streak', value: '🔥 6 days', color: Colors.primary },
          ].map(s => (
            <View key={s.label} style={styles.mockFactorRow}>
              <Text style={[styles.mockFactor, isDark && styles.mockTextSec]}>{s.label}</Text>
              <Text style={[styles.mockFactorVal, { color: s.color }]}>{s.value}</Text>
            </View>
          ))}
        </View>
      ),
    },
    {
      title: 'Know before a flare hits',
      subtitle: '',
      mockContent: (
        <View style={{ gap: Spacing.sm }}>
          <View style={[styles.mockWarningCard, isDark && styles.mockWarningCardDark]}>
            <View style={styles.mockScoreRow}>
              <Text style={styles.mockWarningTitle}>⚠️ Heads up</Text>
              <View style={[styles.mockChip, { borderColor: Colors.warning + '80' }]}>
                <Text style={[styles.mockChipText, { color: Colors.warning }]}>Elevated risk</Text>
              </View>
            </View>
            <Text style={[styles.mockWarningBody, isDark && styles.mockTextSec]}>
              Pain has been trending up for 3 days and your sleep is shorter. Based on your patterns, take it easy today.
            </Text>

            {/* Trend bars */}
            <View style={styles.mockWeekBars}>
              {[2, 3, 3, 4, 5, 7, 8].map((h, i) => (
                <View key={i} style={styles.mockBarWrap}>
                  <View style={styles.mockBarTrack}>
                    <View style={[styles.mockBarFill, { height: `${(h / 10) * 100}%`, backgroundColor: i >= 5 ? Colors.error : Colors.success }]} />
                  </View>
                  <Text style={[styles.mockBarLabel, isDark && styles.mockTextSec]}>{['M','T','W','T','F','S','S'][i]}</Text>
                </View>
              ))}
            </View>

            <View style={styles.mockChipsRow}>
              {['😴 Shorter sleep', '🔄 HRV dropping', '⏱ Stiffness up'].map(chip => (
                <View key={chip} style={[styles.mockChip, { borderColor: Colors.warning + '60' }]}>
                  <Text style={[styles.mockChipText, { color: Colors.warning }]}>{chip}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.mockCard, isDark && styles.mockCardDark]}>
            <View style={styles.mockFactorRow}>
              <Text style={[styles.mockFactor, isDark && styles.mockTextSec]}>Creator's note</Text>
            </View>
            <Text style={[styles.mockInsightSummary, isDark && styles.mockTextSec]}>
              These signals predicted a uveitis flare 3 days before it struck. Spondy watches for exactly this.
            </Text>
          </View>
        </View>
      ),
    },
    {
      title: 'AI insights, just for you',
      subtitle: '',
      mockContent: (
        <View style={[styles.mockCard, isDark && styles.mockCardDark]}>
          <View style={styles.mockAIHeader}>
            <Text style={[styles.mockCardTitle, isDark && styles.mockCardTitleDark]}>Weekly insight</Text>
            <View style={styles.mockBadge}><Text style={styles.mockBadgeText}>Premium</Text></View>
          </View>

          {/* Chat exchange */}
          <View style={styles.mockChatBubbleUser}>
            <Text style={styles.mockChatTextUser}>Why was my pain lower this week?</Text>
          </View>
          <View style={styles.mockChatBubbleAI}>
            <Text style={[styles.mockChatTextAI, isDark && styles.mockTextSec]}>
              You slept 7.5h on average — on those nights, your pain scores dropped by ~35%. Your medication adherence was also perfect this week.
            </Text>
          </View>

          <View style={[styles.mockDivider, isDark && { backgroundColor: Colors.borderDark }]} />

          {[
            { icon: '😴', label: 'Sleep vs pain', value: 'Strong link' },
            { icon: '💊', label: 'Medication', value: '7/7 days ✓' },
            { icon: '🚶', label: 'Activity', value: 'Light week' },
          ].map(r => (
            <View key={r.label} style={styles.mockFactorRow}>
              <Text style={[styles.mockFactor, isDark && styles.mockTextSec]}>{r.icon} {r.label}</Text>
              <Text style={[styles.mockFactorVal, { color: Colors.primary }]}>{r.value}</Text>
            </View>
          ))}
        </View>
      ),
    },
  ];

  if (showPreview) {
    const slide = PREVIEW_SLIDES[previewStep];
    return (
      <SafeAreaView style={[styles.screen, isDark && styles.screenDark]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardAvoid}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

            {/* Progress dots */}
            <View style={styles.previewDots}>
              {PREVIEW_SLIDES.map((_, i) => (
                <View
                  key={i}
                  style={[styles.previewDot, i === previewStep && styles.previewDotActive]}
                />
              ))}
            </View>

            <Text style={[styles.previewTitle, isDark && styles.textDark]}>{slide.title}</Text>
            {slide.subtitle ? (
              <Text style={[styles.previewSubtitle, isDark && styles.timeLabelDark]}>{slide.subtitle}</Text>
            ) : null}

            <View style={styles.previewMockContainer}>
              {slide.mockContent}
            </View>

            <View style={styles.navRow}>
              <TouchableOpacity onPress={handleBack} style={styles.previewBackBtn}>
                <Text style={[styles.previewBackText, isDark && styles.timeLabelDark]}>
                  {t('common.back')}
                </Text>
              </TouchableOpacity>
              <Button
                label={isLastPreview ? t('onboarding.build_profile') : t('common.next')}
                onPress={handlePreviewNext}
                fullWidth={false}
                style={styles.nextButton}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (showWelcome) {
    return (
      <SafeAreaView style={[styles.screen, isDark && styles.screenDark]}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, styles.welcomeScroll]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.welcomeContent}>
            <Text style={styles.welcomeEmoji}>🦴</Text>
            <Text style={[styles.welcomeTitle, isDark && styles.textDark]}>
              Life with AS,{'\n'}finally understood
            </Text>
            <Text style={[styles.welcomeSubtitle, isDark && styles.timeLabelDark]}>
              Spondy learns your patterns so you can stay ahead of flares and make the most of your good days.
            </Text>

            <View style={styles.welcomeFeatures}>
              {[
                { icon: '📊', text: 'Track pain, fatigue, sleep, and medication in under 60 seconds' },
                { icon: '🔮', text: 'Spot early warning signs before a flare strikes' },
                { icon: '🩺', text: 'Share clear reports with your rheumatologist' },
              ].map(({ icon, text }) => (
                <View key={text} style={[styles.welcomeFeatureRow, isDark && styles.welcomeFeatureRowDark]}>
                  <Text style={styles.welcomeFeatureIcon}>{icon}</Text>
                  <Text style={[styles.welcomeFeatureText, isDark && styles.timeLabelDark]}>{text}</Text>
                </View>
              ))}
            </View>

            <Text style={[styles.welcomeCreator, isDark && styles.timeLabelDark]}>
              Built by someone with AS, for people with AS.
            </Text>
          </View>

          <Button
            label="Get started"
            onPress={() => setShowWelcome(false)}
            style={styles.welcomeButton}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, isDark && styles.screenDark]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <StepHeader
            currentStep={currentStep}
            totalSteps={TOTAL_STEPS}
            title={getStepTitle()}
            subtitle={getStepSubtitle()}
          />

          <View style={styles.content}>{renderStepContent()}</View>

          <View style={styles.navRow}>
            {currentStep > 1 ? (
              <Button
                label={t('common.back')}
                onPress={handleBack}
                variant="outline"
                fullWidth={false}
                style={styles.backButton}
              />
            ) : (
              <View style={styles.backPlaceholder} />
            )}

            <Button
              label={isLastStep ? t('onboarding.build_profile') : t('common.next')}
              onPress={handleNext}
              disabled={!canProceed()}
              fullWidth={false}
              style={styles.nextButton}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    flexGrow: 1,
  },
  content: {
    flex: 1,
    marginBottom: Spacing.xl,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  backButton: {
    minWidth: 100,
  },
  nextButton: {
    flex: 1,
  },
  backPlaceholder: {
    minWidth: 100,
  },
  completingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  completingTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  textDark: {
    color: Colors.textPrimaryDark,
  },
  timeLabelDark: {
    color: Colors.textSecondaryDark,
  },
  timePickerContainer: {
    alignItems: 'center',
    marginVertical: Spacing.md,
  },
  timePicker: {
    width: '100%',
    height: 180,
  },

  // Preview slides
  previewDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  previewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
  },
  previewDotActive: {
    backgroundColor: Colors.primary,
    width: 20,
  },
  previewTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  previewSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  previewMockContainer: {
    marginBottom: Spacing.xl,
  },
  previewBackBtn: {
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
  },
  previewBackText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },

  // Mock cards
  mockCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  mockCardDark: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
  },
  mockCardTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  mockCardTitleDark: {
    color: Colors.textPrimaryDark,
  },
  mockTextSec: {
    color: Colors.textSecondaryDark,
  },
  mockScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  mockScoreCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mockScoreNum: {
    fontSize: FontSize.xl,
    fontWeight: '900',
    lineHeight: 28,
  },
  mockScoreOut: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    opacity: 0.7,
  },
  mockScoreRight: {
    flex: 1,
    gap: 3,
  },
  mockScoreLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  mockScoreHint: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  mockFactorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mockFactor: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  mockFactorVal: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  mockWarningCard: {
    backgroundColor: Colors.warning + '12',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.warning + '50',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  mockWarningCardDark: {
    backgroundColor: '#3A2500',
  },
  mockWarningTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.warning,
  },
  mockWarningBody: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  mockChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  mockChip: {
    borderWidth: 1,
    borderColor: Colors.warning + '60',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  mockChipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.warning,
  },
  mockAIHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  mockBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  mockBadgeText: {
    fontSize: FontSize.xs,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  mockInsightSummary: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  mockInsightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingVertical: Spacing.sm,
  },
  mockInsightRowDark: {
    borderTopColor: Colors.borderDark,
  },
  mockInsightTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
    flex: 1,
  },
  mockChevron: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  mockWeekBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 52,
    gap: 5,
    marginVertical: Spacing.sm,
  },
  mockBarWrap: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    height: '100%',
    justifyContent: 'flex-end',
  },
  mockBarTrack: {
    width: '100%',
    flex: 1,
    justifyContent: 'flex-end',
    borderRadius: 3,
  },
  mockBarFill: {
    width: '100%',
    borderRadius: 3,
    minHeight: 4,
  },
  mockBarLabel: {
    fontSize: 9,
    color: Colors.textSecondary,
  },
  mockDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
  mockChatBubbleUser: {
    alignItems: 'flex-end',
    marginBottom: Spacing.xs,
  },
  mockChatBubbleAI: {
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  mockChatTextUser: {
    fontSize: FontSize.sm,
    backgroundColor: Colors.primary,
    color: '#FFFFFF',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    maxWidth: '80%',
    overflow: 'hidden',
    lineHeight: 19,
  },
  mockChatTextAI: {
    fontSize: FontSize.sm,
    backgroundColor: Colors.border,
    color: Colors.textPrimary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    maxWidth: '88%',
    overflow: 'hidden',
    lineHeight: 19,
  },

  // Welcome screen
  welcomeScroll: {
    justifyContent: 'space-between',
  },
  welcomeContent: {
    flex: 1,
    alignItems: 'center',
    paddingTop: Spacing.xxl,
  },
  welcomeEmoji: {
    fontSize: 56,
    marginBottom: Spacing.lg,
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 38,
    marginBottom: Spacing.md,
  },
  welcomeSubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  welcomeFeatures: {
    width: '100%',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  welcomeFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  welcomeFeatureRowDark: {
    backgroundColor: Colors.surfaceDark,
  },
  welcomeFeatureIcon: {
    fontSize: 22,
    width: 32,
    textAlign: 'center',
  },
  welcomeFeatureText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  welcomeCreator: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: Spacing.xl,
  },
  welcomeButton: {
    marginTop: Spacing.lg,
  },
});
