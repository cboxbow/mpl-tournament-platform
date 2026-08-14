// Runtime config, overwritten after each backend deploy so the static
// client can be pointed at the live API without a client rebuild.
window.__SKYBASE_APP_CONFIG__ = window.__SKYBASE_APP_CONFIG__ || {};
window.__SKYBASE_APP_CONFIG__.apiBaseUrl = "https://mpl-cana-api.vercel.app";
