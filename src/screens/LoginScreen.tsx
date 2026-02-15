import React, { useState } from 'react'
import {
  Text,
  TextInput,
  StyleSheet,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { login as bskyLogin } from '../lib/bsky'
import { colors } from '../theme'
import { Button } from '../components/Button'

function toFriendlyError(err: unknown): string {
  const raw = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : ''
  const lower = raw.toLowerCase()
  if (lower.includes('invalid') && (lower.includes('password') || lower.includes('credentials')))
    return 'Wrong handle or password. Use your Bluesky handle (or email) and an App Password from Settings → App passwords.'
  if (lower.includes('network') || lower.includes('fetch')) return 'Connection problem. Check your internet and try again.'
  if (raw) return raw
  return 'Log in failed. Use your Bluesky handle (or email) and an App Password.'
}

export default function LoginScreen({
  navigation,
  route,
}: {
  navigation: { goBack: () => void; reset: (opts: { index: number; routes: { name: string }[] }) => void }
  route?: { params?: { onSuccess?: () => void } }
}) {
  const colorScheme = useColorScheme()
  const theme = colorScheme === 'dark' ? colors.dark : colors.light
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const onLogin = async () => {
    const id = identifier.trim().replace(/^@/, '')
    if (!id || !password.trim()) {
      setError('Enter your handle (or email) and App Password.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await bskyLogin(id, password.trim())
      const onSuccess = route?.params?.onSuccess
      if (onSuccess) onSuccess()
      else navigation.reset({ index: 0, routes: [{ name: 'Main' }] })
    } catch (e) {
      setError(toFriendlyError(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: theme.text }]}>Log in to ArtSky</Text>
        <Text style={[styles.hint, { color: theme.muted }]}>
          Use your Bluesky handle (or email) and an App Password from Bluesky → Settings → App passwords.
        </Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
          placeholder="Handle or email"
          placeholderTextColor={theme.muted}
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />
        <TextInput
          style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
          placeholder="App Password"
          placeholderTextColor={theme.muted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
        />
        {error ? <Text style={[styles.error, { color: theme.error }]}>{error}</Text> : null}
        <Button
          variant="primary"
          title="Log in"
          theme={theme}
          onPress={onLogin}
          disabled={loading}
          loading={loading}
          style={styles.button}
        />
        <Button
          variant="secondary"
          title="Cancel"
          theme={theme}
          onPress={() => navigation.goBack()}
          disabled={loading}
          style={styles.cancelButton}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24, paddingTop: 32 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  hint: { fontSize: 14, marginBottom: 24, lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  error: { fontSize: 14, marginBottom: 12 },
  button: { marginTop: 8, marginBottom: 8 },
  cancelButton: { marginTop: 8, marginBottom: 24 },
})
