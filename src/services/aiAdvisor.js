import { app } from '../firebase'
import { buildAcademicRecommendation, buildSuggestedGroups } from '../domain/academicMatcher'

const AI_ENABLED = import.meta.env.VITE_ENABLE_FIREBASE_AI === 'true'
const DEFAULT_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.1-flash-lite'

function buildPrompt(student, localRecommendation, scholarshipEvaluation) {
  return `
Actua como coordinador academico de un instituto de ingles con becas.
Devuelve SOLO JSON valido, sin markdown.

Reglas reales:
- La beca se mantiene si paga a tiempo.
- Debe asistir minimo 6 horas por semana.
- Si falta, debe avisar al menos 2 horas antes.
- 1 falta sin aviso: advertencia.
- 2 faltas sin aviso: beca en riesgo.
- 3 faltas sin aviso: revision por posible perdida.

Estudiante:
${JSON.stringify(student, null, 2)}

Evaluacion de beca:
${JSON.stringify(scholarshipEvaluation, null, 2)}

Recomendacion local calculada:
${JSON.stringify(localRecommendation, null, 2)}

Formato esperado:
{
  "nextLessonId": "string",
  "atrasoDetectado": true,
  "motivoAtraso": "string",
  "refuerzos": ["string"],
  "grupoSugerido": "string",
  "accionRecomendada": "string",
  "prioridad": "normal|media|alta",
  "confianza": 0.0
}
`
}

function parseJson(text) {
  const cleanText = text
    .replace(/^```json/i, '')
    .replace(/^```/i, '')
    .replace(/```$/i, '')
    .trim()

  return JSON.parse(cleanText)
}

export async function generateStudentAiRecommendation(student, scholarshipEvaluation, catalog = {}) {
  const localRecommendation = buildAcademicRecommendation(student, {
    levels: catalog.levels || [],
    lessons: catalog.lessons || [],
    scholarshipEvaluation
  })

  if (!AI_ENABLED) {
    return {
      provider: 'local-rules',
      ...localRecommendation,
      aiSummary: {
        nextLessonId: localRecommendation.nextLesson?.id || null,
        atrasoDetectado: localRecommendation.isBehind,
        motivoAtraso: localRecommendation.isBehind
          ? 'El progreso academico o las horas semanales estan por debajo del objetivo.'
          : 'El estudiante mantiene condiciones suficientes para avanzar.',
        refuerzos: localRecommendation.reinforcementTopics,
        grupoSugerido: `${localRecommendation.levelName} - ritmo ${localRecommendation.pace}`,
        accionRecomendada: localRecommendation.action,
        prioridad: localRecommendation.priority,
        confianza: localRecommendation.confidence
      }
    }
  }

  try {
    const { getAI, getGenerativeModel, GoogleAIBackend } = await import('firebase/ai')
    const ai = getAI(app, {
      backend: new GoogleAIBackend(),
      useLimitedUseAppCheckTokens: true
    })
    const model = getGenerativeModel(ai, {
      model: DEFAULT_MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 700
      }
    })

    const result = await model.generateContent(buildPrompt(student, localRecommendation, scholarshipEvaluation))
    const text = result.response.text()

    return {
      provider: 'firebase-ai-logic',
      ...localRecommendation,
      aiSummary: parseJson(text)
    }
  } catch (error) {
    console.warn('Firebase AI Logic failed; falling back to local rules.', error)
    return {
      provider: 'local-rules-fallback',
      ...localRecommendation,
      aiSummary: {
        nextLessonId: localRecommendation.nextLesson?.id || null,
        atrasoDetectado: localRecommendation.isBehind,
        motivoAtraso: 'Firebase AI Logic no respondio; se uso la evaluacion local.',
        refuerzos: localRecommendation.reinforcementTopics,
        grupoSugerido: `${localRecommendation.levelName} - ritmo ${localRecommendation.pace}`,
        accionRecomendada: localRecommendation.action,
        prioridad: localRecommendation.priority,
        confianza: localRecommendation.confidence
      }
    }
  }
}

export function generateGroupRecommendations(students, recommendations, levels = []) {
  return buildSuggestedGroups(students, recommendations, levels).map(group => ({
    ...group,
    recommendation: group.pace === 'lento'
      ? 'Crear bloque de refuerzo con cupo reducido y seguimiento semanal.'
      : 'Mantener avance por leccion y asignar teacher segun disponibilidad.'
  }))
}
