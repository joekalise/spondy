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
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'greeting_morning';
  if (hour < 17) return 'greeting_afternoon';
  return 'greeting_evening';
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { profile } = useProfile();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const greetingKey = getGreeting();

  return (
    <SafeAreaView style={[styles.screen, isDark && styles.screenDark]}>
      <View style={styles.content}>
        <Text style={[styles.greeting, isDark && styles.textDark]}>
          {t(`home.${greetingKey}`)}
        </Text>
        {profile?.welcome_message ? (
          <View style={[styles.card, isDark && styles.cardDark]}>
            <Text style={[styles.cardText, isDark && styles.cardTextDark]}>
              {profile.welcome_message}
            </Text>
          </View>
        ) : null}
        <View style={[styles.promptCard, isDark && styles.promptCardDark]}>
          <Text style={[styles.promptText, isDark && styles.promptTextDark]}>
            {t('home.check_in_prompt')}
          </Text>
          <Text style={styles.promptCta}>{t('home.check_in_cta')}</Text>
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
  greeting: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  textDark: {
    color: Colors.textPrimaryDark,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardDark: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
  },
  cardText: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  cardTextDark: {
    color: Colors.textPrimaryDark,
  },
  promptCard: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 12,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    gap: Spacing.xs,
  },
  promptCardDark: {
    backgroundColor: '#431407',
    borderColor: Colors.primaryDark,
  },
  promptText: {
    fontSize: FontSize.sm,
    color: Colors.primaryDark,
  },
  promptTextDark: {
    color: Colors.primaryLight,
  },
  promptCta: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.primary,
  },
});
