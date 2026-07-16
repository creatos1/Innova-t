import { generateMistralClassPlan, getMistralStatus } from './mistralCore.js'

export default async function handler(request, response) {
  if (request.method === 'GET') {
    response.setHeader('Cache-Control', 'no-store')
    return response.status(200).json(getMistralStatus(process.env))
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST')
    return response.status(405).json({ error: 'Metodo no permitido.' })
  }

  let body = {}
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : request.body
  } catch (error) {
    return response.status(400).json({ error: 'Body JSON invalido.' })
  }

  try {
    response.setHeader('Cache-Control', 'no-store')
    return response.status(200).json(await generateMistralClassPlan({
      prompt: body?.prompt,
      env: process.env
    }))
  } catch (error) {
    return response.status(error.statusCode || 500).json({
      error: error.message || 'No se pudo consultar el asistente.'
    })
  }
}
