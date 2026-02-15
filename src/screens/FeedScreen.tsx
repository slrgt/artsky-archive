import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  useColorScheme,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { agent, getGuestFeed, getPostMediaInfo, getSession, resumeSession, logout, type TimelineItem } from '../lib/bsky'
import { colors } from '../theme'
import { Button } from '../components/Button'

const LIMIT = 20
const REASON_REPOST = 'app.bsky.feed.defs#reasonRepost'

function relativeTime(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const sec = Math.floor((now - d.getTime()) / 1000)
  if (sec < 60) return 'now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`
  if (sec < 2592000) return `${Math.floor(sec / 86400)}d`
  return d.toLocaleDateString()
}

function PostRow({
  item,
  onPress,
  onAuthorPress,
  theme,
}: {
  item: TimelineItem
  onPress: () => void
  onAuthorPress: (handle: string) => void
  theme: typeof colors.dark
}) {
  const post = item.post
  const author = post.author as { displayName?: string; handle?: string; avatar?: string } | undefined
  const record = post.record as { text?: string; createdAt?: string }
  const media = getPostMediaInfo(post)
  const displayName = author?.displayName ?? author?.handle ?? 'Unknown'
  const handle = author?.handle ?? ''
  const isRepost = (item.reason as { $type?: string })?.$type === REASON_REPOST
  const reposter = isRepost ? (item.reason as { by?: { displayName?: string; handle?: string } })?.by : null
  const time = record?.createdAt ? relativeTime(record.createdAt) : ''

  return (
    <TouchableOpacity style={[styles.row, { borderBottomColor: theme.border }]} onPress={onPress} activeOpacity={0.7}>
      {isRepost && reposter ? (
        <Text style={[styles.repostLabel, { color: theme.muted }]}>
          Reposted by {reposter.displayName ?? reposter.handle ?? 'unknown'}
        </Text>
      ) : null}
      <TouchableOpacity style={styles.rowHeader} onPress={() => handle && onAuthorPress(handle)}>
        {author?.avatar ? (
          <Image source={{ uri: author.avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: theme.border }]} />
        )}
        <View style={styles.rowMeta}>
          <Text style={[styles.displayName, { color: theme.text }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.handle, { color: theme.muted }]} numberOfLines={1}>
            @{handle} {time ? `· ${time}` : ''}
          </Text>
        </View>
      </TouchableOpacity>
      {record?.text ? (
        <Text style={[styles.body, { color: theme.text }]} numberOfLines={5}>
          {record.text}
        </Text>
      ) : null}
      {media?.url ? (
        <Image
          source={{ uri: media.url }}
          style={styles.thumb}
          resizeMode="cover"
        />
      ) : null}
    </TouchableOpacity>
  )
}

export default function FeedScreen({ navigation }: { navigation: { navigate: (name: string, params?: object) => void } }) {
  const colorScheme = useColorScheme()
  const theme = colorScheme === 'dark' ? colors.dark : colors.light
  const [feed, setFeed] = useState<TimelineItem[]>([])
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [session, setSession] = useState<ReturnType<typeof getSession>>(null)

  const load = useCallback(async (isRefresh: boolean) => {
    const nextCursor = isRefresh ? undefined : cursor
    const session = getSession()
    try {
      if (session?.accessJwt) {
        const res = await agent.getTimeline({ limit: LIMIT, cursor: nextCursor })
        setFeed((prev) => (isRefresh ? res.data.feed : [...prev, ...res.data.feed]))
        setCursor(res.data.cursor ?? undefined)
      } else {
        const { feed: next, cursor: nextC } = await getGuestFeed(LIMIT, nextCursor)
        setFeed((prev) => (isRefresh ? next : [...prev, ...next]))
        setCursor(nextC)
      }
    } catch (e) {
      console.warn('Feed load error', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
    }
  }, [cursor])

  const loadRef = useRef(load)
  loadRef.current = load

  useFocusEffect(
    useCallback(() => {
      const s = getSession()
      setSession(s)
      if (sessionReady && s?.accessJwt) loadRef.current(true)
    }, [sessionReady])
  )

  useEffect(() => {
    let mounted = true
    resumeSession().then(() => {
      if (mounted) setSessionReady(true)
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!sessionReady) return
    setLoading(true)
    load(true)
  }, [sessionReady])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    setCursor(undefined)
    load(true)
  }, [load])

  const onEndReached = useCallback(() => {
    if (loadingMore || !cursor) return
    setLoadingMore(true)
    load(false)
  }, [cursor, loadingMore, load])

  const renderItem = useCallback(
    ({ item }: { item: TimelineItem }) => (
      <PostRow
        item={item}
        theme={theme}
        onPress={() => navigation.navigate('Post', { uri: item.post.uri })}
        onAuthorPress={(handle) => navigation.navigate('Profile', { handle })}
      />
    ),
    [theme, navigation]
  )

  const keyExtractor = useCallback((item: TimelineItem) => item.post.uri, [])

  if (!sessionReady) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    )
  }

  if (loading && feed.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Feed</Text>
        {session?.accessJwt ? (
          <Button
            variant="ghost"
            title="Log out"
            theme={theme}
            onPress={() => logout().then(() => load(true))}
            compact
          />
        ) : (
          <Button
            variant="ghost"
            title="Log in"
            theme={theme}
            onPress={() => navigation.navigate('Login')}
            compact
          />
        )}
      </View>
      <FlatList
        data={feed}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" color={theme.accent} />
            </View>
          ) : null
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  repostLabel: { fontSize: 12, marginBottom: 4 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  row: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowHeader: { flexDirection: 'row', marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: {},
  rowMeta: { flex: 1, marginLeft: 12, justifyContent: 'center', minWidth: 0 },
  displayName: { fontSize: 15, fontWeight: '600' },
  handle: { fontSize: 13, marginTop: 2 },
  body: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  thumb: { height: 200, width: '100%', borderRadius: 12 },
  footer: { padding: 16, alignItems: 'center' },
})
