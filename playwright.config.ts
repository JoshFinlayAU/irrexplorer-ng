import { defineConfig, devices } from '@playwright/test'

const MOCK = 'http://localhost:3199'
const recording = process.env.MOCK_RECORD === '1'

// App instance wired to the mock upstreams. Instance "degraded" points every
// source except RIPEstat at a failing endpoint to exercise partial failure.
function appEnv(degraded: boolean): Record<string, string> {
  const fail = `${MOCK}/fail`
  return {
    IRRD_GRAPHQL_URL: degraded ? `${fail}/graphql/` : `${MOCK}/irrd/graphql/`,
    RIPESTAT_URL: `${MOCK}/ripestat`,
    RIPESTAT_SOURCEAPP: 'irrexplorer-ng-e2e',
    BGPTOOLS_URL: degraded ? fail : `${MOCK}/bgptools`,
    BGPTOOLS_USER_AGENT: 'irrexplorer-ng e2e tests',
    RIRSTATS_URL: degraded ? `${fail}/nro` : `${MOCK}/rir/nro`,
    REGISTROBR_URL: degraded ? `${fail}/br` : `${MOCK}/rir/registrobr`,
    MAXMIND_DOWNLOAD_URL: degraded ? fail : `${MOCK}/maxmind`,
    MAXMIND_ACCOUNT_ID: 'e2e',
    MAXMIND_LICENSE_KEY: 'e2e-licence',
    PEERINGDB_URL: degraded ? fail : `${MOCK}/peeringdb`,
    PEERINGDB_REQUEST_GAP_MS: '0',
    BULK_DATASETS_ENABLED: 'true',
    BULK_CACHE_DIR: '',
    SET_SIZE_LIMIT: '50',
    CACHE_TTL_SECONDS: '600',
    UPSTREAM_TIMEOUT_MS: '8000',
  }
}

// E2E_DOCKER=1 runs the two app instances from the irrexplorer-ng image
// (host networking so they reach the mock) instead of the local .output.
function appCommand(port: number, degraded: boolean): string {
  if (!process.env.E2E_DOCKER) return 'node .output/server/index.mjs'
  const env = { ...appEnv(degraded), PORT: String(port) }
  const flags = Object.entries(env)
    .map(([k, v]) => `-e ${k}='${v}'`)
    .join(' ')
  return `docker run --rm --network host --name irrx-e2e-${port} ${flags} irrexplorer-ng:latest`
}

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  // Browsers plus two app instances are heavy; more workers just causes timeouts.
  workers: recording ? 1 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, grepInvert: /@live/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grepInvert: /@live/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, grepInvert: /@live/ },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, grepInvert: /@live/ },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] }, grepInvert: /@live/ },
    {
      name: 'live',
      grep: /@live/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.LIVE_BASE_URL ?? 'http://localhost:3000',
      },
      timeout: 180_000,
    },
  ],
  webServer: process.env.LIVE_ONLY
    ? undefined
    : [
        {
          command: 'node e2e/mock-upstreams.ts',
          url: `${MOCK}/__health`,
          reuseExistingServer: false,
          env: { MOCK_PORT: '3199', MOCK_RECORD: recording ? '1' : '0' },
          stdout: 'pipe',
        },
        {
          command: appCommand(3100, false),
          url: 'http://localhost:3100/healthz',
          reuseExistingServer: false,
          env: { ...appEnv(false), PORT: '3100' },
        },
        {
          command: appCommand(3101, true),
          url: 'http://localhost:3101/healthz',
          reuseExistingServer: false,
          env: { ...appEnv(true), PORT: '3101' },
        },
      ],
})
