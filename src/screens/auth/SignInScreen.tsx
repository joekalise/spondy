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
  Linking,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';

import { Button } from '@/components/common/Button';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { Colors } from '@/constants/colors';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';

export function SignInScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signInWithEmail, signInWithApple, signInWithGoogle, resetPassword } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMode, setResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const validateEmail = (val: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

  const handleResetPassword = async () => {
    setError(null);
    if (!validateEmail(resetEmail)) {
      setError(t('auth.invalid_email'));
      return;
    }
    setIsLoading(true);
    try {
      await resetPassword(resetEmail.trim());
      setResetSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.auth_failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignIn = async () => {
    setError(null);

    if (!validateEmail(email)) {
      setError(t('auth.invalid_email'));
      return;
    }
    if (password.length < 8) {
      setError(t('auth.password_min'));
      return;
    }

    setIsLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t('auth.auth_failed');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setError(null);
    setIsAppleLoading(true);
    try {
      await signInWithApple();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t('errors.auth_failed');
      setError(message);
    } finally {
      setIsAppleLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t('errors.auth_failed');
      setError(message);
    } finally {
      setIsGoogleLoading(false);
    }
  };

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
              {t('auth.welcome')}
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

          {/* Email / password or reset password */}
          {resetMode ? (
            <View style={styles.form}>
              {resetSent ? (
                <Text style={[styles.resetSentText, isDark && styles.resetSentTextDark]}>
                  {t('auth.reset_sent')}
                </Text>
              ) : (
                <>
                  <TextInput
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    placeholder={t('auth.email')}
                    placeholderTextColor={isDark ? Colors.textSecondaryDark : Colors.textSecondary}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    textContentType="emailAddress"
                    style={[styles.input, isDark && styles.inputDark]}
                  />
                  <Button
                    label={t('auth.reset_password')}
                    onPress={handleResetPassword}
                    isLoading={isLoading}
                    disabled={isLoading}
                  />
                </>
              )}
              <TouchableOpacity
                style={styles.forgotRow}
                onPress={() => { setResetMode(false); setResetSent(false); setError(null); }}
              >
                <Text style={styles.forgotText}>{t('auth.sign_in')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.form}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder={t('auth.email')}
                placeholderTextColor={isDark ? Colors.textSecondaryDark : Colors.textSecondary}
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
                placeholderTextColor={isDark ? Colors.textSecondaryDark : Colors.textSecondary}
                secureTextEntry
                autoComplete="password"
                textContentType="password"
                style={[styles.input, isDark && styles.inputDark]}
              />
              <TouchableOpacity
                style={styles.forgotRow}
                onPress={() => { setResetMode(true); setResetEmail(email); setError(null); }}
              >
                <Text style={styles.forgotText}>{t('auth.forgot_password')}</Text>
              </TouchableOpacity>
              <Button
                label={t('auth.sign_in')}
                onPress={handleEmailSignIn}
                isLoading={isLoading}
                disabled={isLoading || isAppleLoading || isGoogleLoading}
              />
            </View>
          )}

          {/* Divider + social sign-in — hidden in reset mode */}
          {!resetMode && (
            <>
              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, isDark && styles.dividerLineDark]} />
                <Text style={[styles.dividerText, isDark && styles.dividerTextDark]}>
                  {t('common.or')}
                </Text>
                <View style={[styles.dividerLine, isDark && styles.dividerLineDark]} />
              </View>
              <View style={styles.socialButtons}>
                {Platform.OS === 'ios' ? (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                    buttonStyle={
                      isDark
                        ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                        : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                    }
                    cornerRadius={BorderRadius.md}
                    style={styles.appleButton}
                    onPress={handleAppleSignIn}
                  />
                ) : null}
                <TouchableOpacity
                  style={[styles.googleButton, isDark && styles.googleButtonDark]}
                  onPress={handleGoogleSignIn}
                  disabled={isLoading || isAppleLoading || isGoogleLoading}
                  activeOpacity={0.8}
                >
                  <Svg width={20} height={20} viewBox="0 0 48 48">
                    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </Svg>
                  <Text style={[styles.googleLabel, isDark && styles.googleLabelDark]}>
                    {t('auth.sign_in_google')}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Sign up link */}
          <View style={styles.linkRow}>
            <Text style={[styles.linkText, isDark && styles.linkTextDark]}>
              {t('auth.no_account')}{' '}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/sign-up')}>
              <Text style={styles.link}>{t('auth.sign_up')}</Text>
            </TouchableOpacity>
          </View>

          {/* Terms */}
          <Text style={[styles.terms, isDark && styles.termsDark]}>
            By continuing you agree to our Terms of Service and{' '}
            <Text
              style={styles.termsLink}
              onPress={() => Linking.openURL('https://gist.github.com/joekalise/fb689414dba7ade9f6d7383ccad9cf1f')}
            >
              Privacy Policy
            </Text>
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
    marginBottom: Spacing.lg,
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
  forgotRow: {
    alignItems: 'flex-end',
  },
  forgotText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '500',
  },
  resetSentText: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 22,
  },
  resetSentTextDark: {
    color: Colors.textPrimaryDark,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerLineDark: {
    backgroundColor: Colors.borderDark,
  },
  dividerText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  dividerTextDark: {
    color: Colors.textSecondaryDark,
  },
  socialButtons: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  appleButton: {
    height: 52,
    width: '100%',
  },
  googleButton: {
    height: 52,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#DADCE0',
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  googleButtonDark: {
    backgroundColor: '#1F1F1F',
    borderColor: '#5F6368',
  },
  googleLabel: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: '#3C4043',
  },
  googleLabelDark: {
    color: '#E8EAED',
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
  termsLink: {
    color: Colors.primary,
    fontWeight: '500',
  },
  termsDark: {
    color: Colors.textSecondaryDark,
  },
});
