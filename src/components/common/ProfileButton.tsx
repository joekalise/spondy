import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';
import { FontSize, BorderRadius } from '@/constants/theme';

function getInitials(fullName?: string | null, email?: string | null): string {
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts[0].length > 0) return parts[0][0].toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return '?';
}

export function ProfileButton() {
  const router = useRouter();
  const { user } = useAuth();
  const initials = getInitials(user?.user_metadata?.full_name, user?.email);

  return (
    <TouchableOpacity
      onPress={() => router.push('/(tabs)/profile')}
      activeOpacity={0.8}
      style={styles.avatar}
    >
      <Text style={styles.initials}>{initials}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 18,
  },
});
