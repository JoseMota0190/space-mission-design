# AGENTS.md — Diseña tu misión espacial

Documento de contexto para agentes de IA (y para cualquier persona) que retomen este
proyecto. Incluye arquitectura, despliegue, cómo probar y **pendientes**.

## Qué es

Juego educativo con temática espacial para el **NASA Space Apps Challenge 2026**.
El jugador elige un objetivo, arma una nave (cohete, órbita, instrumentos, energía y
duración) y la lanza. El juego calcula ciencia, energía, datos, masa y costo, y da un
puntaje de 0 a 100 con un informe educativo.

Tres modos:
- **Jugar solo** — diseña y mira el informe.
- **Ranking diario** — publica tu diseño y compite contra el resto del día.
- **Duelo contra IA** — un modelo de lenguaje (Groq) diseña su propia nave.

## Enlaces en vivo

- **Juego (GitHub Pages):** https://josemota0190.github.io/space-mission-design/
- **Worker (Cloudflare):** https://space-mission-design.jose-motarivas90.workers.dev
  - Abrirlo a mano devuelve `{"error":"method not allowed"}`. **Es correcto**: el Worker
    solo acepta pedidos POST del juego (IA + ranking). No es una página.
- **Repositorio:** https://github.com/JoseMota0190/space-mission-design

## Arquitectura

```
Jugador → index.html (GitHub Pages)
              │  fetch POST {op:"ai"|"publish"|"rank"}
              ▼
         worker.js (Cloudflare Workers)
              ├── Groq (3 modelos)          → op:"ai"
              └── Cloudflare KV (RANKS)     → op:"publish" / op:"rank"
```

Sin base de datos y sin Cerebras. El ranking usa **Cloudflare KV**. Si no hay Worker
configurado, el juego cae a **modo local** (localStorage) automáticamente.

### El juego — `index.html`

Un solo archivo (HTML + CSS + JS, sin dependencias ni build). Fuente con Google Fonts
"Barlow Semi Condensed". Respeta modo claro/oscuro del sistema y es responsive.

Puntos clave del código:
- `CFG` — configuración. `CFG.WORKER` = URL del Worker.
- `SC`, `LV`, `OR`, `IN`, `AN` — datos de misiones, cohetes, órbitas, instrumentos, antenas.
- `calc()` — física/economía del diseño (masa, energía, datos, costo, ciencia).
- `run(seed)` / `ev(design, seed)` — simulación determinista con dado sembrado → puntaje.
- `S` — estado del diseño actual.
- `publish()` / `board()` — publicar y leer el ranking (vía Worker o local).
- `optimize()` — optimizador local (rival "local").
- `aiDesign()` / `duel()` — rivales de IA vía Worker.
- `RIV` — lista de rivales: `local`, `groq-gptoss`, `groq-qwen`, `groq-gptoss20`.

### El Worker — `worker.js`

Módulo ES (`export default { fetch }`). Enruta por `body.op`:
- `ai` — reenvía el prompt a Groq. Cachea por `rival/day/sc` en la Cache API (1 consulta
  por día y escenario). Modelos vigentes: `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`,
  `openai/gpt-oss-20b`. Los modelos gpt-oss requieren `reasoning_effort:"low"`.
- `publish` — sanea el diseño (`cleanDesign`) y guarda en KV con clave
  `run:<day>:<sc>:<uuid>`. Nunca guarda el puntaje, solo el diseño (el puntaje se
  recalcula en el cliente, evitando trampas).
- `rank` — lista las claves del día/escenario y devuelve `{rows:[{name,design}]}`.
- Validación server-side; CORS configurable con la variable `ORIGIN`.

## Despliegue (ya configurado, automático)

- **GitHub Pages:** rama `main`, carpeta raíz. Sirve `index.html`.
- **Cloudflare Workers Builds:** el repo está conectado. Configuración:
  - Build command: `None` · Deploy command: `npx wrangler deploy` · Root: `/`
  - Production branch: `main`
  - **Cada `git push` a `main` republica el Worker automáticamente.**
- **KV:** namespace `ranking-misiones`, id `8dd56eb97b654e82859d0fd52b8bb343`,
  enlazado como binding **`RANKS`** (declarado en `wrangler.toml`).
- **Secreto:** `GROQ_KEY` (runtime, en Cloudflare — nunca en el repo).
- Cuenta Cloudflare: `211d173d7a88ba6895089d7d9f85ca17` (subdominio `jose-motarivas90.workers.dev`).

## Estructura del repo

```
index.html        Juego (se publica en GitHub Pages)
worker.js         API de Cloudflare (IA + ranking)
wrangler.toml     Config del Worker + binding KV
README.md         Presentación del proyecto
DEPLOY.md         Guía de publicación (no técnica)
AGENTS.md         Este archivo
captures/         Capturas para el README/portfolio
legacy/           Versión v2 original (Supabase/Cerebras) — solo referencia
```

## Cómo probar

### Worker en Node (sin Cloudflare)

Hay un arnés que simula KV y la IA:
- `%TEMP%\opencode\test-worker.mjs` (importa una copia `worker-test.mjs`).
- Revisa `op ai`, `publish`, `rank`, validaciones, saneo y CORS.

### Sitio en Chrome headless (CDP)

Arnés reutilizable en `%TEMP%\opencode\cdptest*.mjs`. Técnica: lanzar Chrome con
`--headless=new --remote-debugging-port=PORT` y manejarlo por CDP con el `WebSocket`
nativo de Node 24. Verifica modo solo, ranking, duelo y que no haya excepciones.

### Pruebas del Worker ya ejecutadas (esperado)

```
GET             → {"error":"method not allowed"}      (405)
POST op:rank    → {"rows":[...]}                       (200)
POST op:publish → {"ok":true}                          (200)
POST op:ai      → {"text":"{...}"}                     (200)
```

## Secretos y seguridad

- **Nunca** commitear `GROQ_KEY`. Vive como secreto *runtime* en Cloudflare.
- Cuidado con las DOS secciones "Variables and secrets" del dashboard:
  - **"Runtime variables and secrets"** → las que usa el Worker al correr. **Aquí va `GROQ_KEY`.**
  - **"Variables and secrets" dentro del bloque Builds** → solo para compilar. **No sirve aquí.**
- **Pendiente "cerrar la puerta":** hoy el CORS es `*`. Agregar la variable de entorno
  `ORIGIN` = `https://josemota0190.github.io` para que solo el juego pueda usar el Worker.

## Limitaciones conocidas

- **KV es de consistencia eventual:** un diseño recién publicado tarda hasta ~60 s en
  ser visible para los demás. Mitigado en el cliente: tu propia fila se muestra al
  instante marcada "(tú)" (localStorage `mine`, deduplicada por nombre+diseño).
- El ranking es **diario**: usa `DAY` (fecha `YYYYMMDD`). Mañana empieza vacío (se pueden
  borrar las pruebas desde KV sin problema).
- Datos de prueba actuales en el KV de hoy: `Ana`, `Beto`, `Jugador01`, `PilotoFinal2`.

## TODO / Pendientes

1. **Cerrar la puerta (ORIGIN).** Agregar la variable `ORIGIN` al Worker (Settings →
   Runtime variables) con el origen del sitio, para restringir quién puede usarlo.
2. **Probar el juego manualmente** de punta a punta en el navegador (los 3 modos) y
   confirmar la experiencia real, no solo el test automatizado.
3. **Adecuar el juego a un público joven + más UX/UI.** Rediseño visual y de experiencia
   para estudiantes jóvenes: lenguaje más cercano, jerarquía visual más clara, feedback
   más inmediato/didáctico, motivación (progreso, logros), animaciones, iconografía,
   y accesibilidad. Mantener el single-file sin dependencias si es posible.
4. **(Opcional)** Limpiar los datos de prueba del KV antes de una demo.

## Convenciones

- **Idioma de la UI y los textos:** español, tono claro y breve.
- **Sin dependencias ni build** en el juego (un solo `index.html`).
- **No guardar puntajes calculados** del lado servidor; recalcular en el cliente.
- Mantener el repo publicable: nada de secretos, claves ni `.env` en Git.
- Al cambiar `index.html` o `worker.js`, hacer commit y `git push` a `main`: GitHub Pages
  y Cloudflare se actualizan solos.
