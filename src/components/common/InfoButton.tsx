import React from 'react';
import { TouchableOpacity, Text, Alert, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { FontSize } from '@/constants/theme';

interface InfoButtonProps {
  title: string;
  message: string;
  color?: string;
}

export function InfoButton({ title, message, color }: InfoButtonProps) {
  return (
    <TouchableOpacity
      onPress={() => Alert.alert(title, message)}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      activeOpacity={0.6}
    >
      <Text style={[styles.icon, color ? { color } : undefined]}>ⓘ</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  icon: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
  },
});
