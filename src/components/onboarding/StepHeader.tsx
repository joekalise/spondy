import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { Colors } from '@/constants/colors';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';

interface StepHeaderProps {
  currentStep: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
}

export function StepHeader({
  currentStep,
  totalSteps,
  title,
  subtitle,
}: StepHeaderProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const progress = currentStep / totalSteps;

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={[styles.progressTrack, isDark && styles.progressTrackDark]}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.round(progress * 100)}%` },
          ]}
        />
      </View>

      {/* Step count */}
      <Text style={[styles.stepCount, isDark && styles.stepCountDark]}>
        {currentStep} of {totalSteps}
      </Text>

      {/* Title */}
      <Text style={[styles.title, isDark && styles.titleDark]}>{title}</Text>

      {/* Subtitle */}
      {subtitle ? (
        <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: Spacing.lg,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  progressTrackDark: {
    backgroundColor: Colors.borderDark,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
  },
  stepCount: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginBottom: Spacing.sm,
  },
  stepCountDark: {
    color: Colors.textSecondaryDark,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 34,
    marginBottom: Spacing.xs,
  },
  titleDark: {
    color: Colors.textPrimaryDark,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  subtitleDark: {
    color: Colors.textSecondaryDark,
  },
});
