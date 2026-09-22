import os from 'node:os';
import { defineConfig } from 'astro/config';

const site = process.env.SITE || 'http://localhost:4321';
const base = (process.env.BASE || '/').replace(/\/?$/, '/');

function lanIPv4() {
  const nets = os.networkInterfaces();
  for (const name of ['wlo1', 'wlan0', 'wlp1s0', 'eth0', 'enp0s3', 'en0']) {
    const v4 = nets[name]?.find((addr) => addr.family === 'IPv4' && !addr.internal);
    if (v4) return v4.address;
  }
  return null;
}

const phoneUrl = lanIPv4();

export default defineConfig({
  site,
  base,
  output: 'static',
  compressHTML: true,
  server: {
    host: '0.0.0.0',
    port: 4321,
  },
  vite: {
    server: {
      host: '0.0.0.0',
      allowedHosts: true,
    },
    plugins: [
      {
        name: 'lan-phone-url',
        configureServer() {
          if (!phoneUrl) return;
          queueMicrotask(() => {
            console.log(`\n  Celular (misma WiFi): http://${phoneUrl}:4321/`);
            console.log('  No uses las IPs 172.x (Docker) ni las IPv6 públicas.\n');
          });
        },
      },
    ],
  },
});
