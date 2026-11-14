# Guía de publicación

Todo es gratis. Son tres partes: **el sitio (GitHub Pages)**, **el Worker (Cloudflare)** y
**la caja del ranking (Cloudflare KV)**. El sitio y el Worker salen del mismo repositorio.

---

## Parte 1 — El sitio (GitHub Pages)

Ya está. El repositorio incluye `index.html` en la raíz y Pages queda activado.
La dirección va a ser:

```
https://JoseMota0190.github.io/space-mission-design/
```

> Sin Worker configurado, el juego funciona igual, pero el ranking es **local**
> (se guarda solo en tu navegador).

---

## Parte 2 — La caja del ranking (Cloudflare KV)

1. Entrá a https://dash.cloudflare.com → menú izquierdo **Workers & Pages**.
2. En el menú lateral elegí **KV** → **Create instance** (Crear).
3. Nombre: **`ranking-misiones`** → crear.
4. Copiá el **ID** que aparece (una tira larga de letras y números).
5. Pasámelo: yo lo agrego a la configuración del Worker.

---

## Parte 3 — El Worker (Cloudflare, conectado a GitHub)

1. En **Workers & Pages** → **Create** → **Connect to Git** (Conectar con Git).
2. Autorizá GitHub si te lo pide y elegí el repositorio **`space-mission-design`**.
3. Nombre del Worker: **`mision-espacial`**.
4. Si te pide el **comando de despliegue**, escribí: `npx wrangler deploy`.
5. **Deploy**.
6. Entrá al Worker → **Settings** → **Variables and Secrets** → **Add**:
   - Tipo **Secret**, nombre **`GROQ_KEY`**, valor tu clave de Groq (`gsk_...`).
7. En **Settings → Bindings → Add → KV Namespace**:
   - Nombre de la variable: **`RANKS`**
   - Namespace: **`ranking-misiones`**
8. Copiá la **URL del Worker** (algo como `https://mision-espacial.usuario.workers.dev`).

---

## Parte 4 — Conectar el juego con el Worker

Con la URL del Worker, se pega en `index.html`:

```js
const CFG={WORKER:"https://mision-espacial.<usuario>.workers.dev"};
```

Se sube el cambio y los tres modos quedan completos: jugar solo, **ranking compartido**
y **duelo contra IA**.

---

## Si el editor de Cloudflare no te deja escribir

A veces pasa cuando el navegador tiene **traducción automática** activada o un bloqueador.
Probá: clic **dentro** del código → **Ctrl + A** → borrar → pegar. Si no responde, recargá,
o desactivá la traducción de la página. Como alternativa, este repositorio evita el editor:
Cloudflare publica el código directo desde GitHub.
