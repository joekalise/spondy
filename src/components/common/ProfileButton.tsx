import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { Colors } from '@/constants/colors';
import { FontSize, BorderRadius } from '@/constants/theme';

export function ProfileButton() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useProfile();
  const displayName = profile?.preferred_name || user?.user_metadata?.full_name || user?.email;
  const initials = displayName ? displayName[0].toUpperCase() : '?';

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
