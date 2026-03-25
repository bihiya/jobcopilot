## Redux Toolkit setup

State store is initialized in `app/providers.js` using `react-redux` Provider.

- `lib/store/index.js`: store factory
- `lib/store/dashboard-slice.js`: dashboard state (jobs, filters, pagination, toasts)
- `app/dashboard/dashboard-client.js`: dispatch/select usage

## Site auth session endpoints

The web app proxies session bootstrap/status for site login connection:

- `POST /api/site-auth/start` -> starts manual auth capture flow
- `POST /api/site-auth/status` -> returns whether stored auth session exists for site
