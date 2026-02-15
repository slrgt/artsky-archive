import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Image, useColorScheme, ActivityIndicator, TouchableOpacity } from 'react-native'
import { getSession, publicAgent, agent, getPostMediaInfo, type PostView } from '../lib/bsky'
import { colors } from '../theme'

export default function PostDetailScreen({
  route,
  navigation,
}: {
  route: { params?: { uri?: string } }
  navigation: { navigate: (name: string, params?: object) => void }
}) {
  const uri = route.params?.uri
  const colorScheme = useColorScheme()
  const theme = colorScheme === 'dark' ? colors.dark : colors.light
  const [post, setPost] = useState<PostView | null>(null)
  const [loading, setLoading] = useState(!!uri)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!uri) {
      setError('Missing post URI')
      setLoading(false)
      return
    }
    let cancelled = false
    const api = getSession()?.accessJwt ? agent : publicAgent
    api.app.bsky.feed.getPostThread({ uri, depth: 0 })
      .then((res) => {
        const thread = res.data?.thread
        const postView = thread && typeof thread === 'object' && 'post' in thread
          ? (thread as { post: PostView }).post
          : null
        if (!cancelled && postView) setPost(postView)
        else if (!cancelled) setError('Post not found')
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Failed to load post')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [uri])

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    )
  }

  if (error || !post) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <Text style={[styles.error, { color: theme.error }]}>{error ?? 'Post not found'}</Text>
      </View>
    )
  }

  const author = post.author as { displayName?: string; handle?: string; avatar?: string } | undefined
  const record = post.record as { text?: string; createdAt?: string }
  const media = getPostMediaInfo(post)

  const onAuthorPress = () => {
    if (author?.handle) (navigation as { navigate: (name: string, params?: object) => void }).navigate('Profile', { handle: author.handle })
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.header} onPress={onAuthorPress}>
        {author?.avatar ? (
          <Image source={{ uri: author.avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: theme.border }]} />
        )}
        <View style={styles.meta}>
          <Text style={[styles.displayName, { color: theme.text }]}>{author?.displayName ?? author?.handle ?? 'Unknown'}</Text>
          <Text style={[styles.handle, { color: theme.muted }]}>@{author?.handle ?? ''}</Text>
        </View>
      </TouchableOpacity>
      {record?.text ? (
        <Text style={[styles.body, { color: theme.text }]}>{record.text}</Text>
      ) : null}
      {media?.url ? (
        <Image source={{ uri: media.url }} style={styles.media} resizeMode="cover" />
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', marginBottom: 16 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: {},
  meta: { marginLeft: 12, justifyContent: 'center' },
  displayName: { fontSize: 17, fontWeight: '600' },
  handle: { fontSize: 14, marginTop: 2 },
  body: { fontSize: 16, lineHeight: 24, marginBottom: 16 },
  media: { height: 280, width: '100%', borderRadius: 12 },
  error: { fontSize: 16 },
})
