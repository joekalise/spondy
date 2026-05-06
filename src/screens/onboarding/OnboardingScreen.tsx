import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TextInput,
  Text,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
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

import {
  OnboardingData,
  AgeRange,
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

const TOTAL_STEPS = 10;

const defaultOnboardingData: OnboardingData = {
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

  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(defaultOnboardingData);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completingMessage, setCompletingMessage] = useState('');

  const canProceed = useCallback((): boolean => {
    switch (currentStep) {
      case 1:
        return data.age_range !== null;
      case 2:
        return data.diagnosis_years !== null;
      case 3:
        return data.severity !== null;
      case 4:
        return data.medications.length > 0;
      case 5:
        return data.pain_locations.length > 0;
      case 6:
        return data.pain_types.length > 0;
      case 7:
        return true; // conditions optional
      case 8:
        return data.morning_stiffness !== null;
      case 9:
        return data.challenges.length > 0;
      case 10:
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
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(s => s + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(s => s - 1);
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
      2: t('onboarding.diagnosis_years.title'),
      3: t('onboarding.severity.title'),
      4: t('onboarding.medications.title'),
      5: t('onboarding.pain_locations.title'),
      6: t('onboarding.pain_types.title'),
      7: t('onboarding.conditions.title'),
      8: t('onboarding.morning_stiffness.title'),
      9: t('onboarding.challenges.title'),
      10: t('onboarding.notification_time.title'),
    };
    return keys[currentStep] ?? '';
  };

  const getStepSubtitle = () => {
    const keys: Record<number, string> = {
      1: t('onboarding.age_range.subtitle'),
      2: t('onboarding.diagnosis_years.subtitle'),
      3: t('onboarding.severity.subtitle'),
      4: t('onboarding.medications.subtitle'),
      5: t('onboarding.pain_locations.subtitle'),
      6: t('onboarding.pain_types.subtitle'),
      7: t('onboarding.conditions.subtitle'),
      8: t('onboarding.morning_stiffness.subtitle'),
      9: t('onboarding.challenges.subtitle'),
      10: t('onboarding.notification_time.subtitle'),
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

      // Step 2: Diagnosis years
      case 2:
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

      // Step 3: Severity
      case 3:
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

      // Step 4: Medications (multi)
      case 4:
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

      // Step 5: Pain locations (multi)
      case 5:
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

      // Step 6: Pain types (multi)
      case 6:
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

      // Step 7: Associated conditions (multi, optional)
      case 7:
        return (
          <>
            {(
              [
                'uveitis',
                'psoriasis',
                'ibd',
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

      // Step 8: Morning stiffness
      case 8:
        return (
          <>
            {(
              ['under_30', '30_60', '1_2_hours', 'over_2_hours'] as MorningStiffness[]
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

      // Step 9: Lifestyle challenges (multi)
      case 9:
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

      // Step 10: Notification time
      case 10:
        return (
          <View>
            <Text
              style={[styles.timeLabel, isDark && styles.timeLabelDark]}
            >
              {t('onboarding.notification_time.placeholder')}
            </Text>
            <TextInput
              value={data.notification_time}
              onChangeText={v => setData(d => ({ ...d, notification_time: v }))}
              placeholder="HH:MM (e.g. 20:00)"
              placeholderTextColor={isDark ? Colors.textSecondaryDark : Colors.textSecondary}
              keyboardType="numbers-and-punctuation"
              style={[
                styles.timeInput,
                isDark && styles.timeInputDark,
              ]}
              maxLength={5}
            />
            <Text
              style={[styles.timeHint, isDark && styles.timeHintDark]}
            >
              {t('onboarding.notification_time.hint')}
            </Text>
          </View>
        );

      default:
        return null;
    }
  };

  const isLastStep = currentStep === TOTAL_STEPS;

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
  timeLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginBottom: Spacing.sm,
  },
  timeLabelDark: {
    color: Colors.textSecondaryDark,
  },
  timeInput: {
    fontSize: FontSize.xl,
    fontWeight: '600',
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    textAlign: 'center',
    letterSpacing: 3,
  },
  timeInputDark: {
    color: Colors.textPrimaryDark,
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
  },
  timeHint: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  timeHintDark: {
    color: Colors.textSecondaryDark,
  },
});
