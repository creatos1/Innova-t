# Innova-T English Institute

Sistema para administrar alumnos, teachers, reservas, clases, pagos, asistencias y calificaciones del instituto.

## Que incluye

- Panel de administrador.
- Panel de estudiante.
- Panel de teacher.
- Reservas de clases.
- Formacion de clases por admin con apoyo de IA.
- Asignacion de teacher y classroom.
- Control de pagos.
- Control de asistencias.
- Calificaciones oral y escrita por nivel.
- Catalogo de niveles y lecciones reales.
- Pantalla Show time para mostrar salon y horario.

## Accesos

- Admin: registra alumnos, teachers, pagos, lecciones, classrooms y clases.
- Estudiante: reserva clases, ve pagos, asistencias, informacion y calificaciones.
- Teacher: ve sus clases y pasa asistencia.

Los alumnos y teachers crean su contrasena desde el boton **Crea tu contrasena** usando su ID o correo registrado.

## Reglas principales

- Cada clase dura 1 hora.
- Cada clase acepta maximo 8 alumnos.
- El alumno reserva solo para el dia siguiente.
- El alumno puede reservar de 1 a 3 horas por dia.
- El alumno debe cumplir 6 horas por semana.
- El admin asigna teacher y classroom.
- El teacher pasa asistencia.
- Solo el admin captura calificaciones.

## Horarios

- Lunes: 1:00 p.m. a 9:00 p.m.
- Martes a viernes: 9:00 a.m. a 2:00 p.m. y 4:00 p.m. a 9:00 p.m.
- Sabado: 8:00 a.m. a 2:00 p.m.
- Domingo: cerrado.

## Instalar

```powershell
npm install
```

## Correr en la computadora

```powershell
npm run dev
```

Despues abre la URL que aparece en la terminal, normalmente:

```text
http://127.0.0.1:5173
```

Para probar IA con las mismas rutas que Vercel:

```powershell
npm run dev:vercel
```

## Crear version para produccion

```powershell
npm run build
```

## Configuracion necesaria

Crea un archivo `.env.local` usando `.env.example` como guia.

Para Vercel, agrega las mismas variables en:

```text
Vercel > Project > Settings > Environment Variables
```

Variables publicas del frontend:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`
- `VITE_ENABLE_MISTRAL_AI=true`
- `VITE_MISTRAL_PROXY_URL=/api/mistral-class-plan`
- `VITE_MISTRAL_MONTHLY_LIMIT=1000`

Variables privadas del servidor:

- `MISTRAL_API_KEY`
- `MISTRAL_MODEL=mistral-small-latest`
- `MISTRAL_API_URL=https://api.mistral.ai/v1/chat/completions`
- `FIREBASE_SERVICE_ACCOUNT_JSON`

No subas `.env`, `.env.local` ni `serviceAccountKey.json` a GitHub.

## Publicar reglas de Firestore

```powershell
npm run deploy:rules
```

Si aparece un error de permisos en la app, normalmente falta publicar estas reglas o falta asignar bien el rol del usuario.

## Subir catalogo de lecciones

```powershell
npm run seed:catalogo
```

Esto carga los niveles y lecciones reales del instituto.

## Crear usuarios iniciales

```powershell
npm run crear-usuarios:admin-sdk
```

Para crear muchos estudiantes:

```powershell
npm run crear-estudiantes
```

## Borrar usuarios de Auth

Cuando se elimina un alumno o teacher desde admin, el sistema limpia sus datos del sistema.

Para terminar de borrar el usuario de acceso:

```powershell
npm run procesar-borrados-auth
```

## Datos que debe entregar el cliente

- Lista de alumnos: ID, nombre, correo, telefono, nivel actual, leccion actual y fecha de inscripcion.
- Lista de teachers: ID, nombre y correo.
- Monto de mensualidad.
- Fechas o dias bloqueados por vacaciones.
- Lista de classrooms.
- Administradores autorizados.
- Historial previo de pagos, asistencias, lecciones tomadas y calificaciones, si existe.

## Deploy en Vercel

1. Subir el proyecto a GitHub.
2. Crear proyecto en Vercel.
3. Usar:
   - Framework: Vite
   - Install Command: `npm install`
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Agregar las variables de entorno en Vercel.
5. Hacer deploy.
6. Agregar el dominio de Vercel en Firebase Authentication.
7. Publicar reglas de Firestore.

## IA con Mistral

El sistema intenta usar Mistral primero para sugerir clases.

Para verificarlo:

```text
https://tu-dominio.vercel.app/api/mistral-class-plan
```

Debe responder algo como:

```json
{
  "ok": true,
  "configured": true,
  "model": "mistral-small-latest"
}
```

Si `configured` sale `false`, falta `MISTRAL_API_KEY` en Vercel.

## Comandos rapidos

```powershell
npm install
npm run dev
npm run build
npm run deploy:rules
npm run seed:catalogo
npm run crear-usuarios:admin-sdk
npm run crear-estudiantes
npm run procesar-borrados-auth
```
