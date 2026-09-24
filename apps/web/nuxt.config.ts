import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-23',
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  // Dev port fixed at 3001: the API also defaults to 3000 (config PORT),
  // so leaving both on 3000 makes `pnpm dev` fail to bind.
  devServer: { port: 3001 },
  runtimeConfig: {
    // Server-only: the Fastify origin the Nitro proxy forwards /api/** to.
    // Override with NUXT_API_BASE in any environment.
    apiBase: process.env.NUXT_API_BASE ?? 'http://localhost:3000',
  },
})
