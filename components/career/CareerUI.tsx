/**
 * Shared career UI primitives.
 *
 * These are deliberately small. Every colour comes from the active theme, every
 * control has an accessibility role, and layout uses flex/wrap rather than fixed
 * widths so the module works on a small phone and a tablet. No screen here
 * animates, so reduced-motion users get the same static layout.
 */

import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../theme/useTheme';
import type { Theme } from '../../theme/theme';

export type CareerTone = 'neutral' | 'primary' | 'danger' | 'muted';

export function CareerScreen({
  title,
  subtitle,
  backLabel = 'Back',
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  backLabel?: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(t), [t]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          accessibilityLabel={backLabel}
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={onBack}
          style={styles.backButton}
        >
          <MaterialCommunityIcons color={t.colors.text} name="chevron-left" size={26} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function CareerSectionLabel({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function CareerCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return <View style={[styles.card, style]}>{children}</View>;
}

export function CareerCardTitle({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return <Text style={styles.cardTitle}>{children}</Text>;
}

export function CareerBody({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return <Text style={styles.body}>{children}</Text>;
}

export function CareerMuted({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return <Text style={styles.muted}>{children}</Text>;
}

export function CareerEmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return (
    <CareerCard style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {actionLabel && onAction ? (
        <CareerButton label={actionLabel} onPress={onAction} />
      ) : null}
    </CareerCard>
  );
}

export function CareerField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType,
  autoCapitalize,
  error,
  maxLength,
  accessibilityLabel,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  error?: string;
  maxLength?: number;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={accessibilityLabel ?? label}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        keyboardType={keyboardType}
        maxLength={maxLength}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.colors.textDisabled}
        style={[styles.input, multiline && styles.inputMultiline, error && styles.inputError]}
        value={value}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function CareerChoiceRow<T extends string | number>({
  label,
  options,
  selected,
  onSelect,
  labelFor = (value) => String(value),
}: {
  label: string;
  options: readonly T[];
  selected: T | undefined;
  onSelect: (value: T) => void;
  labelFor?: (value: T) => string;
}) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((option) => {
          const isSelected = option === selected;
          return (
            <TouchableOpacity
              key={option}
              accessibilityLabel={`${label}: ${labelFor(option)}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              activeOpacity={0.7}
              onPress={() => onSelect(option)}
              style={[styles.chip, isSelected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {labelFor(option)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function CareerMultiChoiceRow<T extends string>({
  label,
  options,
  selected,
  onToggle,
  labelFor = (value) => String(value),
  emptyLabel = 'No options yet',
}: {
  label: string;
  options: readonly T[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  labelFor?: (value: T) => string;
  emptyLabel?: string;
}) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {options.length === 0 ? (
        <Text style={styles.muted}>{emptyLabel}</Text>
      ) : (
        <View style={styles.chipRow}>
          {options.map((option) => {
            const isSelected = selected.includes(option);
            return (
              <TouchableOpacity
                key={option}
                accessibilityLabel={`${label}: ${labelFor(option)}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                activeOpacity={0.7}
                onPress={() => onToggle(option)}
                style={[styles.chip, isSelected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                  {labelFor(option)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

export function CareerButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  return (
    <TouchableOpacity
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      activeOpacity={0.8}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        isPrimary && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        isDanger && styles.buttonDanger,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          isPrimary && styles.buttonTextPrimary,
          variant === 'secondary' && styles.buttonTextSecondary,
          isDanger && styles.buttonTextDanger,
          disabled && styles.buttonTextDisabled,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function CareerProgressBar({
  ratio,
  label,
}: {
  ratio: number | null;
  label?: string;
}) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return (
    <View style={styles.progressWrap}>
      {label ? <Text style={styles.progressLabel}>{label}</Text> : null}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.round(Math.max(0, Math.min(1, ratio ?? 0)) * 100)}%` },
          ]}
        />
      </View>
    </View>
  );
}

export function CareerStat({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function CareerTag({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: CareerTone;
}) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return (
    <View
      style={[
        styles.tag,
        tone === 'primary' && styles.tagPrimary,
        tone === 'danger' && styles.tagDanger,
        tone === 'muted' && styles.tagMuted,
      ]}
    >
      <Text
        style={[
          styles.tagText,
          tone === 'primary' && styles.tagTextPrimary,
          tone === 'danger' && styles.tagTextDanger,
          tone === 'muted' && styles.tagTextMuted,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function CareerLinkRow({
  label,
  detail,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  detail?: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return (
    <TouchableOpacity
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      activeOpacity={0.7}
      onPress={onPress}
      style={styles.linkRow}
    >
      <View style={styles.linkText}>
        <Text style={styles.linkLabel}>{label}</Text>
        {detail ? <Text style={styles.linkDetail}>{detail}</Text> : null}
      </View>
      <MaterialCommunityIcons
        color={t.colors.textMuted}
        name="chevron-right"
        size={20}
      />
    </TouchableOpacity>
  );
}

export function CareerDivider() {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return <View style={styles.divider} />;
}

export function CareerActions({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return <View style={styles.actions}>{children}</View>;
}

/** A two-column row of stats that collapses correctly on narrow screens. */
export function CareerStatGrid({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return <View style={styles.statGrid}>{children}</View>;
}

const createStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 8,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.divider,
      backgroundColor: c.background,
    },
    backButton: {
      width: 40,
      height: 44,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    headerText: {
      flex: 1,
      paddingRight: 8,
      gap: 2,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: c.text,
    },
    subtitle: {
      fontSize: 13,
      color: c.textMuted,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 20,
      gap: 12,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 16,
      marginBottom: 2,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: 10,
      paddingVertical: 14,
      paddingHorizontal: 14,
      gap: 8,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: c.text,
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: c.text,
    },
    muted: {
      fontSize: 13,
      lineHeight: 18,
      color: c.textMuted,
    },
    emptyCard: {
      alignItems: 'flex-start',
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: c.text,
    },
    emptyBody: {
      fontSize: 14,
      lineHeight: 20,
      color: c.textMuted,
      marginBottom: 4,
    },
    field: {
      gap: 6,
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textMuted,
    },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 16,
      color: c.text,
      backgroundColor: c.background,
    },
    inputMultiline: {
      minHeight: 88,
      textAlignVertical: 'top',
    },
    inputError: {
      borderColor: c.danger,
    },
    error: {
      fontSize: 12,
      color: c.danger,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: c.surfaceMuted,
    },
    chipSelected: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text,
    },
    chipTextSelected: {
      color: c.primaryText,
    },
    button: {
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
    },
    buttonPrimary: {
      backgroundColor: c.primary,
    },
    buttonSecondary: {
      backgroundColor: c.surfaceMuted,
    },
    buttonDanger: {
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.danger,
    },
    buttonDisabled: {
      backgroundColor: c.surfaceMuted,
    },
    buttonText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.text,
    },
    buttonTextPrimary: {
      color: c.primaryText,
    },
    buttonTextSecondary: {
      color: c.text,
    },
    buttonTextDanger: {
      color: c.danger,
    },
    buttonTextDisabled: {
      color: c.textDisabled,
    },
    progressWrap: {
      gap: 5,
    },
    progressLabel: {
      fontSize: 12,
      color: c.textMuted,
    },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: c.progressTrack,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: c.primary,
    },
    statGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    stat: {
      flexGrow: 1,
      flexBasis: '30%',
      minWidth: 88,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: c.surface,
      gap: 2,
    },
    statValue: {
      fontSize: 20,
      fontWeight: '700',
      color: c.text,
    },
    statLabel: {
      fontSize: 12,
      color: c.textMuted,
    },
    tag: {
      borderRadius: 10,
      paddingHorizontal: 9,
      paddingVertical: 4,
      backgroundColor: c.surfaceMuted,
    },
    tagPrimary: {
      backgroundColor: c.primary,
    },
    tagDanger: {
      backgroundColor: c.warningSurface,
      borderWidth: 1,
      borderColor: c.warningBorder,
    },
    tagMuted: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    tagText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.text,
    },
    tagTextPrimary: {
      color: c.primaryText,
    },
    tagTextDanger: {
      color: c.warningText,
    },
    tagTextMuted: {
      color: c.textMuted,
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 10,
    },
    linkText: {
      flex: 1,
      gap: 2,
    },
    linkLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: c.text,
    },
    linkDetail: {
      fontSize: 13,
      color: c.textMuted,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.divider,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 8,
    },
  });
};
