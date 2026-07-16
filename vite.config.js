import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { generateMistralClassPlan, getMistralStatus } from './api/mistralCore.js'

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(payload))
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = ''
    request.on('data', chunk => {
      rawBody += chunk
    })
    request.on('end', () => {
      try {
        resolve(rawBody ? JSON.parse(rawBody) : {})
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
}

function mistralDevApiPlugin(env) {
  return {
    name: 'mistral-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/mistral-class-plan', async (request, response) => {
        if (request.method === 'GET') {
          sendJson(response, 200, getMistralStatus(env))
          return
        }

        if (request.method !== 'POST') {
          response.setHeader('Allow', 'GET, POST')
          sendJson(response, 405, { error: 'Metodo no permitido.' })
          return
        }

        try {
          const body = await readJsonBody(request)
          sendJson(response, 200, await generateMistralClassPlan({
            prompt: body?.prompt,
            env
          }))
        } catch (error) {
          sendJson(response, error.statusCode || 500, {
            error: error.message || 'No se pudo consultar el asistente.'
          })
        }
      })
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = {
    ...process.env,
    ...loadEnv(mode, process.cwd(), '')
  }

  return {
  plugins: [react(), mistralDevApiPlugin(env)],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: '127.0.0.1',
      port: 5173,
      clientPort: 5173
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage']
        }
      }
    }
  }
  }
})
