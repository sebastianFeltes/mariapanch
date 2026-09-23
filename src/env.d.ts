/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_ORDERS_WEBAPP_URL?: string;
  readonly PUBLIC_ORDERS_SECRET?: string;
  readonly PUBLIC_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
