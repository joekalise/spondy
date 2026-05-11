import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { supabase } from '@/services/supabase';
import { Colors } from '@/constants/colors';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Parse recovery tokens from the deep-link URL fragment and activate the session
  useEffect(() => {
    const processUrl = async (url: string | null) => {
      if (!url) return;
      // URL: spondy://reset-password#access_token=...&refresh_token=...&type=recovery
      const fragment = url.split('#')[1];
      if (!fragment) return;
      const params = new URLSearchParams(fragment);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type');
      if (accessToken && refreshToken && type === 'recovery') {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error) setIsReady(true);
        else setError('This reset link has expired. Please request a new one.');
      }
    };

    Linking.getInitialURL().then(processUrl);
    const sub = Linking.addEventListener('url', ({ url }) => processUrl(url));
    return () => sub.remove();
  }, []);

  const handleUpdate = async () => {
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => router.replace('/(tabs)/'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const bg = isDark ? Colors.backgroundDark : Colors.background;
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;
  const inputBg = isDark ? Colors.surfaceDark : Colors.surface;
  const inputBorder = isDark ? Colors.borderDark : Colors.border;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>S</Text>
            </View>
            <Text style={[styles.title, { color: textPrimary }]}>Set new password</Text>
            <Text style={[styles.subtitle, { color: textSecondary }]}>
              Choose a strong password for your Spondy account.
            </Text>
          </View>

          {done ? (
            <View style={styles.doneCard}>
              <Text style={styles.doneText}>Password updated.</Text>
              <Text style={[styles.doneSubtext, { color: textSecondary }]}>
                Taking you back to the app...
              </Text>
            </View>
          ) : !isReady ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={[styles.loadingText, { color: textSecondary }]}>
                Verifying reset link...
              </Text>
              {error && <Text style={styles.errorText}>{error}</Text>}
            </View>
          ) : (
            <View style={styles.form}>
              {error && <Text style={styles.errorText}>{error}</Text>}
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="New password"
                placeholderTextColor={textSecondary}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }]}
              />
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Confirm new password"
                placeholderTextColor={textSecondary}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }]}
              />
              <TouchableOpacity
                style={[styles.button, isSaving && { opacity: 0.6 }]}
                onPress={handleUpdate}
                disabled={isSaving}
                activeOpacity={0.8}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Update password</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity onPress={() => router.replace('/(auth)/sign-in')} style={styles.backRow}>
            <Text style={[styles.backText, { color: textSecondary }]}>Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  container: {
    flex: 1,
    padding: Spacing.lg,
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
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  form: {
    gap: Spacing.sm,
  },
  input: {
    fontSize: FontSize.md,
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    minHeight: 52,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.error,
    textAlign: 'center',
  },
  loadingBlock: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  loadingText: {
    fontSize: FontSize.sm,
  },
  doneCard: {
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xl,
  },
  doneText: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.success,
  },
  doneSubtext: {
    fontSize: FontSize.sm,
  },
  backRow: {
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  backText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
});
