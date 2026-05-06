import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  useColorScheme,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '@/constants/colors';
import { FontSize, Spacing } from '@/constants/theme';

export default function FlaresScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <SafeAreaView style={[styles.screen, isDark && styles.screenDark]}>
      <View style={styles.content}>
        <Text style={[styles.title, isDark && styles.titleDark]}>
          {t('flares.title')}
        </Text>
        <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
          {t('flares.subtitle')}
        </Text>
        <View style={[styles.noFlareCard, isDark && styles.noFlareCardDark]}>
          <Text style={[styles.noFlareText, isDark && styles.noFlareTextDark]}>
            {t('flares.no_active_flare')}
          </Text>
        </View>
        <View style={[styles.placeholder, isDark && styles.placeholderDark]}>
          <Text style={[styles.placeholderText, isDark && styles.subtitleDark]}>
            {t('flares.no_flares')}
          </Text>
        </View>
      </View>
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
  content: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  titleDark: {
    color: Colors.textPrimaryDark,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  subtitleDark: {
    color: Colors.textSecondaryDark,
  },
  noFlareCard: {
    backgroundColor: Colors.success + '20',
    borderRadius: 12,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.success,
  },
  noFlareCardDark: {
    backgroundColor: '#052E16',
    borderColor: Colors.success,
  },
  noFlareText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.success,
  },
  noFlareTextDark: {
    color: Colors.success,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  placeholderDark: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
  },
  placeholderText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    padding: Spacing.lg,
  },
});
