# IRR Explorer NG

IRR Explorer NG shows the routing, IRR and RPKI status of a prefix, an AS number or an
AS-set/route-set, and points out where they disagree. It is a rewrite of
[IRR explorer](https://github.com/nlnog/irrexplorer) (DashCare BV for Stichting NLNOG) on a modern
TanStack stack. It keeps every view, column and status message of the original and adds partial
failure handling, RPKI validity for BGP origins, loop and missing-member detection in set
expansion, and shareable URLs for every filter and sort order.

## What you can look up

- **A prefix or IP address** (`/prefix/193.0.0.0/21`, `/prefix/193.0.0.1`). Shows every prefix
  overlapping the query with its RIR, BGP origins, ROAs, the route objects in each IRR and the
  advice messages. A second table lists everything overlapping the least specific match. For a
  bare IP the most specific announced prefix covering it is linked at the top, along with RIPE
  RIS visibility.
- **An AS number** (`/asn/AS3333`). Prefixes the ASN originates in BGP, RPKI or the IRR, other
  prefixes overlapping them, and the AS-sets and route-sets that include the ASN.
- **An AS-set or route-set** (`/as-set/AS-RIPENCC`, `/route-set/RS-KROOT`). Recursive expansion
  with the depth and path of every set, member links, and markers for loops, member sets that do
  not exist and truncation, plus the sets that include it.
- **Data status** (`/status`). When each dataset was last loaded and when each IRR last changed.

Every page works as a direct link. `/query/<anything>` classifies the input and redirects to the
right view.

## Data sources

Everything is fetched live or held in memory. There is no database; restarting the app only
means the bulk datasets are downloaded again.

| Data                                | Source                                   | How                                                   |
| ----------------------------------- | ---------------------------------------- | ----------------------------------------------------- |
| Route objects, sets, set membership | IRRd GraphQL (`IRRD_GRAPHQL_URL`)        | Queried per request                                   |
| BGP origins                         | bgp.tools `table.jsonl`                  | Downloaded every 2 hours, indexed in memory           |
| AS names                            | bgp.tools `asns.csv`                     | Downloaded daily                                      |
| RPKI ROAs and validity              | Routinator `/csv` (`RPKI_VALIDATOR_URL`) | Loaded every 10 minutes, validated locally (RFC 6811) |
| RIR per prefix                      | NRO delegated stats and Registro.BR      | Downloaded daily                                      |
| RIS visibility, BGP fallback        | RIPEstat Data API                        | Queried per request                                   |

A few notes on these choices:

- The IRRd used here does not serve reliable RPKI data, and Routinator's validity endpoint does
  not list ROAs for a prefix. Loading the full set of VRPs gives the ROA column, the status of
  every route object and BGP origin, and the reason a route is invalid (wrong origin or too
  specific).
- IRRd queries always request RPKI-invalid objects explicitly, because IRRd's ROV filter would
  otherwise hide them.
- If a source is down, the page still renders with a notice saying what is missing. Checks that
  depend on missing data are skipped and the row says so rather than reporting that everything
  looks good. If the bgp.tools table is not loaded, BGP origins come from RIPE RIS instead.
- bgp.tools asks for an identifying User-Agent with a contact address and no more than one
  download every 30 minutes. Set `BGPTOOLS_USER_AGENT`; without it the table is not downloaded.

## Running it

You need Node 26 (current LTS) and pnpm 11.

```sh
pnpm install
cp .env.example .env    # set BGPTOOLS_USER_AGENT and point RPKI_VALIDATOR_URL at a Routinator
pnpm dev                # http://localhost:3000
```

For local development a Routinator is easiest in Docker:

```sh
docker run -d --name routinator -p 127.0.0.1:8323:8323 \
  -v routinator-cache:/home/routinator/.rpki-cache nlnetlabs/routinator:v0.15.3
```

Its first validation run takes several minutes. Until it finishes, RPKI shows as unavailable.

Setting `BULK_CACHE_DIR=.cache` in `.env` keeps the raw bulk downloads on disk, so restarting
the dev server does not download bgp.tools again within 30 minutes.

### Production

```sh
pnpm build
pnpm start              # node .output/server/index.mjs
```

Or with Docker, which also starts a Routinator:

```sh
cp .env.example .env    # set BGPTOOLS_USER_AGENT at least
docker compose up -d --build
```

The image is a two-stage build on `node:26-alpine` that ships only `.output/`, runs as the
`node` user under tini and listens on port 3000. `GET /healthz` reports the process (including
memory use) plus the last success and failure time for each upstream and dataset, without
calling any upstream. Responses are gzip-compressed when the client accepts it.

With every dataset loaded the process uses about 550 MB. Very large ASN pages (AS13335,
AS16509) push it towards 1 GB while they are built; the image sets a 2 GB heap limit. Those
pages also take minutes on a cold cache, because every aggregate the ASN announces needs an
IRRd overlap lookup. The original IRR Explorer has the same cost.

### Configuration

Every setting is documented in `.env.example`. The main ones:

| Variable                       | Default                                     | Purpose                                    |
| ------------------------------ | ------------------------------------------- | ------------------------------------------ |
| `IRRD_GRAPHQL_URL`             | `https://rr.ntt.net/graphql/` | IRRd GraphQL endpoint                      |
| `RPKI_VALIDATOR_URL`           | `http://localhost:8323`                     | Routinator base URL                        |
| `RIPESTAT_SOURCEAPP`           | `irrexplorer-ng`                            | Sent on every RIPEstat call                |
| `BGPTOOLS_USER_AGENT`          | empty                                       | Required for the bgp.tools download        |
| `PORT`                         | `3000`                                      | HTTP port                                  |
| `CACHE_TTL_SECONDS`            | `600`                                       | In-process cache for upstream responses    |
| `UPSTREAM_TIMEOUT_MS`          | `8000`                                      | Per-call timeout (IRRd gets at least 15 s) |
| `SET_SIZE_LIMIT`               | `1000`                                      | Stop set expansion beyond this many sets   |
| `MIN_PREFIX_LENGTH_V4` / `_V6` | `9` / `29`                                  | Shorter queries are refused as too large   |

## JSON API

The original IRR Explorer's API is still available, so existing tools keep working:

- `GET /api/clean_query/<query>`
- `GET /api/prefixes/prefix/<prefix>`
- `GET /api/prefixes/asn/AS<n>`
- `GET /api/sets/member-of/<as-set|route-set>/<target>`
- `GET /api/sets/expand/<set>`
- `GET /api/metadata/`

Field names match the original. `rpslText` is null because object text is fetched on demand,
and each prefix summary also carries the full NG data under `ng`.

## Development

```sh
pnpm typecheck          # tsc --noEmit
pnpm lint               # eslint and prettier --check
pnpm test               # vitest: unit, component and service tests, no network
pnpm test:e2e           # build, then Playwright in Chromium, Firefox, WebKit and two phones
pnpm test:live          # Playwright against real upstreams (needs pnpm dev running)
```

The end-to-end suite needs no network. It starts a mock of every upstream
(`e2e/mock-upstreams.ts`) that replays real responses recorded in `test/fixtures/`, plus two app
instances: one healthy, one with every source except RIPEstat failing. Every screen is loaded
both as a direct link and through client-side navigation, in light and dark themes, and checked
for console errors, hydration warnings and axe accessibility violations. Screenshots go to
`e2e/screenshots/`.

To refresh the fixtures from the real upstreams, run the dev server once with
`BULK_CACHE_DIR=.cache` so the bulk dumps are on disk, then `pnpm fixtures:record`. That records
every request the suite makes and trims the bulk dumps down to the rows the test cases touch.
`E2E_DOCKER=1 pnpm exec playwright test` runs the same suite against the Docker image.

### Layout

- `src/lib/` holds framework-free code: IP and prefix handling (`ip.ts`), input parsing
  (`parse.ts`), the in-memory prefix index, and `analysis/` with the merging, status messages,
  RPKI validation, aggregation and set expansion. Most unit tests live next to it.
- `src/server/sources/` has one module per upstream, each validating responses with Zod.
- `src/server/services/` combines the sources for each view and handles partial failure.
- `src/server/functions.ts` holds the server functions, the only path from the browser to
  upstream data.
- `src/routes/` holds the TanStack Router file routes, including `/healthz` and the JSON API.
- `src/components/` holds the UI: the prefix and set tables (TanStack Table, virtualised with
  TanStack Virtual when large), the search form (TanStack Form), dialogs and status badges.

## Credits

Based on [IRR explorer](https://github.com/nlnog/irrexplorer) by DashCare BV for Stichting
NLNOG. Built by Athena Networks.
