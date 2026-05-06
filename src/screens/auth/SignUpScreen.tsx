import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Platform,
  useColorScheme,
  KeyboardAvoidingView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';

import { Button } from '@/components/common/Button';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { Colors } from '@/constants/colors';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';

export function SignUpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signUpWithEmail } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const validateEmail = (val: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

  const handleSignUp = async () => {
    setError(null);

    if (!validateEmail(email)) {
      setError(t('auth.invalid_email'));
      return;
    }
    if (password.length < 8) {
      setError(t('auth.password_min'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwords_mismatch'));
      return;
    }

    setIsLoading(true);
    try {
      await signUpWithEmail(email.trim(), password);
      setSuccess(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t('errors.auth_failed');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={[styles.screen, isDark && styles.screenDark]}>
        <View style={styles.successContainer}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>S</Text>
          </View>
          <Text style={[styles.successTitle, isDark && styles.titleDark]}>
            Check your email
          </Text>
          <Text style={[styles.successSubtitle, isDark && styles.subtitleDark]}>
            We sent a confirmation link to{' '}
            <Text style={styles.emailHighlight}>{email}</Text>. Click it to
            activate your account.
          </Text>
          <Button
            label={t('auth.sign_in')}
            onPress={() => router.replace('/(auth)/sign-in')}
            style={styles.successButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, isDark && styles.screenDark]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>S</Text>
            </View>
            <Text style={[styles.title, isDark && styles.titleDark]}>
              {t('auth.sign_up')}
            </Text>
            <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
              {t('auth.subtitle')}
            </Text>
          </View>

          {/* Error */}
          {error ? (
            <ErrorMessage
              message={error}
              onRetry={() => setError(null)}
              retryLabel={t('common.retry')}
            />
          ) : null}

          {/* Form */}
          <View style={styles.form}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t('auth.email')}
              placeholderTextColor={
                isDark ? Colors.textSecondaryDark : Colors.textSecondary
              }
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              style={[styles.input, isDark && styles.inputDark]}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={t('auth.password')}
              placeholderTextColor={
                isDark ? Colors.textSecondaryDark : Colors.textSecondary
              }
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              style={[styles.input, isDark && styles.inputDark]}
            />
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={t('auth.confirm_password')}
              placeholderTextColor={
                isDark ? Colors.textSecondaryDark : Colors.textSecondary
              }
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              style={[styles.input, isDark && styles.inputDark]}
            />

            <Button
              label={t('auth.sign_up')}
              onPress={handleSignUp}
              isLoading={isLoading}
              disabled={isLoading}
            />
          </View>

          {/* Sign in link */}
          <View style={styles.linkRow}>
            <Text style={[styles.linkText, isDark && styles.linkTextDark]}>
              {t('auth.have_account')}{' '}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/sign-in')}>
              <Text style={styles.link}>{t('auth.sign_in')}</Text>
            </TouchableOpacity>
          </View>

          {/* Terms */}
          <Text style={[styles.terms, isDark && styles.termsDark]}>
            {t('auth.terms')}
          </Text>
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
  flex: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  logoText: {
    fontSize: FontSize.xxl,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  titleDark: {
    color: Colors.textPrimaryDark,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  subtitleDark: {
    color: Colors.textSecondaryDark,
  },
  form: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  input: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    minHeight: 52,
  },
  inputDark: {
    color: Colors.textPrimaryDark,
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  linkText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  linkTextDark: {
    color: Colors.textSecondaryDark,
  },
  link: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '600',
  },
  terms: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
  },
  termsDark: {
    color: Colors.textSecondaryDark,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  successTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  emailHighlight: {
    fontWeight: '600',
    color: Colors.primary,
  },
  successButton: {
    marginTop: Spacing.lg,
  },
});
