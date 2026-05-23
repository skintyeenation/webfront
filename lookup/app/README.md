# `@skintyee/lookup-app`

Frontend for the Skin Tyee Lookup tool. React Native + Expo, mirroring the
[`@skintyee/app`](../../app) stack and theme (cyan/orange dark, Material UI
via React Native Paper).

## Pages

- **Home** — pick mode (business / money), recent runs
- **Business** — name + optional website → source picker → run
- **Money** — keyword + vendor/year/value filters → source picker → run
- **Run** — live progress per source via SSE
- **Results** — per-source items + full markdown report
- **History** — past runs (in-memory)

## Run

```sh
# Start the backend first (separate terminal):
pnpm lookup:serve

# Then start the app:
pnpm lookup:app          # Expo dev menu (web / iOS / Android)
pnpm lookup:app:web      # web only
```

The app reads `EXPO_PUBLIC_LOOKUP_API` (default `http://127.0.0.1:5050`) at
launch via `app.config.js → extra.apiServer`.
