import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  useColorScheme,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';

import { Button } from '@/components/common/Button';
import { Colors } from '@/constants/colors';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { signOut, user } = useAuth();
  const { profile } = useProfile();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [isSigningOut, setIsSigningOut] = useState(false);

  const version = Constants.expoConfig?.version ?? '1.0.0';

  const handleSignOut = () => {
    Alert.alert(
      t('auth.sign_out'),
      'Are you sure you want to sign out?',
      [
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
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.screen, isDark && styles.screenDark]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, isDark && styles.titleDark]}>
          {t('profile.title')}
        </Text>

        {/* User info */}
        <View style={[styles.section, isDark && styles.sectionDark]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.email?.charAt(0).toUpperCase() ?? 'U'}
            </Text>
          </View>
          <Text style={[styles.email, isDark && styles.emailDark]}>
            {user?.email ?? ''}
          </Text>
        </View>

        {/* Profile details */}
        <View style={[styles.card, isDark && styles.cardDark]}>
          <Text style={[styles.cardLabel, isDark && styles.cardLabelDark]}>
            {t('profile.subscription')}
          </Text>
          <Text style={[styles.cardValue, isDark && styles.cardValueDark]}>
            {t('profile.subscription_free')}
          </Text>
        </View>

        <View style={[styles.card, isDark && styles.cardDark]}>
          <Text style={[styles.cardLabel, isDark && styles.cardLabelDark]}>
            {t('profile.notification_time')}
          </Text>
          <Text style={[styles.cardValue, isDark && styles.cardValueDark]}>
            {profile?.notification_time ?? '20:00'}
          </Text>
        </View>

        {/* Sign out */}
        <View style={styles.signOutSection}>
          <Button
            label={t('auth.sign_out')}
            onPress={handleSignOut}
            variant="outline"
            isLoading={isSigningOut}
          />
        </View>

        {/* Version */}
        <Text style={[styles.version, isDark && styles.versionDark]}>
          {t('profile.version', { version })}
        </Text>
      </ScrollView>
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
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: Spacing.xl,
  },
  titleDark: {
    color: Colors.textPrimaryDark,
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionDark: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
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
  email: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  emailDark: {
    color: Colors.textSecondaryDark,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardDark: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
  },
  cardLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  cardLabelDark: {
    color: Colors.textSecondaryDark,
  },
  cardValue: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  cardValueDark: {
    color: Colors.textPrimaryDark,
  },
  signOutSection: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  version: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  versionDark: {
    color: Colors.textSecondaryDark,
  },
});
