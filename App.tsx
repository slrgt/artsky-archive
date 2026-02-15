import React, { Component } from 'react'
import { StatusBar } from 'expo-status-bar'
import { DefaultTheme, NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useColorScheme, View, Text, StyleSheet, Platform } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { colors } from './src/theme'
import FeedScreen from './src/screens/FeedScreen'
import PostDetailScreen from './src/screens/PostDetailScreen'
import SearchScreen from './src/screens/SearchScreen'
import LoginScreen from './src/screens/LoginScreen'
import ProfileScreen from './src/screens/ProfileScreen'

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      const theme = colors.dark
      return (
        <View style={[styles.errorRoot, { backgroundColor: theme.bg }]}>
          <Text style={[styles.errorTitle, { color: theme.error }]}>Something went wrong</Text>
          <Text style={[styles.errorText, { color: theme.text }]}>{this.state.error.message}</Text>
          <Text style={[styles.errorStack, { color: theme.muted }]} numberOfLines={20}>
            {this.state.error.stack}
          </Text>
        </View>
      )
    }
    return this.props.children
  }
}

const styles = StyleSheet.create({
  errorRoot: { flex: 1, padding: 24, justifyContent: 'center' },
  errorTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  errorText: { fontSize: 14, marginBottom: 12 },
  errorStack: { fontSize: 12, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
})

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

function MainTabs() {
  const colorScheme = useColorScheme()
  const theme = colorScheme === 'dark' ? colors.dark : colors.light
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.text,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.muted,
      }}
    >
      <Tab.Screen name="Feed" component={FeedScreen} options={{ title: 'Feed' }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ title: 'Search' }} />
    </Tab.Navigator>
  )
}

export default function App() {
  const colorScheme = useColorScheme()
  const theme = colorScheme === 'dark' ? colors.dark : colors.light
  const navTheme = {
    ...DefaultTheme,
    dark: colorScheme === 'dark',
    colors: {
      ...DefaultTheme.colors,
      primary: theme.accent,
      background: theme.bg,
      card: theme.surface,
      text: theme.text,
      border: theme.border,
      notification: theme.accent,
    },
  }

  const rootStyle = {
    flex: 1,
    backgroundColor: theme.bg,
    minHeight: Platform.OS === 'web' ? ('100vh' as const) : undefined,
  }

  return (
    <ErrorBoundary>
      <View style={rootStyle}>
        <SafeAreaProvider>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          <NavigationContainer theme={navTheme}>
            <Stack.Navigator
              screenOptions={{
                headerStyle: { backgroundColor: theme.surface },
                headerTintColor: theme.text,
                contentStyle: { backgroundColor: theme.bg },
              }}
            >
              <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
              <Stack.Screen name="Post" component={PostDetailScreen} options={{ title: 'Post' }} />
              <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Log in' }} />
              <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
            </Stack.Navigator>
          </NavigationContainer>
        </SafeAreaProvider>
      </View>
    </ErrorBoundary>
  )
}
