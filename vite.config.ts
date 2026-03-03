import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api/adsb': {
        target: 'https://api.adsb.lol',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/adsb/, ''),
      },
      '/api/overpass': {
        target: 'https://overpass-api.de',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/overpass/, ''),
      },
      '/api/tfl': {
        target: 'https://api.tfl.gov.uk',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tfl/, ''),
      },
      '/api/caltrans': {
        target: 'https://cwwp2.dot.ca.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/caltrans/, ''),
      },
      '/api/nyctmc': {
        target: 'https://webcams.nyctmc.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nyctmc/, ''),
      },
    },
  },
});
