# new changes

improvement plan for rivers transit.

## phase 1: routing

- add real edge weights instead of the 10000 transfer hack.
- support walk as a fallback between any two stops.
- expose `walkSpeedMetersPerMinute` to callers.
- cache `computeRoute` results in memory.

## phase 2: data

- validate `network.json` against a schema.
- add coordinates to stops & places.
- add real-time status for segments.
- allow fare to vary by time of day.

## phase 3: search

- autocomplete from a debounced places api.
- rank results by popularity & distance.
- add fuzzy matching for typos.

## phase 4: ui

- add a map view with leaflet or mapbox.
- show stops, segments & the picked route on it.
- add dark mode toggle.
- make inputs keyboard navigable.

## phase 5: quality

- add unit tests for `router.ts` & `network.ts`.
- add e2e tests with playwright.
- type the api responses with zod.

## phase 6: deployment

- add a dockerfile.
- cache `loadNetwork` across requests in production.
