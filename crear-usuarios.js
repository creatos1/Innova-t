
import { initializeApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, setDoc } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyDa86VtEK8XlPuNgjHhGJ-0rT7VKN_iSQ0",
  authDomain: "innova-t-f16bb.firebaseapp.com",
  projectId: "innova-t-f16bb",
  storageBucket: "innova-t-f16bb.firebasestorage.app",
  messagingSenderId: "488554463220",
  appId: "1:488554463220:web:8cae020e6851d8e3e803a1",
  measurementId: "G-W6YNZ74S6L"
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

async function crearUsuario(email, password, datosUsuario) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    const user = userCredential.user
    
    await setDoc(doc(db, 'usuarios', user.uid), {
      uid: user.uid,
      email: email,
      ...datosUsuario
    })
    
    console.log(`✅ Usuario creado exitosamente: ${email}`)
    console.log(`   UID: ${user.uid}`)
    return user.uid
  } catch (error) {
    console.error(`❌ Error al crear usuario ${email}:`, error.message)
    throw error
  }
}

async function main() {
  console.log('Creando usuarios...\n')
  
  // Crear usuario ADMIN
  await crearUsuario(
    'director@innova-t.com',
    'Password123!',
    {
      rol: 'admin',
      nombre: 'Director del Instituto',
      telefono: '1234567890'
    }
  )
  
  console.log()
  
  // Crear usuario ESTUDIANTE
  await crearUsuario(
    'juan.perez@ejemplo.com',
    'Password123!',
    {
      rol: 'estudiante',
      nombre: 'Juan Pérez García',
      idEstudiante: 'EST001',
      nivel: 'Pre-Starter',
      fechaRegistro: new Date().toISOString().split('T')[0],
      beca: true,
      horasAsistidasSemana: 0,
      horasTotalesSemana: 6
    }
  )
  
  console.log('\n✨ Todos los usuarios creados exitosamente!')
  process.exit(0)
}

main().catch((error) =&gt; {
  console.error('\n❌ Error general:', error)
  process.exit(1)
})

