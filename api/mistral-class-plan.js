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

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Metodo no permitido.' })
  }

  const apiKey = process.env.MISTRAL_API_KEY
  if (!apiKey) {
    return response.status(500).json({ error: 'El asistente no esta configurado en el servidor.' })
  }

  let body = {}
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : request.body
  } catch (error) {
    return response.status(400).json({ error: 'Body JSON invalido.' })
  }
  const prompt = body?.prompt
  if (!prompt || typeof prompt !== 'string') {
    return response.status(400).json({ error: 'Falta prompt valido.' })
  }

  const model = process.env.MISTRAL_MODEL || DEFAULT_MISTRAL_MODEL
  const apiUrl = process.env.MISTRAL_API_URL || DEFAULT_MISTRAL_API_URL

  try {
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
      return response.status(mistralResponse.status).json({
        error: payload?.message || payload?.error?.message || `El asistente respondio ${mistralResponse.status}.`
      })
    }

    const text = payload.choices?.[0]?.message?.content || ''
    response.setHeader('Cache-Control', 'no-store')
    return response.status(200).json({
      ...parseJson(text),
      __model: model
    })
  } catch (error) {
    return response.status(500).json({
      error: error.message || 'No se pudo consultar el asistente.'
    })
  }
}
