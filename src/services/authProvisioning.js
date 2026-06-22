import { deleteApp, initializeApp } from 'firebase/app'
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth'
import { firebaseConfig } from '../firebase'

export async function createAuthUser(email, password) {
  const appName = `provisioning-${Date.now()}`
  const app = initializeApp(firebaseConfig, appName)
  const auth = getAuth(app)

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password)
    await signOut(auth)
    return credential.user.uid
  } finally {
    await deleteApp(app)
  }
}
