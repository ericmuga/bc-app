import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const port    = parseInt(env.VITE_PORT     || '5173')
  const apiHost =          env.VITE_API_HOST || 'localhost'
  const apiPort = parseInt(env.VITE_API_PORT || '4000')
  
  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      host:'0.0.0.0',
      port,
      watch: {
        include: ['.env'],
      },
      proxy: {
        '/api': {
          target: `http://${apiHost}:${apiPort}`,
          changeOrigin: true
        }
      }
    }
  }
})
