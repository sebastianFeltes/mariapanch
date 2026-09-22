# María Panch

Sitio estático de **María Panch** (súper panchos + papas, Villa Roca, Berisso). Hecho con [Astro](https://astro.build), estética neo-brutalista diner 60s.

Los combos se leen **en el navegador** desde el Google Sheet. Al abrir (o volver a) la página se pide la tabla HTML en vivo (~15–20 KB). Después, con la pestaña visible, solo se consulta el CSV liviano (~0,5 KB) cada 60 s (cada 2 min si el celular tiene ahorro de datos). Así un agotado se ve al entrar, y no se come el plan móvil.

## Desarrollo local

```bash
npm install
npm run dev
```

Abrí [http://localhost:4321](http://localhost:4321).

```bash
npm run build
npm run preview
```

## Combos (Google Sheet → CSV)

URL publicada:

`https://docs.google.com/spreadsheets/d/e/2PACX-1vRNTGxDekrzkFLrM-XynJSc3rxKzA2bc6ajqsTYr7bSEB8I5RGOrXmFAkfDCOEfnKjBZXWvDL0HFhgb/pub?gid=0&single=true&output=csv`

Columnas usadas:

| Columna | Uso |
| --- | --- |
| `id` | Identificador |
| `name` | Nombre del combo |
| `description` | Texto de la tarjeta |
| `sale_price` | Precio |
| `order` | Orden de aparición |
| `is_active` | `1` se puede pedir, `0` se muestra como **Agotado** |
| `image_url` | Foto. Vacío = placeholder |

El fetch corre client-side (`src/scripts/combos.ts`). La carga inicial usa la tabla HTML publicada (`pubhtml/sheet`). El refresco en segundo plano usa el CSV. CORS del Sheet publicado ya permite el origen de la web.

## Pedido y WhatsApp

Base en código: `https://wa.me/542215681829`

- Cada combo activo tiene **Agregar**. El pedido se arma en un carrito y se manda por WhatsApp, con envío.
- Si `is_active` es `0`, la card se ve con cartel **Agotado** y no se puede agregar.

## Deploy con GitHub Actions → GitHub Pages

El workflow `.github/workflows/deploy.yml` instala, buildea Astro y publica `dist/` en la rama `gh-pages` con [`peaceiris/actions-gh-pages`](https://github.com/peaceiris/actions-gh-pages).

### Pasos

1. Creá el repo en GitHub y pusheá `main`.
2. En el repo: **Settings → Pages**.
3. Source: **Deploy from a branch**.
4. Branch: `gh-pages` / folder `/` (root). Guardá.
5. El primer push a `main` (o **Actions → Deploy GitHub Pages → Run workflow**) genera la rama `gh-pages`.
6. La URL queda:
   - Proyecto: `https://<usuario>.github.io/<repo>/`
   - Sitio de usuario (`<usuario>.github.io`): `https://<usuario>.github.io/`

`SITE` y `BASE` se calculan en el workflow. En un repo de proyecto, Astro usa `base: /<repo>` para que CSS, JS e imágenes resuelvan bien.

`public/.nojekyll` evita que Pages (Jekyll) ignore la carpeta `_astro`.

## Paleta

```css
--rojo: rgb(218, 41, 28);
--amarillo: rgb(255, 204, 0);
--naranja: rgb(242, 100, 25);
--marron: rgb(58, 28, 13);
--crema: rgb(250, 247, 240);
```
