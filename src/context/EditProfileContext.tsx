import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import EditProfileModal from '../components/EditProfileModal'

type EditProfileContextValue = {
  openEditProfile: () => void
  registerOnSaved: (cb: () => void) => void
  editSavedVersion: number
}

const EditProfileContext = createContext<EditProfileContextValue | null>(null)

export function EditProfileProvider({ children }: { children: ReactNode }) {
  const [editProfileOpen, setEditProfileOpen] = useState(false)
  const [editSavedVersion, setEditSavedVersion] = useState(0)
  const savedCbRef = useRef<(() => void) | null>(null)

  const openEditProfile = useCallback(() => {
    setEditProfileOpen(true)
  }, [])

  const registerOnSaved = useCallback((cb: () => void) => {
    savedCbRef.current = cb
  }, [])

  const handleSaved = useCallback(() => {
    setEditProfileOpen(false)
    setEditSavedVersion((v) => v + 1)
    savedCbRef.current?.()
  }, [])

  const value: EditProfileContextValue = {
    openEditProfile,
    registerOnSaved,
    editSavedVersion,
  }

  return (
    <EditProfileContext.Provider value={value}>
      {children}
      {editProfileOpen && (
        <EditProfileModal
          onClose={() => setEditProfileOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </EditProfileContext.Provider>
  )
}

export function useEditProfile(): EditProfileContextValue | null {
  return useContext(EditProfileContext)
}
