import admin from 'firebase-admin'

function parseServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim()
    const json = raw.startsWith('{')
      ? raw
      : Buffer.from(raw, 'base64').toString('utf8')
    return JSON.parse(json)
  }

  if (
    process.env.FIREBASE_PROJECT_ID
    && process.env.FIREBASE_CLIENT_EMAIL
    && process.env.FIREBASE_PRIVATE_KEY
  ) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    }
  }

  return null
}

function getAdminApp() {
  if (admin.apps.length) return admin.app()

  const serviceAccount = parseServiceAccount()
  if (!serviceAccount) {
    throw new Error('Falta configurar credenciales privadas del servidor.')
  }

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  })
}

async function requireAdmin(request) {
  const authHeader = request.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!token) {
    const error = new Error('Sesion no autorizada.')
    error.statusCode = 401
    throw error
  }

  const app = getAdminApp()
  const decoded = await admin.auth(app).verifyIdToken(token)
  const profile = await admin.firestore(app).collection('usuarios').doc(decoded.uid).get()
  const role = profile.exists ? (profile.data().rol || profile.data().role) : ''

  if (role !== 'admin') {
    const error = new Error('Solo admin puede cambiar correos de acceso.')
    error.statusCode = 403
    throw error
  }

  return decoded
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Metodo no permitido.' })
  }

  let body = {}
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : request.body
  } catch {
    return response.status(400).json({ error: 'Body JSON invalido.' })
  }

  try {
    await requireAdmin(request)

    const uid = String(body?.uid || '').trim()
    const email = String(body?.email || '').trim().toLowerCase()

    if (!uid || !email) {
      return response.status(400).json({ error: 'Falta uid o correo nuevo.' })
    }

    const app = getAdminApp()
    await admin.auth(app).updateUser(uid, {
      email,
      emailVerified: false
    })

    response.setHeader('Cache-Control', 'no-store')
    return response.status(200).json({ ok: true, uid, email })
  } catch (error) {
    const code = error.code || ''
    const duplicateEmail = code === 'auth/email-already-exists'
      || code === 'auth/email-already-in-use'
    const userNotFound = code === 'auth/user-not-found'

    return response.status(error.statusCode || (duplicateEmail ? 409 : userNotFound ? 404 : 500)).json({
      error: duplicateEmail
        ? 'Ese correo ya esta usado por otra cuenta.'
        : userNotFound
          ? 'No se encontro el usuario en Authentication.'
          : error.message || 'No se pudo cambiar el correo en Authentication.'
    })
  }
}
