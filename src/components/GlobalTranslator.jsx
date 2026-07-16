import { useEffect } from 'react'
import { useUiLanguage } from './SystemControls'

const TRANSLATIONS = [
  ['Operacion academica', 'Academic operation'],
  ['Panel administrativo', 'Admin dashboard'],
  ['Semana', 'Week'],
  ['Admin controla datos', 'Admin controls data'],
  ['alumnos reservan y teachers pasan lista', 'students book classes and teachers take attendance'],
  ['Estudiantes activos', 'Active students'],
  ['Perfiles con seguimiento', 'Tracked profiles'],
  ['Horarios por formar', 'Schedules to form'],
  ['reservas pendientes', 'pending bookings'],
  ['Clases programadas', 'Scheduled classes'],
  ['Con teacher asignado', 'With assigned teacher'],
  ['Pagos vencidos', 'Overdue payments'],
  ['Impactan continuidad', 'Affect continuity'],
  ['Uso de IA', 'AI usage'],
  ['Conteo mensual de sugerencias generadas desde este sistema.', 'Monthly count of suggestions generated from this system.'],
  ['IA respondio', 'AI responded'],
  ['Deteccion local', 'Local detection'],
  ['Ultimo origen', 'Last source'],
  ['Si el asistente no responde, el sistema sigue trabajando con reglas academicas y lo marca como deteccion local.', 'If the assistant does not respond, the system keeps working with academic rules and marks it as local detection.'],
  ['Ultima actividad', 'Last activity'],
  ['Diagnostico simple para saber si la sugerencia vino del asistente o del acomodo local.', 'Simple diagnosis to know whether the suggestion came from the assistant or local grouping.'],
  ['Origen', 'Source'],
  ['Modelo', 'Model'],
  ['Estado', 'Status'],
  ['Fallos del mes', 'Monthly failures'],
  ['Resultado De IA', 'AI result'],
  ['Resultado de IA', 'AI result'],
  ['Sin actividad', 'No activity'],
  ['Sistema', 'System'],
  ['Reservas sin teacher', 'Bookings without teacher'],
  ['Admin forma grupos y asigna profesor.', 'Admin forms groups and assigns teacher.'],
  ['Show time', 'Show time'],
  ['Cambiar a teacher', 'Switch to teacher'],
  ['Cambiar a admin', 'Switch to admin'],
  ['Modo blanco', 'Light mode'],
  ['Modo oscuro', 'Dark mode'],
  ['Preferencias de interfaz', 'Interface preferences'],
  ['Cerrar sesion', 'Log out'],
  ['Inicia sesion', 'Log in'],
  ['Ir al login', 'Go to login'],
  ['Necesitas iniciar sesion', 'You need to log in'],
  ['Entra con un usuario autorizado para abrir el panel administrativo.', 'Use an authorized account to open the admin dashboard.'],
  ['Acceso administrativo requerido', 'Admin access required'],
  ['Tu usuario necesita rol admin', 'Your user needs admin role'],
  ['Teachers usan su propio panel.', 'Teachers use their own panel.'],
  ['RESERVAS', 'BOOKINGS'],
  ['ESTUDIANTES', 'STUDENTS'],
  ['PAGOS', 'PAYMENTS'],
  ['TEACHERS', 'TEACHERS'],
  ['ASISTENCIAS', 'ATTENDANCE'],
  ['LECCIONES', 'LESSONS'],
  ['ROLES', 'ROLES'],
  ['Nuevo estudiante', 'New student'],
  ['Admin crea el registro. El alumno crea su contrasena desde el login.', 'Admin creates the record. The student creates their password from login.'],
  ['ID', 'ID'],
  ['Nombre completo', 'Full name'],
  ['Correo', 'Email'],
  ['Telefono', 'Phone'],
  ['Sin correo', 'No email'],
  ['Nivel actual', 'Current level'],
  ['Leccion actual', 'Current lesson'],
  ['Fecha de inscripcion', 'Enrollment date'],
  ['Seleccionar leccion', 'Select lesson'],
  ['Guardar estudiante', 'Save student'],
  ['Nombre A-Z', 'Name A-Z'],
  ['Click en un estudiante para abrir su perfil.', 'Click a student to open their profile.'],
  ['Selecciona un estudiante para ver su perfil.', 'Select a student to view their profile.'],
  ['Perfil de estudiante', 'Student profile'],
  ['Estado de beca, contacto, pagos, avance y clases.', 'Scholarship status, contact, payments, progress and classes.'],
  ['Pago', 'Payment'],
  ['Horas semana', 'Weekly hours'],
  ['Faltas sin aviso', 'Unexcused absences'],
  ['Inscripcion', 'Enrollment'],
  ['Capturada', 'Captured'],
  ['Lecciones registradas', 'Registered lessons'],
  ['temas registrados para este alumno', 'topics registered for this student'],
  ['Calificaciones por nivel', 'Grades by level'],
  ['Solo admin captura examen oral y escrito de cada nivel.', 'Only admin captures oral and written exam for each level.'],
  ['Oral', 'Oral'],
  ['Escrito', 'Written'],
  ['Accion', 'Action'],
  ['Guardar', 'Save'],
  ['Borrar', 'Delete'],
  ['Actualizar perfil', 'Update profile'],
  ['Eliminar estudiante', 'Delete student'],
  ['Alumno sin nombre', 'Student without name'],
  ['Estatus', 'Status'],
  ['Activo', 'Active'],
  ['Pausado', 'Paused'],
  ['Baja', 'Dropped'],
  ['Admins', 'Admins'],
  ['Asignar roles por correo', 'Assign roles by email'],
  ['Un mismo correo puede tener rol Admin y Teacher. El usuario usa una sola contrasena y cambia de panel.', 'One email can have Admin and Teacher roles. The user uses one password and switches dashboards.'],
  ['Nombre de la persona', 'Person name'],
  ['Name de la persona', 'Person name'],
  ['ID Teacher', 'Teacher ID'],
  ['Guardar roles', 'Save roles'],
  ['Acceso compartido', 'Shared access'],
  ['Alta y control de administradores. El admin nuevo crea su contrasena desde el login.', 'Create and manage admins. The new admin creates their password from login.'],
  ['Agregar admin', 'Add admin'],
  ['Pendiente', 'Pending'],
  ['Suspendido', 'Suspended'],
  ['Con acceso', 'Access ready'],
  ['Sin contrasena', 'No password'],
  ['Alta rapida y edicion de accesos teacher.', 'Quick creation and editing of teacher access.'],
  ['Agregar teacher', 'Add teacher'],
  ['Admin crea ID, nombre y correo. El teacher crea su contrasena desde el login.', 'Admin creates ID, name and email. The teacher creates their password from login.'],
  ['Vista general de alumnos; abre el perfil para editar datos academicos y pagos.', 'General student view; open profile to edit academic data and payments.'],
  ['Nuevo alumno', 'New student'],
  ['Abrir perfil', 'Open profile'],
  ['Nuevo pago', 'New payment'],
  ['Periodos mensuales calculados desde la fecha de inscripcion.', 'Monthly periods calculated from enrollment date.'],
  ['Periodos mensuales calculados desde la enrollment date.', 'Monthly periods calculated from enrollment date.'],
  ['Tabla tipo Excel por estudiante y mensualidad desde su fecha de inscripcion.', 'Excel-style table by student and monthly payment from enrollment date.'],
  ['Tabla tipo Excel por student y mensualidad desde su fecha de inscripcion.', 'Excel-style table by student and monthly payment from enrollment date.'],
  ['Tabla tipo Excel por student y mensualidad desde su enrollment date.', 'Excel-style table by student and monthly payment from enrollment date.'],
  ['Tabla tipo Excel por student y monthly payment from enrollment date.', 'Excel-style table by student and monthly payment from enrollment date.'],
  ['Estudiante', 'Student'],
  ['Seleccionar estudiante', 'Select student'],
  ['Periodo', 'Period'],
  ['Seleccionar periodo', 'Select period'],
  ['Monto', 'Amount'],
  ['Pendiente', 'Pending'],
  ['Guardar pago', 'Save payment'],
  ['Pagos registrados', 'Registered payments'],
  ['Click en una casilla para capturar un pago mensual.', 'Click a cell to capture a monthly payment.'],
  ['INGRESOS TOTALES', 'TOTAL REVENUE'],
  ['INGRESOS DEL MES', 'MONTHLY REVENUE'],
  ['PAGOS CAPTURADOS', 'CAPTURED PAYMENTS'],
  ['PAYMENTS CAPTURADOS', 'CAPTURED PAYMENTS'],
  ['Ingresos totales', 'Total revenue'],
  ['Ingresos del mes', 'Monthly revenue'],
  ['Pagos capturados', 'Captured payments'],
  ['Payments capturados', 'Captured payments'],
  ['Nombre', 'Name'],
  ['Pagado', 'Paid'],
  ['Vencido', 'Overdue'],
  ['No hay alumnos registrados.', 'No students registered.'],
  ['No hay admins con ese filtro.', 'No admins match that filter.'],
  ['No hay teachers registrados.', 'No teachers registered.'],
  ['No hay teachers con ese filtro.', 'No teachers match that filter.'],
  ['Reservas por asignar', 'Bookings to assign'],
  ['Bloques', 'Blocks'],
  ['IA propone grupos y tema; Admin asigna teacher y classroom.', 'AI proposes groups and topic; admin assigns teacher and classroom.'],
  ['IA propone grupos y tema; admin asigna teacher y classroom.', 'AI proposes groups and topic; admin assigns teacher and classroom.'],
  ['Limpiar filtros', 'Clear filters'],
  ['Eliminar anteriores', 'Delete previous'],
  ['No hay reservas pendientes por formar.', 'There are no pending bookings to form.'],
  ['No hay pending bookings por formar.', 'There are no pending bookings to form.'],
  ['Reservas por estudiantes', 'Bookings by student'],
  ['Reservas por estudiante', 'Bookings by student'],
  ['Vista rapida por alumno para validar cuantas horas pidio antes de formar clases.', 'Quick student view to validate requested hours before forming classes.'],
  ['Dia', 'Day'],
  ['Hora', 'Time'],
  ['hora', 'hour'],
  ['horas', 'hours'],
  ['Horas reservadas', 'Booked hours'],
  ['Times reservadas', 'Booked hours'],
  ['No hay reservas pendientes por estudiante.', 'There are no pending bookings by student.'],
  ['No hay pending bookings por estudiante.', 'There are no pending bookings by student.'],
  ['Clases registradas', 'Registered classes'],
  ['Reservas pendientes, clases formadas por admin y correcciones manuales.', 'Pending bookings, admin-formed classes and manual corrections.'],
  ['Buscar', 'Search'],
  ['Buscar en esta tabla', 'Search this table'],
  ['Search en esta tabla', 'Search this table'],
  ['Todas las fechas', 'All dates'],
  ['Todas las horas', 'All times'],
  ['Limpiar dia/hora', 'Clear day/time'],
  ['No hay clases con ese filtro.', 'No classes match that filter.'],
  ['No hay students con ese filtro.', 'No students match that filter.'],
  ['No hay estudiantes con ese filtro.', 'No students match that filter.'],
  ['Mes 1', 'Month 1'],
  ['Mes 2', 'Month 2'],
  ['Mes 3', 'Month 3'],
  ['Mes 4', 'Month 4'],
  ['Mes 5', 'Month 5'],
  ['Mes 6', 'Month 6'],
  ['Mes 7', 'Month 7'],
  ['Mes 8', 'Month 8'],
  ['Mes 9', 'Month 9'],
  ['Mes 10', 'Month 10'],
  ['Mes 11', 'Month 11'],
  ['Mes 12', 'Month 12'],
  ['mensualidad', 'monthly payment'],
  ['fecha de inscripcion', 'enrollment date'],
  ['desde su fecha de inscripcion', 'from enrollment date'],
  ['inscripcion', 'enrollment'],
  ['estudiantes', 'students'],
  ['pendientes', 'pending'],
  ['anteriores', 'previous'],
  ['reservadas', 'booked'],
  ['reservas', 'bookings'],
  ['clases', 'classes'],
  ['estudiante', 'student'],
  ['alumno', 'student'],
  ['filtros', 'filters'],
  ['Editar', 'Edit'],
  ['Eliminar', 'Delete'],
  ['Classrooms', 'Classrooms'],
  ['Salones disponibles para que admin los asigne a clases formadas.', 'Available rooms for admin to assign to formed classes.'],
  ['Agregar classroom', 'Add classroom'],
  ['Bloquear horarios', 'Block schedules'],
  ['Cierra un dia completo o una hora por vacaciones, juntas o mantenimiento.', 'Close a full day or one hour for vacations, meetings or maintenance.'],
  ['Tipo', 'Type'],
  ['Motivo', 'Reason'],
  ['Vacaciones, junta, evento...', 'Vacations, meeting, event...'],
  ['Dia completo', 'Full day'],
  ['Hora especifica', 'Specific hour'],
  ['Seleccionar hora', 'Select time'],
  ['Guardar bloqueo', 'Save block'],
  ['No hay horarios bloqueados.', 'No blocked schedules.'],
  ['Tabla tipo Excel ordenada por alumno. El teacher pasa lista; admin corrige si hace falta.', 'Excel-style table sorted by student. Teacher takes attendance; admin corrects if needed.'],
  ['Alumno', 'Student'],
  ['Clase', 'Class'],
  ['No hay asistencias con ese filtro.', 'No attendance records match that filter.'],
  ['Asistio', 'Attended'],
  ['Falto', 'Missed'],
  ['Fecha reciente', 'Recent date'],
  ['Fecha proxima', 'Upcoming date'],
  ['Faltas primero', 'Absences first'],
  ['Administra estructura academica del instituto.', 'Manage the institute academic structure.'],
  ['Inicializar catalogo', 'Initialize catalog'],
  ['Niveles', 'Levels'],
  ['ID opcional', 'Optional ID'],
  ['Orden', 'Order'],
  ['Meses', 'Months'],
  ['Nombre corto', 'Short name'],
  ['Lecciones meta', 'Target lessons'],
  ['Guardar nivel', 'Save level'],
  ['Lecciones / temas', 'Lessons / topics'],
  ['Las reservas automaticas usan estas lecciones para detectar nivel y clase siguiente.', 'Automatic bookings use these lessons to detect level and next class.'],
  ['Seleccionar nivel', 'Select level'],
  ['Guardar leccion', 'Save lesson'],
  ['No hay lecciones con ese filtro.', 'No lessons match that filter.'],
  ['Operacion teacher', 'Teacher operation'],
  ['Mis clases y alumnos', 'My classes and students'],
  ['Toma asistencia y revisa progreso de tus alumnos.', 'Take attendance and review student progress.'],
  ['Clases asignadas', 'Assigned classes'],
  ['Clases de hoy o proximas pendientes de asistencia.', 'Today or upcoming classes pending attendance.'],
  ['Historial de clases anteriores o listas ya capturadas.', 'History of previous classes or captured attendance lists.'],
  ['Hoy / proximas', 'Today / upcoming'],
  ['Anteriores / capturadas', 'Previous / captured'],
  ['Fecha', 'Date'],
  ['Nivel', 'Level'],
  ['Leccion', 'Lesson'],
  ['Alumnos', 'Students'],
  ['Horas', 'Hours'],
  ['Lista', 'List'],
  ['Reservaciones por alumno', 'Bookings by student'],
  ['toma asistencia y revisa progreso', 'take attendance and review progress'],
  ['Selecciona una clase', 'Select a class'],
  ['Ver progreso', 'View progress'],
  ['Ocultar progreso', 'Hide progress'],
  ['Confirmar lista', 'Confirm attendance'],
  ['La clase seleccionada no tiene alumnos asignados.', 'The selected class has no assigned students.'],
  ['Cambiar contrasena', 'Change password'],
  ['Actualiza tu acceso individual.', 'Update your individual access.'],
  ['Nueva contrasena', 'New password'],
  ['Guardar contrasena', 'Save password'],
  ['Reservar clase', 'Book class'],
  ['Solo puedes reservar para manana. La semana se reinicia cada domingo.', 'You can only book for tomorrow. The week resets every Sunday.'],
  ['Disponible', 'Available'],
  ['Hasta', 'Until'],
  ['Reservar bloque', 'Book block'],
  ['Mis clases', 'My classes'],
  ['Cancelacion disponible hasta 2 horas antes si admin aun no forma la clase.', 'Cancellation available up to 2 hours before if admin has not formed the class yet.'],
  ['Cancelar', 'Cancel'],
  ['Cerrado', 'Closed'],
  ['Info', 'Info'],
  ['Asistencias', 'Attendance'],
  ['Calificaciones', 'Grades'],
  ['Descargar recibo', 'Download receipt'],
  ['Acceso', 'Access'],
  ['Acceso al sistema escolar.', 'School system access.'],
  ['Entra con tu correo, ID de alumno o ID de teacher para consultar tu informacion.', 'Enter with email, student ID or teacher ID to view your information.'],
  ['Control de becas:', 'Scholarship control:'],
  ['Pago, asistencia minima y avisos de ausencia en un solo lugar.', 'Payment, minimum attendance and absence notices in one place.'],
  ['Operacion academica:', 'Academic operation:'],
  ['Niveles, lecciones, clases, asistencia y progreso actualizados.', 'Updated levels, lessons, classes, attendance and progress.'],
  ['Apoyo academico:', 'Academic support:'],
  ['Recomendaciones para organizar clases y dar seguimiento.', 'Recommendations to organize classes and follow up.'],
  ['Bienvenido a Innova-t', 'Welcome to Innova-T'],
  ['Ingresa con correo, ID de alumno o ID de teacher.', 'Enter with email, student ID or teacher ID.'],
  ['Correo o ID publico', 'Email or public ID'],
  ['Contrasena', 'Password'],
  ['Volver al inicio', 'Back home'],
  ['Crea tu contrasena', 'Create your password'],
  ['Restablecer contrasena', 'Reset password'],
  ['Entrar', 'Enter'],
  ['Primer acceso', 'First access'],
  ['Crea tu contrasena con tu ID oficial.', 'Create your password with your official ID.'],
  ['Primer ingreso', 'First login'],
  ['Usa tu ID de alumno, ID de teacher o correo registrado.', 'Use your student ID, teacher ID or registered email.'],
  ['ID o correo', 'ID or email'],
  ['Confirmar contrasena', 'Confirm password'],
  ['Ya tengo contrasena', 'I already have a password'],
  ['Crear contrasena', 'Create password'],
  ['Clases listas', 'Ready classes'],
  ['Asignaciones confirmadas por admin para alumnos y teachers.', 'Assignments confirmed by admin for students and teachers.'],
  ['Horas proximas', 'Upcoming hours'],
  ['No hay horas proximas con clases listas.', 'There are no upcoming hours with ready classes.'],
  ['No hay clases listas para la hora seleccionada.', 'There are no ready classes for the selected time.'],
  ['Abre esta pantalla desde una sesion admin o teacher para mostrar clases asignadas.', 'Open this screen from an admin or teacher session to show assigned classes.'],
  ['hora de Mexico', 'Mexico time'],
  ['Seleccionar classroom', 'Select classroom'],
  ['Seleccionar teacher', 'Select teacher'],
  ['Seleccionar tema', 'Select topic'],
  ['Formar clase', 'Form class'],
  ['Propuesta IA para formar clases', 'AI proposal to form classes'],
  ['Clases a formar', 'Classes to form'],
  ['Guardar clases formadas', 'Save formed classes'],
  ['Puedes formar hasta', 'You can form up to'],
  ['por los classrooms activos.', 'from the active classrooms.'],
  ['alumnos - confianza', 'students - confidence'],
  ['Alumnos de esta clase', 'Students in this class'],
  ['Clase propuesta por IA.', 'Class proposed by AI.'],
  ['En curso', 'In progress'],
  ['Lista', 'Ready']
]

const SORTED_TRANSLATIONS = [...TRANSLATIONS].sort((a, b) => b[0].length - a[0].length)
const ES_TO_EN = new Map(SORTED_TRANSLATIONS)
const textOriginals = new WeakMap()
const textRendered = new WeakMap()
const attributeOriginals = new WeakMap()
const attributeRendered = new WeakMap()

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isShortPhrase(value) {
  return value.length <= 4 && /^[\p{L}\p{N}\s]+$/u.test(value)
}

function replaceAllPhrases(value, dictionary) {
  let nextValue = value
  dictionary.forEach((target, source) => {
    if (isShortPhrase(source)) {
      const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegExp(source)})(?=$|[^\\p{L}\\p{N}])`, 'gu')
      nextValue = nextValue.replace(pattern, `$1${target}`)
      return
    }

    nextValue = nextValue.split(source).join(target)
  })
  return nextValue
}

function translateValue(value, language) {
  if (!value || !value.trim()) return value
  const leading = value.match(/^\s*/)?.[0] || ''
  const trailing = value.match(/\s*$/)?.[0] || ''
  const core = value.trim()
  const translatedCore = language === 'en' ? replaceAllPhrases(core, ES_TO_EN) : core

  return `${leading}${translatedCore}${trailing}`
}

function getTextOriginal(node) {
  const current = node.nodeValue || ''
  const rendered = textRendered.get(node)

  if (!textOriginals.has(node) || (rendered !== undefined && current !== rendered)) {
    textOriginals.set(node, current)
  }

  return textOriginals.get(node) || current
}

function getAttributeStore(store, element) {
  let values = store.get(element)
  if (!values) {
    values = {}
    store.set(element, values)
  }
  return values
}

function getAttributeOriginal(element, attribute) {
  const current = element.getAttribute(attribute) || ''
  const originals = getAttributeStore(attributeOriginals, element)
  const rendered = getAttributeStore(attributeRendered, element)

  if (!originals[attribute] || (rendered[attribute] !== undefined && current !== rendered[attribute])) {
    originals[attribute] = current
  }

  return originals[attribute] || current
}

function shouldSkipNode(node) {
  const parent = node.parentElement
  if (!parent) return true
  return ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(parent.tagName)
}

function translateElement(root, language) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes = []

  while (walker.nextNode()) {
    if (!shouldSkipNode(walker.currentNode)) textNodes.push(walker.currentNode)
  }

  textNodes.forEach(node => {
    const original = getTextOriginal(node)
    const translated = translateValue(original, language)
    if (translated !== node.nodeValue) node.nodeValue = translated
    textRendered.set(node, translated)
  })

  root.querySelectorAll?.('[placeholder], [title], [aria-label]').forEach(element => {
    ;['placeholder', 'title', 'aria-label'].forEach(attribute => {
      const value = element.getAttribute(attribute)
      if (!value) return
      const original = getAttributeOriginal(element, attribute)
      const translated = translateValue(original, language)
      if (translated !== value) element.setAttribute(attribute, translated)
      getAttributeStore(attributeRendered, element)[attribute] = translated
    })
  })
}

function GlobalTranslator() {
  const language = useUiLanguage()

  useEffect(() => {
    let frame = 0
    const translate = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => translateElement(document.body, language))
    }

    translate()
    const observer = new MutationObserver(translate)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label']
    })

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [language])

  return null
}

export default GlobalTranslator
