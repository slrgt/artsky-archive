/**
 * Native stub: OAuth is browser-only. App-password login works on RN.
 */
export type OAuthSession = { did: string; signOut(): Promise<void> }

export async function getOAuthClient(): Promise<never> {
  throw new Error('OAuth is only available in the browser')
}

export async function initOAuth(): Promise<undefined> {
  return undefined
}

export async function restoreOAuthSession(_did: string): Promise<null> {
  return null
}

export async function signInWithOAuthRedirect(_handle: string): Promise<never> {
  throw new Error('OAuth is only available in the browser')
}
