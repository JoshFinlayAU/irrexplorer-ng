import { execFileSync } from 'node:child_process'

// Playwright stops the "docker run" client, which does not always stop the
// container itself; remove the E2E_DOCKER containers explicitly.
export default function globalTeardown() {
  if (!process.env.E2E_DOCKER) return
  try {
    execFileSync('docker', ['rm', '-f', 'irrx-e2e-3100', 'irrx-e2e-3101'], { stdio: 'ignore' })
  } catch {
    // Already gone.
  }
}
