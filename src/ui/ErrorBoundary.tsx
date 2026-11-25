import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { sendFeedback } from '../lib/feedback'
import { VERSION } from '../version'
import { colors, fs } from './theme'

// If drawing a page throws, a phone app with no boundary simply closes (issue #10 looked like that).
// This shows what went wrong instead, with Try Again and a way to report it with the details filled in.

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; stack: string }> {
  state = { error: null as Error | null, stack: '' }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ stack: (info.componentStack ?? '').trim().split('\n').slice(0, 8).join('\n') })
    console.error('Apollo Delta caught an error while drawing', error)
  }

  private report = () => {
    const e = this.state.error
    if (!e) return
    const details = `Apollo Delta showed "Something went wrong" with this error:\n\n${e.name}: ${e.message}\n\n${this.state.stack}`
    void sendFeedback('bug', `Something went wrong: ${e.message.slice(0, 80)}`, details, VERSION).catch(() => undefined)
  }

  render() {
    const e = this.state.error
    if (!e) return this.props.children
    const button = (label: string, onPress: () => void, primary: boolean) => (
      <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: primary ? colors.accent : colors.field, opacity: pressed ? 0.7 : 1 })}>
        <Text style={{ color: primary ? '#fff' : colors.text, fontWeight: '700', fontSize: fs(15) }}>{label}</Text>
      </Pressable>
    )
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 28, gap: 14 }}>
        <Text style={{ color: colors.text, fontSize: fs(22), fontWeight: '800' }}>Something went wrong</Text>
        <Text style={{ color: colors.dim, fontSize: fs(15), lineHeight: fs(21) }}>Apollo Delta hit a problem showing this page. Try again, and if it keeps happening, report it so it can be fixed.</Text>
        <ScrollView style={{ maxHeight: 160, backgroundColor: colors.card, borderRadius: 12 }} contentContainerStyle={{ padding: 12 }}>
          <Text selectable style={{ color: colors.faint, fontSize: fs(12.5), fontFamily: 'monospace' }}>
            {e.name}: {e.message}
          </Text>
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {button('Try Again', () => this.setState({ error: null, stack: '' }), true)}
          {button('Report It', this.report, false)}
        </View>
      </View>
    )
  }
}
