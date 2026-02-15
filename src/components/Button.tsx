import React from 'react'
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  View,
} from 'react-native'
import { colors } from '../theme'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'tab' | 'danger'

type Theme = typeof colors.dark

function getVariantStyles(theme: Theme, variant: ButtonVariant, active?: boolean) {
  switch (variant) {
    case 'primary':
      return {
        container: { backgroundColor: theme.accent } as ViewStyle,
        text: { color: theme.textOnAccent } as TextStyle,
      }
    case 'secondary':
      return {
        container: {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: theme.border,
        } as ViewStyle,
        text: { color: theme.text } as TextStyle,
      }
    case 'ghost':
      return {
        container: { backgroundColor: 'transparent' } as ViewStyle,
        text: { color: theme.accent } as TextStyle,
      }
    case 'tab':
      return {
        container: {
          backgroundColor: 'transparent',
          borderBottomWidth: 2,
          borderBottomColor: active ? theme.accent : 'transparent',
        } as ViewStyle,
        text: { color: active ? theme.accent : theme.muted } as TextStyle,
      }
    case 'danger':
      return {
        container: {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: theme.error,
        } as ViewStyle,
        text: { color: theme.error } as TextStyle,
      }
    default:
      return {
        container: { backgroundColor: theme.accent } as ViewStyle,
        text: { color: theme.textOnAccent } as TextStyle,
      }
  }
}

type Props = {
  variant?: ButtonVariant
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  active?: boolean
  title: string
  theme: Theme
  style?: ViewStyle
  textStyle?: TextStyle
  /** Compact padding for header/nav */
  compact?: boolean
}

export function Button({
  variant = 'primary',
  onPress,
  disabled = false,
  loading = false,
  active = false,
  title,
  theme,
  style,
  textStyle,
  compact = false,
}: Props) {
  const variantStyles = getVariantStyles(theme, variant, active)
  const isDisabled = disabled || loading

  return (
    <TouchableOpacity
      style={[
        styles.base,
        variantStyles.container,
        compact && styles.compact,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? theme.textOnAccent : theme.accent}
        />
      ) : (
        <Text
          style={[
            styles.text,
            variantStyles.text,
            compact && styles.textCompact,
            textStyle,
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  )
}

/** Icon-only button (e.g. back, gear). Use with children for the icon. */
type IconButtonProps = Omit<Props, 'title'> & {
  children: React.ReactNode
  accessibilityLabel: string
}

export function IconButton({
  variant = 'ghost',
  onPress,
  disabled = false,
  theme,
  style,
  children,
  accessibilityLabel,
}: IconButtonProps) {
  const variantStyles = getVariantStyles(theme, variant, false)
  return (
    <TouchableOpacity
      style={[styles.iconWrap, variantStyles.container, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  compact: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 36,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
  textCompact: {
    fontSize: 15,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
