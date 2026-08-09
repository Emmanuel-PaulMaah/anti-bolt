# rivers transit

a next.js app for planning public transit routes in port harcourt, nigeria.

## features

- two-phase place picker: "where are you?" → "where are you going?"
- guided transit: walk/ride steps with "are you here?" per stop
- fare logging: users report actual fares to update the system
- map view: leaflet map with route polyline & pulsing user dot
- arrival celebration with confetti
- fares shown in naira (₦)

## layout

| phase | layout |
|-------|--------|
| `from` / `to` | centered picker card, no map |
| `route` | map on top, route card scrolls below |
| `transit` | full-viewport map, floating glass card at bottom |
| `arrived` | full-viewport map, centered glass card, confetti |

## map

- leaflet with cartodb voyager tiles (no api key)
- all stops shown as gray dots with hover tooltips
- route polyline: green active, gray dashed visited
- origin (blue), destination (orange), next stop (green pulse)
- user dot pulses along the current leg

## data

the transit network lives in `data/network.json`.

22 places, 21 stops, 43 segments covering port harcourt.

stops & places have lat/lng coordinates.

ride modes are bus, keke & okada.

segments are bidirectional.

## api

| endpoint | method | description |
|----------|--------|-------------|
| `/api/places?q=` | GET | search places by name or alias |
| `/api/route` | POST | compute route with `fromPlaceId`, `toPlaceId`, `avoidModes` |
| `/api/stops` | GET | all stops with lat/lng |
| `/api/fare` | POST | log a user-paid fare to `data/fare_feedback.jsonl` |

## run locally

```bash
npm run dev
```

open http://localhost:3000

## future

- intelligent routing using fare price, distance & weather
- pngs of landmarks along each route
- share location w friends & family

## stack

- next.js 16
- react 19
- typescript
- leaflet
