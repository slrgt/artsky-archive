import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Image,
  useColorScheme,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
} from 'react-native'
import { publicAgent, getPostMediaInfo, getSession, agent, type PostView } from '../lib/bsky'
import { colors } from '../theme'
import { Button } from '../components/Button'

type ProfileView = {
  did: string
  handle?: string
  displayName?: string
  description?: string
  avatar?: string
  viewer?: { following?: string }
  followersCount?: number
  followsCount?: number
}

function PostRow({
  post,
  theme,
  onPress,
  onAuthorPress,
}: {
  post: PostView
  theme: typeof colors.dark
  onPress: () => void
  onAuthorPress: () => void
}) {
  const author = post.author as { displayName?: string; handle?: string; avatar?: string } | undefined
  const record = post.record as { text?: string }
  const media = getPostMediaInfo(post)
  return (
    <TouchableOpacity style={[styles.row, { borderBottomColor: theme.border }]} onPress={onPress} activeOpacity={0.7}>
      <TouchableOpacity style={styles.rowHeader} onPress={onAuthorPress}>
        {author?.avatar ? (
          <Image source={{ uri: author.avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: theme.border }]} />
        )}
        <View style={styles.meta}>
          <Text style={[styles.displayName, { color: theme.text }]} numberOfLines={1}>
            {author?.displayName ?? author?.handle ?? 'Unknown'}
          </Text>
          <Text style={[styles.handle, { color: theme.muted }]} numberOfLines={1}>
            @{author?.handle ?? ''}
          </Text>
        </View>
      </TouchableOpacity>
      {record?.text ? (
        <Text style={[styles.body, { color: theme.text }]} numberOfLines={4}>
          {record.text}
        </Text>
      ) : null}
      {media?.url ? <Image source={{ uri: media.url }} style={styles.thumb} resizeMode="cover" /> : null}
    </TouchableOpacity>
  )
}

export default function ProfileScreen({
  route,
  navigation,
}: {
  route: { params?: { handle?: string } }
  navigation: { navigate: (name: string, params?: object) => void }
}) {
  const handle = route.params?.handle
  const colorScheme = useColorScheme()
  const theme = colorScheme === 'dark' ? colors.dark : colors.light
  const [profile, setProfile] = useState<ProfileView | null>(null)
  const [posts, setPosts] = useState<PostView[]>([])
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(!!handle)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [followLoading, setFollowLoading] = useState(false)
  const [followUriOverride, setFollowUriOverride] = useState<string | null>(null)

  const session = getSession()
  const isOwnProfile = !!session?.did && session.did === profile?.did
  const followingUri = followUriOverride ?? profile?.viewer?.following ?? null
  const isFollowing = !!followingUri

  useEffect(() => {
    if (!handle) {
      setError('No profile specified')
      setLoading(false)
      return
    }
    let cancelled = false
    const api = getSession()?.accessJwt ? agent : publicAgent
    api.getProfile({ actor: handle })
      .then((res) => {
        if (cancelled) return
        const p = res.data as ProfileView
        setProfile(p)
        setError(null)
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Failed to load profile')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [handle])

  const loadFeed = useCallback(
    async (isRefresh: boolean) => {
      if (!profile?.did) return
      const nextCursor = isRefresh ? undefined : cursor
      const api = getSession()?.accessJwt ? agent : publicAgent
      try {
        const res = await api.getAuthorFeed({ actor: profile.did, limit: 20, cursor: nextCursor })
        setPosts((prev) => (isRefresh ? res.data.feed.map((f: { post: PostView }) => f.post) : [...prev, ...res.data.feed.map((f: { post: PostView }) => f.post)]))
        setCursor(res.data.cursor ?? undefined)
      } catch {
        // ignore
      } finally {
        setLoadingMore(false)
      }
    },
    [profile?.did, cursor]
  )

  useEffect(() => {
    if (!profile?.did) return
    loadFeed(true)
  }, [profile?.did])

  const onEndReached = useCallback(() => {
    if (loadingMore || !cursor) return
    setLoadingMore(true)
    loadFeed(false)
  }, [cursor, loadingMore, loadFeed])

  const handleFollow = useCallback(async () => {
    if (!profile || followLoading || isFollowing) return
    setFollowLoading(true)
    try {
      const res = await agent.follow(profile.did)
      setFollowUriOverride(res.uri)
    } catch {
      // leave state unchanged
    } finally {
      setFollowLoading(false)
    }
  }, [profile, followLoading, isFollowing])

  const handleUnfollow = useCallback(async () => {
    if (!followingUri || followLoading) return
    setFollowLoading(true)
    try {
      await agent.deleteFollow(followingUri)
      setFollowUriOverride(null)
      setProfile((prev) =>
        prev ? { ...prev, viewer: { ...prev.viewer, following: undefined } } : null,
      )
    } catch {
      // leave state unchanged
    } finally {
      setFollowLoading(false)
    }
  }, [followingUri, followLoading])

  const renderItem = useCallback(
    ({ item }: { item: PostView }) => (
      <PostRow
        post={item}
        theme={theme}
        onPress={() => navigation.navigate('Post', { uri: item.uri })}
        onAuthorPress={() => {}}
      />
    ),
    [theme, navigation]
  )

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    )
  }

  if (error || !profile) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <Text style={[styles.error, { color: theme.error }]}>{error ?? 'Profile not found'}</Text>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        {profile.avatar ? (
          <Image source={{ uri: profile.avatar }} style={styles.avatarLarge} />
        ) : (
          <View style={[styles.avatarLarge, { backgroundColor: theme.border }]} />
        )}
        <Text style={[styles.profileName, { color: theme.text }]}>{profile.displayName ?? profile.handle ?? 'Unknown'}</Text>
        <Text style={[styles.profileHandle, { color: theme.muted }]}>@{profile.handle ?? ''}</Text>
        {profile.description ? (
          <Text style={[styles.bio, { color: theme.text }]}>{profile.description}</Text>
        ) : null}
        {/* Follow / Unfollow (when viewing another user and logged in) */}
        {session?.accessJwt && !isOwnProfile && (
          <View style={styles.followRow}>
            {isFollowing ? (
              <Button
                variant="secondary"
                title={followLoading ? 'Unfollowing…' : 'Unfollow'}
                theme={theme}
                onPress={handleUnfollow}
                disabled={followLoading}
                loading={followLoading}
                style={styles.followBtn}
              />
            ) : (
              <Button
                variant="primary"
                title={followLoading ? 'Following…' : 'Follow'}
                theme={theme}
                onPress={handleFollow}
                disabled={followLoading}
                loading={followLoading}
                style={styles.followBtn}
              />
            )}
          </View>
        )}
        {/* Edit profile (own profile) */}
        {session?.accessJwt && isOwnProfile && (
          <Button
            variant="secondary"
            title="Edit profile"
            theme={theme}
            onPress={() => {}}
            style={styles.editProfileBtn}
          />
        )}
        {/* Followers / Following row (like web followListBtn) */}
        <View style={styles.followListRow}>
          <Button
            variant="ghost"
            title={`Followers${profile.followersCount != null ? ` (${profile.followersCount})` : ''}`}
            theme={theme}
            onPress={() => {}}
            compact
            style={styles.followListBtn}
          />
          <Button
            variant="ghost"
            title={`Following${profile.followsCount != null ? ` (${profile.followsCount})` : ''}`}
            theme={theme}
            onPress={() => {}}
            compact
            style={styles.followListBtn}
          />
        </View>
      </View>
      <FlatList
        data={posts}
        renderItem={renderItem}
        keyExtractor={(item) => item.uri}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarLarge: { width: 80, height: 80, borderRadius: 40, marginBottom: 12 },
  profileName: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  profileHandle: { fontSize: 15, marginBottom: 8 },
  bio: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 12 },
  followRow: { flexDirection: 'row', marginTop: 8, marginBottom: 8 },
  followBtn: { minWidth: 120 },
  editProfileBtn: { marginTop: 8, marginBottom: 8 },
  followListRow: { flexDirection: 'row', marginTop: 8 },
  followListBtn: { flex: 1, marginHorizontal: 4 },
  row: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  rowHeader: { flexDirection: 'row', marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  meta: { marginLeft: 12, justifyContent: 'center', flex: 1 },
  displayName: { fontSize: 15, fontWeight: '600' },
  handle: { fontSize: 13, marginTop: 2 },
  body: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  thumb: { height: 200, width: '100%', borderRadius: 12 },
  footer: { padding: 16, alignItems: 'center' },
  error: { fontSize: 16 },
})
