import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'

export function useAuthProfile() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async currentUser => {
      setLoading(true)
      setUser(currentUser)
      setProfile(null)
      setError('')

      if (!currentUser) {
        setLoading(false)
        return
      }

      try {
        const profileSnapshot = await getDoc(doc(db, 'usuarios', currentUser.uid))
        if (profileSnapshot.exists()) {
          setProfile({
            uid: currentUser.uid,
            email: currentUser.email,
            ...profileSnapshot.data()
          })
        } else {
          setError('Tu usuario existe en Auth, pero falta usuarios/{uid} en Firestore.')
        }
      } catch (profileError) {
        console.warn(profileError)
        setError('No se pudo leer tu perfil de usuario en Firestore.')
      } finally {
        setLoading(false)
      }
    })

    return unsubscribe
  }, [])

  return { user, profile, loading, error }
}
