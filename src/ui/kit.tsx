import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import type { ReactNode } from 'react'
import { ActivityIndicator, Platform, Pressable, ScrollView, Switch, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useWide, useDockSpace } from '../lib/layout'
import { back, nav } from '../nav'
import { colors, font, fs, hexA } from './theme'

// Building blocks shared by the screens.

export type IconName = keyof typeof Ionicons.glyphMap

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets()
  const wide = useWide()
  return <View style={[{ flex: 1, backgroundColor: colors.bg, paddingTop: wide ? 0 : insets.top }, style]}>{children}</View>
}

/** A screen's top bar: back button (when there's somewhere to go back to), title, actions. */
export function Header({ title, subtitle, left, right, onBack, showBack, center, transparent }: { title?: string; subtitle?: string; left?: ReactNode; right?: ReactNode; onBack?: () => void; showBack?: boolean; center?: ReactNode; transparent?: boolean }) {
  const canBack = showBack ?? (nav.isReady() && nav.canGoBack())
  return (
    <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4, borderBottomWidth: transparent ? 0 : 1, borderColor: colors.separator, backgroundColor: transparent ? 'transparent' : colors.bg }}>
      {canBack && <IconButton icon="chevron-back" label="Back" onPress={onBack ?? back} size={24} />}
      {left}
      <View style={{ flex: 1, paddingHorizontal: canBack || left ? 2 : 8, minWidth: 0 }}>
        {center ?? (
          <>
            {title !== undefined && (
              <Text numberOfLines={1} style={{ color: colors.text, fontSize: fs(17), fontWeight: '700' }}>
                {title}
              </Text>
            )}
            {subtitle ? (
              <Text numberOfLines={1} style={{ color: colors.dim, fontSize: fs(12) }}>
                {subtitle}
              </Text>
            ) : null}
          </>
        )}
      </View>
      {right}
    </View>
  )
}

export function IconButton({ icon, onPress, label, color, size = 21, active, disabled, badge, style }: { icon: IconName; onPress?: () => void; label: string; color?: string; size?: number; active?: boolean; disabled?: boolean; badge?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      // Tooltip on desktop.
      {...(Platform.OS === 'web' ? ({ title: label } as object) : {})}
      hitSlop={6}
      style={({ pressed, hovered }: any) => [
        { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1, backgroundColor: active ? colors.accentSoft : pressed ? colors.field : hovered ? hexA(colors.dark ? '#ffffff' : '#000000', 0.06) : 'transparent' },
        style
      ]}
    >
      <Ionicons name={icon} size={size} color={color ?? (active ? colors.accentHi : colors.accentHi)} />
      {badge ? (
        <View style={{ position: 'absolute', top: 3, right: 2, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  )
}

export function Button({ title, onPress, icon, kind = 'primary', disabled, loading, style }: { title: string; onPress: () => void; icon?: IconName; kind?: 'primary' | 'secondary' | 'danger' | 'plain'; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle> }) {
  const bg = kind === 'primary' ? colors.accent : kind === 'danger' ? hexA(colors.danger, 0.14) : kind === 'secondary' ? colors.field : 'transparent'
  const fg = kind === 'primary' ? colors.onAccent : kind === 'danger' ? colors.danger : colors.accentHi
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed, hovered }: any) => [{ height: 42, paddingHorizontal: 18, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : hovered ? 0.92 : 1 }, style]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Ionicons name={icon} size={17} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: fs(15), fontWeight: '700' }}>{title}</Text>
    </Pressable>
  )
}

/** A rounded group of rows, like iOS Settings. */
export function Group({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 22 }}>
      {title && <Text style={{ color: colors.dim, fontSize: fs(12.5), fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginLeft: 16, marginBottom: 7 }}>{title}</Text>}
      <View style={{ backgroundColor: colors.card, borderRadius: 14, overflow: 'hidden', borderWidth: colors.dark ? 0 : 1, borderColor: colors.border }}>{children}</View>
      {footer && <Text style={{ color: colors.dim, fontSize: fs(12.5), marginHorizontal: 16, marginTop: 7, lineHeight: 17 }}>{footer}</Text>}
    </View>
  )
}

export function IconTile({ icon, color }: { icon: IconName; color: string }) {
  return (
    <View style={{ width: 29, height: 29, borderRadius: 7, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={17} color="#fff" />
    </View>
  )
}

export function Row({ title, sub, icon, iconColor, value, onPress, right, first, destructive, chevron = Boolean(onPress), selected }: { title: string; sub?: string; icon?: IconName; iconColor?: string; value?: string; onPress?: () => void; right?: ReactNode; first?: boolean; destructive?: boolean; chevron?: boolean; selected?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed, hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 14, gap: 12, backgroundColor: pressed ? colors.field : hovered && onPress ? hexA(colors.dark ? '#ffffff' : '#000000', 0.03) : 'transparent' })}>
      {icon && <IconTile icon={icon} color={iconColor ?? colors.accent} />}
      <View style={{ flex: 1, paddingVertical: 11, borderTopWidth: first ? 0 : 0, gap: 2 }}>
        <Text style={{ color: destructive ? colors.danger : colors.text, fontSize: fs(15.5) }}>{title}</Text>
        {sub ? <Text style={{ color: colors.dim, fontSize: fs(12.5), lineHeight: 17 }}>{sub}</Text> : null}
      </View>
      {value ? (
        <Text numberOfLines={1} style={{ color: colors.dim, fontSize: fs(15), maxWidth: 180 }}>
          {value}
        </Text>
      ) : null}
      {right}
      {selected && <Ionicons name="checkmark" size={19} color={colors.accentHi} />}
      {chevron && !selected && <Ionicons name="chevron-forward" size={17} color={colors.faint} />}
    </Pressable>
  )
}

export const Sep = ({ inset = 14 }: { inset?: number }) => <View style={{ height: 1, backgroundColor: colors.separator, marginLeft: inset }} />

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.field }} thumbColor="#ffffff" {...(Platform.OS === 'web' ? ({ activeThumbColor: '#ffffff' } as object) : {})} />
}

export function ToggleRow({ title, sub, value, onChange, icon, iconColor }: { title: string; sub?: string; value: boolean; onChange: (v: boolean) => void; icon?: IconName; iconColor?: string }) {
  return <Row title={title} sub={sub} icon={icon} iconColor={iconColor} right={<Toggle value={value} onChange={onChange} />} onPress={() => onChange(!value)} chevron={false} />
}

/** A scrolling settings-style page with a centered column. */
export function Page({ children, maxWidth = 680 }: { children: ReactNode; maxWidth?: number }) {
  const dock = useDockSpace()
  const insets = useSafeAreaInsets()
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, dock) + 40, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth }}>{children}</View>
    </ScrollView>
  )
}

export function Avatar({ uri, name, size = 28, square }: { uri?: string; name?: string; size?: number; square?: boolean }) {
  const letter = (name ?? '?').replace(/^(r|u)\//, '')[0]?.toUpperCase() ?? '?'
  // A stable colour per name for the placeholder.
  let h = 0
  for (const c of name ?? '') h = (h * 31 + c.charCodeAt(0)) % 360
  if (uri)
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: square ? size * 0.22 : size / 2, backgroundColor: colors.field }} contentFit="cover" recyclingKey={uri} />
  return (
    <View style={{ width: size, height: size, borderRadius: square ? size * 0.22 : size / 2, backgroundColor: `hsl(${h}, 55%, 48%)`, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.44 }}>{letter}</Text>
    </View>
  )
}

export function Pill({ text, color, bg, small }: { text: string; color?: string; bg?: string; small?: boolean }) {
  return (
    <View style={{ paddingHorizontal: small ? 5 : 7, paddingVertical: small ? 1 : 2, borderRadius: 5, backgroundColor: bg ?? colors.field, alignSelf: 'center' }}>
      <Text numberOfLines={1} style={{ color: color ?? colors.dim, fontSize: fs(small ? 10.5 : 11.5), fontWeight: '700' }}>
        {text}
      </Text>
    </View>
  )
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={{ padding: 40, alignItems: 'center', gap: 10 }}>
      <ActivityIndicator color={colors.accentHi} />
      {label && <Text style={{ color: colors.dim, fontSize: fs(13) }}>{label}</Text>}
    </View>
  )
}

export function Empty({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <View style={{ padding: 40, alignItems: 'center', gap: 8 }}>
      <Ionicons name={icon} size={42} color={colors.faint} />
      <Text style={{ color: colors.text, fontSize: fs(17), fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      {text && <Text style={{ color: colors.dim, fontSize: fs(14), textAlign: 'center', maxWidth: 380, lineHeight: 20 }}>{text}</Text>}
      {action && <View style={{ marginTop: 10 }}>{action}</View>}
    </View>
  )
}

export function ErrorView({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return <Empty icon="cloud-offline-outline" title="Couldn't load this" text={error} action={onRetry && <Button title="Try Again" kind="secondary" icon="refresh" onPress={onRetry} />} />
}

/** A segmented control (Apollo's sort and inbox tabs). */
export function Segmented<T extends string>({ value, options, onChange, style }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', backgroundColor: colors.field, borderRadius: 10, padding: 2 }, style]}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={{ flex: 1, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, backgroundColor: on ? colors.cardHi : 'transparent', shadowColor: '#000', shadowOpacity: on ? 0.15 : 0, shadowRadius: 3 }}>
            <Text numberOfLines={1} style={{ color: on ? colors.text : colors.dim, fontSize: fs(13), fontWeight: on ? '700' : '500' }}>
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function Field(props: TextInputProps & { icon?: IconName }) {
  const { icon, style, ...rest } = props
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.field, borderRadius: 11, paddingHorizontal: 10, gap: 6, minHeight: 40 }}>
      {icon && <Ionicons name={icon} size={17} color={colors.faint} />}
      <TextInput placeholderTextColor={colors.faint} {...rest} style={[{ flex: 1, color: colors.text, fontSize: fs(15), paddingVertical: 9, fontFamily: font.family, outlineStyle: 'none' } as object, style]} />
    </View>
  )
}

export function SectionTitle({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6 }}>
      <Text style={{ flex: 1, color: colors.dim, fontSize: fs(12.5), fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</Text>
      {right}
    </View>
  )
}
