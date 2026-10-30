import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// TanStack libraries ship "use client" directives, which mean nothing in these
// bundles. Drop that one warning and keep every other.
function quietDirectives(warning: { code?: string }, warn: (w: never) => void) {
  if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
  warn(warning as never)
}

export default defineConfig({
  server: { port: Number(process.env.PORT ?? 3000) },
  resolve: { tsconfigPaths: true },
  build: { rolldownOptions: { onwarn: quietDirectives } },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    // Nitro bundles the server again with its own rolldown pass.
    nitro({ rolldownConfig: { onwarn: quietDirectives } }),
    viteReact(),
  ],
})
