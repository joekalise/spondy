import React from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  useColorScheme,
  ViewStyle,
} from 'react-native';
import { Colors } from '@/constants/colors';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';

interface MultiSelectCardProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  style?: ViewStyle;
}

export function MultiSelectCard({
  label,
  isSelected,
  onPress,
  style,
}: MultiSelectCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[
        styles.card,
        isDark ? styles.cardDark : styles.cardLight,
        isSelected && styles.cardSelected,
        style,
      ]}
    >
      <View
        style={[
          styles.checkbox,
          isDark ? styles.checkboxDark : styles.checkboxLight,
          isSelected && styles.checkboxSelected,
        ]}
      >
        {isSelected && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <Text
        style={[
          styles.label,
          isDark ? styles.labelDark : styles.labelLight,
          isSelected && styles.labelSelected,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderWidth: 1.5,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  cardLight: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  cardDark: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
  },
  cardSelected: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxLight: {
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  checkboxDark: {
    borderColor: Colors.borderDark,
    backgroundColor: Colors.backgroundDark,
  },
  checkboxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  label: {
    fontSize: FontSize.md,
    flex: 1,
    lineHeight: 22,
  },
  labelLight: {
    color: Colors.textPrimary,
  },
  labelDark: {
    color: Colors.textPrimaryDark,
  },
  labelSelected: {
    color: Colors.primaryDark,
    fontWeight: '600',
  },
});
