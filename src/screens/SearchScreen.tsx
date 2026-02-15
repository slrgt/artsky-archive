import React, { useCallback, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  useColorScheme,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native'
import { searchActorsTypeahead, searchPostsByQuery, getPostMediaInfo } from '../lib/bsky'
import { colors } from '../theme'
import { Button } from '../components/Button'

type ActorHit = { did: string; handle?: string; displayName?: string; avatar?: string }
type PostView = { uri: string; author?: { handle?: string; displayName?: string; avatar?: string }; record?: { text?: string }; embed?: unknown }

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

export default function SearchScreen({ navigation }: { navigation: { navigate: (name: string, params?: object) => void } }) {
  const colorScheme = useColorScheme()
  const theme = colorScheme === 'dark' ? colors.dark : colors.light
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'people' | 'posts'>('people')
  const [people, setPeople] = useState<ActorHit[]>([])
  const [posts, setPosts] = useState<PostView[]>([])
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const searchPeople = useCallback(async () => {
    const q = query.trim().replace(/^@/, '')
    if (!q || q.length < 2) {
      setPeople([])
      return
    }
    setLoading(true)
    try {
      const res = await searchActorsTypeahead(q, 20)
      setPeople((res.actors ?? []) as ActorHit[])
    } catch {
      setPeople([])
    } finally {
      setLoading(false)
    }
  }, [query])

  const searchPosts = useCallback(async (isMore = false) => {
    const q = query.trim()
    if (!q) {
      setPosts([])
      return
    }
    if (!isMore) setLoading(true)
    else setLoadingMore(true)
    try {
      const res = await searchPostsByQuery(q, isMore ? cursor : undefined)
      setPosts((prev) => (isMore ? [...prev, ...(res.posts ?? [])] : (res.posts ?? []) as PostView[]))
      setCursor(res.cursor)
    } catch {
      if (!isMore) setPosts([])
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [query, cursor])

  const onSearch = useCallback(() => {
    if (mode === 'people') searchPeople()
    else searchPosts()
  }, [mode, searchPeople, searchPosts])

  const renderPerson = useCallback(
    ({ item }: { item: ActorHit }) => (
      <TouchableOpacity
        style={[styles.personRow, { borderBottomColor: theme.border }]}
        onPress={() => navigation.navigate('Profile', { handle: item.handle ?? item.did })}
      >
        {item.avatar ? (
          <Image source={{ uri: item.avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: theme.border }]} />
        )}
        <View style={styles.personMeta}>
          <Text style={[styles.displayName, { color: theme.text }]} numberOfLines={1}>
            {item.displayName ?? item.handle ?? 'Unknown'}
          </Text>
          <Text style={[styles.handle, { color: theme.muted }]} numberOfLines={1}>
            @{item.handle ?? ''}
          </Text>
        </View>
      </TouchableOpacity>
    ),
    [theme, navigation]
  )

  const renderPost = useCallback(
    ({ item }: { item: PostView }) => {
      const author = item.author
      const record = item.record as { text?: string; createdAt?: string } | undefined
      const media = getPostMediaInfo(item as import('../lib/bsky').PostView)
      return (
        <TouchableOpacity
          style={[styles.postRow, { borderBottomColor: theme.border }]}
          onPress={() => navigation.navigate('Post', { uri: item.uri })}
        >
          <View style={styles.postHeader}>
            {author?.avatar ? (
              <Image source={{ uri: author.avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: theme.border }]} />
            )}
            <View style={styles.personMeta}>
              <Text style={[styles.displayName, { color: theme.text }]} numberOfLines={1}>
                {author?.displayName ?? author?.handle ?? 'Unknown'}
              </Text>
              <Text style={[styles.handle, { color: theme.muted }]}>
                @{author?.handle ?? ''} · {record?.createdAt ? relativeTime(record.createdAt) : ''}
              </Text>
            </View>
          </View>
          {record?.text ? (
            <Text style={[styles.body, { color: theme.text }]} numberOfLines={3}>
              {record.text}
            </Text>
          ) : null}
          {media?.url ? <Image source={{ uri: media.url }} style={styles.thumb} resizeMode="cover" /> : null}
        </TouchableOpacity>
      )
    },
    [theme, navigation]
  )

  const loadMorePosts = useCallback(() => {
    if (!cursor || loadingMore || !query.trim()) return
    setLoadingMore(true)
    searchPostsByQuery(query.trim(), cursor)
      .then((res) => {
        setPosts((prev) => [...prev, ...((res.posts ?? []) as PostView[])])
        setCursor(res.cursor)
      })
      .finally(() => setLoadingMore(false))
  }, [query, cursor, loadingMore])

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <TextInput
        style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
        placeholder="Search people or posts..."
        placeholderTextColor={theme.muted}
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={onSearch}
        returnKeyType="search"
      />
      <View style={styles.tabRow}>
        <Button
          variant="tab"
          title="People"
          theme={theme}
          active={mode === 'people'}
          onPress={() => setMode('people')}
          style={styles.tab}
        />
        <Button
          variant="tab"
          title="Posts"
          theme={theme}
          active={mode === 'posts'}
          onPress={() => setMode('posts')}
          style={styles.tab}
        />
      </View>
      <Button
        variant="primary"
        title="Search"
        theme={theme}
        onPress={onSearch}
        style={styles.searchButton}
      />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : mode === 'people' ? (
        <FlatList
          data={people}
          renderItem={renderPerson}
          keyExtractor={(item) => item.did}
          ListEmptyComponent={query.trim().length >= 2 ? <Text style={[styles.empty, { color: theme.muted }]}>No people found</Text> : null}
        />
      ) : (
        <FlatList
          data={posts}
          renderItem={renderPost}
          keyExtractor={(item) => item.uri}
          onEndReached={loadMorePosts}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} color={theme.accent} /> : null}
          ListEmptyComponent={query.trim() ? <Text style={[styles.empty, { color: theme.muted }]}>No posts found</Text> : null}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  input: { margin: 16, borderWidth: 1, borderRadius: 12, fontSize: 16, paddingHorizontal: 16, paddingVertical: 12 },
  tabRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8 },
  tab: { flex: 1, marginHorizontal: 4 },
  searchButton: { marginHorizontal: 16, marginVertical: 8 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  personRow: { flexDirection: 'row', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  postRow: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  postHeader: { flexDirection: 'row', marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  personMeta: { marginLeft: 12, flex: 1, minWidth: 0 },
  displayName: { fontSize: 15, fontWeight: '600' },
  handle: { fontSize: 13, marginTop: 2 },
  body: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  thumb: { height: 180, width: '100%', borderRadius: 12 },
  empty: { textAlign: 'center', padding: 24, fontSize: 15 },
  footer: { padding: 16 },
})
