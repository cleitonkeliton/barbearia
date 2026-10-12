import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, extname } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
const dir = resolve(process.env.DATA_DIR || resolve(root, "data"));
mkdirSync(dir, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(resolve(dir, "royal.sqlite"));
db.exec(
  "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS services (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, price REAL, category TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)",
);
if (db.prepare("PRAGMA user_version").get().user_version === 0) {
  db.exec("BEGIN");
  if (!db.prepare("SELECT COUNT(*) AS n FROM services").get().n) {
    const insert = db.prepare(
      "INSERT INTO services(name,description,price,category) VALUES(?,?,?,?)",
    );
    for (const row of [
      [
        "Corte masculino",
        "Um corte pensado para o seu estilo.",
        null,
        "servico",
      ],
      [
        "Barba & acabamento",
        "Design e cuidado para uma barba alinhada.",
        null,
        "servico",
      ],
      ["Sobrancelha", "Os detalhes fazem a diferença.", null, "servico"],
      ["Bronze", "Corte de cabelo quantas vezes quiser.", 99.9, "plano"],
      [
        "Prata",
        "Cortes ilimitados, barba 2x no mês e sobrancelha grátis.",
        119.9,
        "plano",
      ],
      [
        "Ouro",
        "Cortes e barba ilimitados, com sobrancelha grátis.",
        139.9,
        "plano",
      ],
      [
        "Diamante",
        "Cortes e barba ilimitados, sobrancelha grátis e 1 item do expositor de bebidas grátis.",
        159.9,
        "plano",
      ],
    ])
      insert.run(...row);
  }
  db.exec("PRAGMA user_version=1; COMMIT");
}
const sessions = new Map(),
  attempts = new Map();
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of sessions)
    if (value.expires <= now) sessions.delete(key);
  for (const [key, value] of attempts)
    if (value.until <= now) attempts.delete(key);
}, 60000);
cleanup.unref();
const json = (res, status, data) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
};
async function body(req) {
  let text = "";
  for await (const part of req) {
    text += part;
    if (text.length > 16000) throw new Error("Corpo muito grande");
  }
  return JSON.parse(text || "{}");
}
function session(req) {
  const id = /\brb_session=([a-f0-9]+)/.exec(req.headers.cookie || "")?.[1];
  const s = sessions.get(id);
  if (s && s.expires > Date.now()) return { id, ...s };
  if (id) sessions.delete(id);
  return null;
}
function valid(data) {
  return (
    typeof data.name === "string" &&
    data.name.trim().length > 0 &&
    data.name.length <= 100 &&
    typeof data.description === "string" &&
    data.description.length <= 1000 &&
    ["servico", "plano"].includes(data.category) &&
    (data.price === null ||
      (typeof data.price === "number" &&
        Number.isFinite(data.price) &&
        data.price >= 0 &&
        data.price <= 100000)) &&
    typeof data.active === "boolean"
  );
}
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  );
  try {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;
    if (path.startsWith("/api/")) {
      const s = session(req);
      if (!["GET", "HEAD"].includes(req.method)) {
        const origin = req.headers.origin;
        if (
          origin &&
          origin !==
            `${req.socket.encrypted ? "https" : "http"}://${req.headers.host}` &&
          !(
            process.env.NODE_ENV === "production" &&
            origin === `https://${req.headers.host}`
          )
        )
          return json(res, 403, { error: "Origem inválida" });
      }
      if (path === "/api/services" && req.method === "GET")
        return json(
          res,
          200,
          db.prepare("SELECT * FROM services WHERE active=1 ORDER BY id").all(),
        );
      if (path === "/api/login" && req.method === "POST") {
        const key = req.socket.remoteAddress;
        let a = attempts.get(key);
        if (!a || a.until < Date.now()) {
          a = { count: 0, until: Date.now() + 900000 };
          attempts.set(key, a);
        }
        if (a.count >= 10)
          return json(res, 429, {
            error: "Muitas tentativas. Aguarde 15 minutos.",
          });
        if (sessions.size >= 10000 || attempts.size >= 10000)
          return json(res, 503, {
            error: "Tente novamente em alguns minutos.",
          });
        if (!existsSync(resolve(dir, "admin.json")))
          return json(res, 503, {
            error: "Configure a senha no servidor com npm run admin:setup.",
          });
        const data = await body(req);
        if (typeof data.password !== "string" || data.password.length > 1024)
          return json(res, 400, { error: "Senha inválida" });
        const cfg = JSON.parse(
          readFileSync(resolve(dir, "admin.json"), "utf8"),
        );
        const hash = scryptSync(data.password, cfg.salt, 64);
        if (!timingSafeEqual(hash, Buffer.from(cfg.hash, "hex"))) {
          a.count++;
          return json(res, 401, { error: "Senha incorreta" });
        }
        attempts.delete(key);
        const id = randomBytes(32).toString("hex"),
          csrf = randomBytes(32).toString("hex");
        sessions.set(id, { csrf, expires: Date.now() + 8 * 3600000 });
        res.setHeader(
          "Set-Cookie",
          `rb_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
        );
        return json(res, 200, { csrf });
      }
      if (path.startsWith("/api/admin") || path === "/api/logout") {
        if (!s)
          return json(res, 401, { error: "Entre no painel para continuar." });
        if (req.method !== "GET" && req.headers["x-csrf-token"] !== s.csrf)
          return json(res, 403, { error: "Sessão inválida. Entre novamente." });
        if (path === "/api/logout" && req.method === "POST") {
          sessions.delete(s.id);
          res.setHeader(
            "Set-Cookie",
            "rb_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
          );
          return json(res, 200, { ok: true });
        }
        if (path === "/api/admin/session" && req.method === "GET")
          return json(res, 200, { csrf: s.csrf });
        if (path === "/api/admin/services" && req.method === "GET")
          return json(
            res,
            200,
            db.prepare("SELECT * FROM services ORDER BY id").all(),
          );
        if (path === "/api/admin/services" && req.method === "POST") {
          const d = await body(req);
          if (!valid(d))
            return json(res, 400, { error: "Revise os campos do serviço." });
          const r = db
            .prepare(
              "INSERT INTO services(name,description,price,category,active) VALUES(?,?,?,?,?)",
            )
            .run(
              d.name.trim(),
              d.description.trim(),
              d.price,
              d.category,
              +d.active,
            );
          return json(res, 201, { id: Number(r.lastInsertRowid) });
        }
        const match = /^\/api\/admin\/services\/(\d+)$/.exec(path);
        if (match && req.method === "PUT") {
          const d = await body(req);
          if (!valid(d))
            return json(res, 400, { error: "Revise os campos do serviço." });
          const r = db
            .prepare(
              "UPDATE services SET name=?,description=?,price=?,category=?,active=? WHERE id=?",
            )
            .run(
              d.name.trim(),
              d.description.trim(),
              d.price,
              d.category,
              +d.active,
              Number(match[1]),
            );
          return json(
            res,
            r.changes ? 200 : 404,
            r.changes ? { ok: true } : { error: "Serviço não encontrado" },
          );
        }
        if (match && req.method === "DELETE") {
          const r = db
            .prepare("DELETE FROM services WHERE id=?")
            .run(Number(match[1]));
          return json(
            res,
            r.changes ? 200 : 404,
            r.changes ? { ok: true } : { error: "Serviço não encontrado" },
          );
        }
      }
      return json(res, 404, { error: "Não encontrado" });
    }
    if (req.method !== "GET" && req.method !== "HEAD")
      return json(res, 405, { error: "Método não permitido" });
    const files = {
      "/": "index.html",
      "/admin": "admin.html",
      "/admin/": "admin.html",
      "/styles.css": "styles.css",
      "/app.js": "app.js",
      "/admin.js": "admin.js",
      "/brand.svg": "brand.svg",
      "/hero.png": "hero.png",
    };
    const file = files[path];
    if (!file) return json(res, 404, { error: "Não encontrado" });
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
    };
    res.writeHead(200, {
      "Content-Type": types[extname(file)],
      "Cache-Control": "no-cache",
    });
    res.end(
      req.method === "HEAD"
        ? undefined
        : readFileSync(resolve(root, "public", file)),
    );
  } catch (e) {
    console.error(e.message);
    if (!res.headersSent)
      json(res, 400, { error: "Não foi possível processar a solicitação." });
    else res.end();
  }
});
server.listen(
  Number(process.env.PORT || 3000),
  process.env.HOST || "0.0.0.0",
  () => console.log(`Royal Barber: porta ${server.address().port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
