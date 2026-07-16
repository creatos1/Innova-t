const DEFAULT_MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions'
const DEFAULT_MISTRAL_MODEL = 'mistral-small-latest'

function parseJson(text) {
  if (!text) throw new Error('El asistente no devolvio contenido.')

  try {
    return JSON.parse(text)
  } catch (error) {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw error
    return JSON.parse(match[0])
  }
}

export function getMistralStatus(env = process.env) {
  return {
    ok: true,
    service: 'class-plan-assistant',
    configured: Boolean(env.MISTRAL_API_KEY),
    model: env.MISTRAL_MODEL || DEFAULT_MISTRAL_MODEL
  }
}

export async function generateMistralClassPlan({ prompt, env = process.env }) {
  const apiKey = env.MISTRAL_API_KEY
  if (!apiKey) {
    const error = new Error('El asistente no esta configurado en el servidor.')
    error.statusCode = 500
    throw error
  }

  if (!prompt || typeof prompt !== 'string') {
    const error = new Error('Falta prompt valido.')
    error.statusCode = 400
    throw error
  }

  const model = env.MISTRAL_MODEL || DEFAULT_MISTRAL_MODEL
  const apiUrl = env.MISTRAL_API_URL || DEFAULT_MISTRAL_API_URL

  const mistralResponse = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'Devuelve solo JSON valido. No uses markdown.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 1800
    })
  })

  const payload = await mistralResponse.json().catch(() => ({}))
  if (!mistralResponse.ok) {
    const error = new Error(payload?.message || payload?.error?.message || `El asistente respondio ${mistralResponse.status}.`)
    error.statusCode = mistralResponse.status
    throw error
  }

  const text = payload.choices?.[0]?.message?.content || ''
  return {
    ...parseJson(text),
    __model: model,
    __usage: payload.usage || null
  }
}
