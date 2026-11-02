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

## The interface

The design is deliberately plain: ink on paper (or the reverse in dark mode), IBM Plex type, and
colour used only for state, so anything coloured means something. Every view is built from the
same parts:

- **Command bar.** One input for everything. It classifies what you type as you type it (IPv4
  host, IPv6 /48, 32-bit ASN, route-set) and `/` focuses it from anywhere.
- **Fact strip.** The header of each report: size, RIR, origins with RPKI state, RIS visibility,
  location, covering route for a bare IP, special-use overlaps; for an ASN, announcement and ROA
  counts, route objects per IRR and the countries it announces from; for a set, sets resolved,
  depth, ASNs, prefixes, loops, missing sets and the networks that name it in PeeringDB. A
  prefix on an exchange peering LAN shows the exchange, and an exchange address shows the
  network whose port uses it.
- **PeeringDB** (ASN view). The network's own record: name, organisation, type, scope, traffic,
  peering policy, max-prefix values set against what it actually announces, the IRR AS-set it
  publishes (checked against IRR membership on the same page), public contacts, every exchange
  port with speed, addresses and route server use, and its facilities.
- **Findings.** Every advice message on the page grouped across prefixes, errors first, like a
  compiler's diagnostics, with a status bar of the whole result. Clicking a message or a prefix
  filters the records to it.
- **Address map** (prefix view). Every overlapping prefix drawn to scale inside the least
  specific one, one lane per nesting level, so holes and stray more-specifics are visible at a
  glance.
- **Records.** One block per prefix with an origin by source matrix: each origin ASN on a row,
  BGP, ROA and each IRR as columns, so a disagreement shows up as a ragged row. The header
  carries the prefix's countries from GeoLite2. The original
  one-row-per-prefix table is still there as the Table view, with sortable and hideable columns.
- **Set tree.** AS-set and route-set expansion as a collapsible tree with loop, not-found and
  not-expanded markers, a problems-only filter, the original path table as an alternative, and
  the flattened ASN and prefix lists with copy buttons.
- **Start page.** Input synopsis with examples, recently opened reports (kept in the browser
  only) and the freshness of every data source.

View, filter, order, hidden columns and colour mode all live in the URL, so a link reproduces
exactly what you are looking at.

## Data sources

Everything is fetched live or held in memory. There is no database; restarting the app only
means the bulk datasets are downloaded again.

| Data                                | Source                              | How                                               |
| ----------------------------------- | ----------------------------------- | ------------------------------------------------- |
| Route objects, sets, set membership | IRRd GraphQL (`IRRD_GRAPHQL_URL`)   | Queried per request                               |
| BGP origins                         | bgp.tools `table.jsonl`             | Downloaded every 2 hours, indexed in memory       |
| AS names                            | bgp.tools `asns.csv`                | Downloaded daily                                  |
| RPKI ROAs and validity              | IRRd's `RPKI` source                | Queried per request, validated locally (RFC 6811) |
| RIR per prefix                      | NRO delegated stats and Registro.BR | Downloaded daily                                  |
| RIS visibility, BGP fallback        | RIPEstat Data API                   | Queried per request                               |
| Geolocation                         | MaxMind GeoLite2 City               | Checked every 6 hours, downloaded when updated    |
| Networks, exchanges, facilities     | PeeringDB API                       | Mirrored: changes hourly, full copy daily         |

A few notes on these choices:

- IRRd imports validated ROAs into a pseudo-source called `RPKI`, the same data the original IRR
  Explorer used. The route lookup the app already makes returns those ROAs next to the route
  objects, including every ROA covering each prefix, so one query gives the ROA column, the
  status of every route object and BGP origin, and the reason a route is invalid (wrong origin or
  too specific). The IRRd must have RPKI import enabled; if it has no `RPKI` source, RPKI shows
  as unavailable rather than "not found".
- IRRd queries always request RPKI-invalid objects explicitly, because IRRd's ROV filter would
  otherwise hide them.
- If a source is down, the page still renders with a notice saying what is missing. Checks that
  depend on missing data are skipped and the row says so rather than reporting that everything
  looks good. If the bgp.tools table is not loaded, BGP origins come from RIPE RIS instead.
- Location comes from MaxMind GeoLite2 and needs a free MaxMind account: set
  `MAXMIND_ACCOUNT_ID` and `MAXMIND_LICENSE_KEY`. Without them location is simply left out. The
  app checks for a new release with a HEAD request, which MaxMind does not count against the
  daily download limit, and downloads only when `Last-Modified` changes (GeoLite2 is normally
  rebuilt on Tuesdays and Fridays). With `BULK_CACHE_DIR` set the database is kept on disk, so a
  restart does not download it again. A prefix spanning several GeoLite2 networks is walked
  network by network and each country is weighted by address count; one spanning more than 64
  networks (512 for the query itself) is sampled at 128 evenly spaced addresses and marked as
  sampled. City, coordinates and accuracy radius are shown only when one GeoLite2 network covers
  the whole query, and the registered country is shown when it differs from where the block is
  used. GeoLite2 is accurate at country level and rough below that.
- PeeringDB is mirrored in memory from its API. The first load fetches networks, organisations,
  exchanges, peering LANs, exchange ports, facilities and contacts (about 125 MB of JSON, kept
  as a much smaller projection). After that only changes are fetched every hour with `since`,
  the way `peeringdb-py` syncs, and the whole copy is replaced once a day. Requests are spaced
  2.5 seconds apart. An API key (`PEERINGDB_API_KEY`) is optional but raises the query limit
  from 20 to 40 a minute. Only contacts PeeringDB shows to everyone are kept, because this app
  shows its data to anyone who can reach it. Max-prefix is flagged near (over 90%) or over the
  value the network lists, since peers often configure their limits from it.
- bgp.tools asks for an identifying User-Agent with a contact address and no more than one
  download every 30 minutes. Set `BGPTOOLS_USER_AGENT`; without it the table is not downloaded.

## Running it

You need Node 26 (current LTS) and pnpm 11.

```sh
pnpm install
cp .env.example .env    # set BGPTOOLS_USER_AGENT
pnpm dev                # http://localhost:3000
```

Setting `BULK_CACHE_DIR=.cache` in `.env` keeps the raw bulk downloads on disk, so restarting
the dev server does not download bgp.tools again within 30 minutes.

### Production

```sh
pnpm build
pnpm start              # node .output/server/index.mjs
```

Or with Docker:

```sh
cp .env.example .env    # set BGPTOOLS_USER_AGENT at least
docker compose up -d --build
```

The image is a two-stage build on `node:26-alpine` that ships only `.output/`, runs as the
`node` user under tini and listens on port 3000. `GET /healthz` reports the process (including
memory use) plus the last success and failure time for each upstream and dataset, without
calling any upstream. Responses are gzip-compressed when the client accepts it and carry basic
security headers (nosniff, no framing, strict referrer policy). Calls to IRRd and RIPEstat are
limited to 12 and 8 at a time, and the response cache is capped at `CACHE_MAX_MB`.

With every dataset loaded the process uses about 550 MB. Very large ASN pages (AS13335,
AS16509) and a warm response cache take it to about 1.4 GB; the image sets a 2 GB heap limit. Those
pages also take minutes on a cold cache, because every aggregate the ASN announces needs an
IRRd overlap lookup. The original IRR Explorer has the same cost.

### Configuration

Every setting is documented in `.env.example`. The main ones:

| Variable                       | Default                               | Purpose                                    |
| ------------------------------ | ------------------------------------- | ------------------------------------------ |
| `IRRD_GRAPHQL_URL`             | `https://rr.ntt.net/graphql/` | IRRd GraphQL endpoint                      |
| `RIPESTAT_SOURCEAPP`           | `irrexplorer-ng`                      | Sent on every RIPEstat call                |
| `BGPTOOLS_USER_AGENT`          | empty                                 | Required for the bgp.tools download        |
| `MAXMIND_ACCOUNT_ID`           | empty                                 | MaxMind account, for GeoLite2              |
| `MAXMIND_LICENSE_KEY`          | empty                                 | MaxMind licence key, for GeoLite2          |
| `GEOIP_EDITION`                | `GeoLite2-City`                       | Or `GeoLite2-Country` (no city detail)     |
| `GEOIP_REFRESH_SECONDS`        | `21600`                               | How often to check for a new release       |
| `PEERINGDB_API_KEY`            | empty                                 | Optional, raises PeeringDB's query limit   |
| `PEERINGDB_ENABLED`            | `true`                                | Set to `false` to leave PeeringDB out      |
| `PEERINGDB_REFRESH_SECONDS`    | `3600`                                | How often to fetch PeeringDB changes       |
| `PORT`                         | `3000`                                | HTTP port                                  |
| `CACHE_TTL_SECONDS`            | `600`                                 | In-process cache for upstream responses    |
| `UPSTREAM_TIMEOUT_MS`          | `8000`                                | Per-call timeout (IRRd gets at least 15 s) |
| `IRRD_BULK_TIMEOUT_MS`         | `60000`                               | Large IRRd lookups (big ASNs and sets)     |
| `CACHE_MAX_MB`                 | `256`                                 | Size cap for the response cache            |
| `SET_SIZE_LIMIT`               | `1000`                                | Stop set expansion beyond this many sets   |
| `MIN_PREFIX_LENGTH_V4` / `_V6` | `9` / `29`                            | Shorter queries are refused as too large   |

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

Network, exchange and facility data from [PeeringDB](https://www.peeringdb.com), used under
its [acceptable use policy](https://www.peeringdb.com/aup).

This product includes GeoLite2 data created by MaxMind, available from
[https://www.maxmind.com](https://www.maxmind.com).
