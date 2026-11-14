// Cloudflare Worker — el "mensajero" del juego.
// Hace DOS cosas, sin bases de datos:
//   1) Habla con la IA (Groq) guardando la key escondida.
//   2) Guarda y lee el ranking en la "caja de fichas" (KV).
//
// Configuración en Cloudflare:
//   - Variable/Secreto:  GROQ_KEY = tu API key de Groq (obligatorio)
//   - Variable opcional: ORIGIN   = la URL de tu GitHub Pages (recomendado)
//   - Binding KV:        RANKS    = el nombre de la caja KV que crees
//
// IDs de modelo vigentes en Groq (verificados 2026-11-14):
//   openai/gpt-oss-120b, openai/gpt-oss-20b, qwen/qwen3.8-27b

const P = {
  "groq-gptoss":   ["https://api.groq.com/openai/v1/chat/completions", "GROQ_KEY", "openai/gpt-oss-120b", { reasoning_effort: "low" }],
  "groq-qwen":     ["https://api.groq.com/openai/v1/chat/completions", "GROQ_KEY", "qwen/qwen3.8-27b"],
  "groq-gptoss20": ["https://api.groq.com/openai/v1/chat/completions", "GROQ_KEY", "openai/gpt-oss-20b",  { reasoning_effort: "low" }],
};

const json = (o, status, cors) =>
  new Response(JSON.stringify(o), { status: status || 200, headers: { ...cors, "Content-Type": "application/json" } });

// Deja el diseño en un formato seguro y acotado (nada de valores raros).
function cleanDesign(d) {
  const g = (v, n) => { v = +v; return Number.isInteger(v) && v >= 0 && v < n ? v : 0; };
  return {
    sc: g(d && d.sc, 3), lv: g(d && d.lv, 3), or: g(d && d.or, 4), an: g(d && d.an, 3),
    ins: [...new Set((Array.isArray(d && d.ins) ? d.ins : []).map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < 5))],
    area: Math.min(12, Math.max(0.5, Math.round(((d && +d.area) || 1) * 2) / 2)),
    bat: Math.min(3, Math.max(0, Math.round((d && +d.bat) || 0))),
    yrs: Math.min(5, Math.max(1, Math.round((d && +d.yrs) || 1))),
  };
}

export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": env.ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405, cors);

    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400, cors); }

    const op = body.op || (body.rival ? "ai" : "rank");
    if (op === "ai") return ai(body, env, cors);
    if (op === "publish") return publish(body, env, cors);
    if (op === "rank") return rank(body, env, cors);
    return json({ error: "op desconocida" }, 400, cors);
  },
};

// ---------- Ranking (KV) ----------
async function publish(body, env, cors) {
  const day = +body.day, sc = +body.sc, name = String(body.name || "").trim().slice(0, 20);
  if (!/^\d{8}$/.test(String(day)) || ![0, 1, 2].includes(sc) || !name) return json({ error: "datos inválidos" }, 400, cors);
  if (!env.RANKS) return json({ error: "falta el binding RANKS" }, 500, cors);
  const id = crypto.randomUUID();
  const key = `run:${day}:${sc}:${id}`;
  const value = JSON.stringify({ name, design: cleanDesign(body.design), t: Date.now() });
  await env.RANKS.put(key, value);
  return json({ ok: true }, 200, cors);
}

async function rank(body, env, cors) {
  const day = +body.day, sc = +body.sc;
  if (!/^\d{8}$/.test(String(day)) || ![0, 1, 2].includes(sc)) return json({ error: "datos inválidos" }, 400, cors);
  if (!env.RANKS) return json({ error: "falta el binding RANKS" }, 500, cors);
  const prefix = `run:${day}:${sc}:`;
  const list = await env.RANKS.list({ prefix, limit: 1000 });
  const rows = [];
  for (const k of list.keys) {
    const v = await env.RANKS.get(k.name);
    if (!v) continue;
    try { const o = JSON.parse(v); rows.push({ name: o.name, design: o.design }); } catch {}
  }
  return json({ rows }, 200, cors);
}

// ---------- Rivales de IA (Groq) ----------
async function ai(body, env, cors) {
  const p = P[body.rival];
  if (!p || !/^\d{8}$/.test(String(body.day)) || ![0, 1, 2].includes(body.sc) || typeof body.prompt !== "string")
    return json({ error: "bad request" }, 400, cors);

  const secret = env[p[1]];
  if (!secret) return json({ error: "falta el secreto " + p[1] }, 500, cors);

  // Una sola consulta por rival, escenario y día (cuida la cuota gratuita).
  const cacheKey = new Request(`https://cache.local/${body.rival}/${body.day}/${body.sc}`);
  const hit = await caches.default.match(cacheKey);
  if (hit) return new Response(hit.body, { headers: { ...cors, "Content-Type": "application/json" } });

  const payload = {
    model: p[2], temperature: 0.2, max_tokens: 512,
    messages: [{ role: "user", content: body.prompt.slice(0, 7000) }],
    ...(p[3] || {}),
  };
  const r = await fetch(p[0], {
    method: "POST",
    headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    return json({ error: r.status, detail: detail.slice(0, 300) }, 502, cors);
  }
  const j = await r.json();
  const text = j?.choices?.[0]?.message?.content ?? "";
  const out = JSON.stringify({ text });
  await caches.default.put(cacheKey, new Response(out, { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=86400" } }));
  return new Response(out, { headers: { ...cors, "Content-Type": "application/json" } });
}
