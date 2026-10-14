import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
const dir = mkdtempSync(join(tmpdir(), "royal-test-"));
let child, base, cookie, csrf;
const password = "test-only-royal-password-284";
async function start() {
  child = spawn(process.execPath, ["server.js"], {
    env: {
      ...process.env,
      PORT: "0",
      HOST: "127.0.0.1",
      DATA_DIR: dir,
      NODE_ENV: "test",
      TRUST_PROXY: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  base = await new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(Error("Startup timeout")), 10000);
    child.stdout.on("data", (chunk) => {
      out += chunk;
      const match = /porta (\d+)/.exec(out);
      if (match) {
        clearTimeout(timer);
        resolve("http://127.0.0.1:" + match[1]);
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(Error("Server exited: " + code));
    });
  });
}
async function stop() {
  if (child && child.exitCode === null) {
    const done = once(child, "exit");
    child.kill("SIGTERM");
    await done;
  }
}
async function request(path, method = "GET", data, extra = {}) {
  return fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...extra,
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
before(async () => {
  await start();
});
after(async () => {
  await stop();
  rmSync(dir, { recursive: true, force: true });
});
test("site, catálogo e controles administrativos", async (t) => {
  await t.test(
    "publica páginas, assets e os preços reais dos planos",
    async () => {
      for (const path of [
        "/",
        "/admin",
        "/styles.css",
        "/app.js",
        "/admin.js",
        "/brand.svg",
      ]) {
        const r = await request(path);
        assert.equal(r.status, 200);
        assert.ok((await r.text()).length > 100);
        assert.ok(r.headers.get("content-security-policy"));
      }
      const services = await (await request("/api/services")).json();
      assert.equal(services.length, 7);
      assert.deepEqual(
        services.filter((s) => s.category === "plano").map((s) => s.price),
        [99.9, 119.9, 139.9, 159.9],
      );
      assert.equal((await request("/missing")).status, 404);
    },
  );
  await t.test(
    "bloqueia administração sem login e não cria senha padrão",
    async () => {
      assert.equal((await request("/api/admin/services")).status, 401);
      assert.equal(
        (await request("/api/login", "POST", { password })).status,
        503,
      );
      const setup = spawnSync(process.execPath, ["scripts/admin.js"], {
        env: { ...process.env, DATA_DIR: dir, ADMIN_PASSWORD: password },
        encoding: "utf8",
      });
      assert.equal(setup.status, 0, setup.stderr);
      assert.equal(
        (await request("/api/login", "POST", { password: "errada" })).status,
        401,
      );
    },
  );
  await t.test(
    "login usa cookie HttpOnly e CSRF, e bloqueia origem externa",
    async () => {
      assert.equal(
        (
          await request(
            "/api/login",
            "POST",
            { password },
            { Origin: "https://example.com" },
          )
        ).status,
        403,
      );
      const r = await request("/api/login", "POST", { password });
      assert.equal(r.status, 200);
      cookie = r.headers.get("set-cookie").split(";")[0];
      assert.match(r.headers.get("set-cookie"), /HttpOnly/);
      assert.match(r.headers.get("set-cookie"), /SameSite=Strict/);
      csrf = (await r.json()).csrf;
      assert.equal((await request("/api/admin/services")).status, 200);
      assert.equal(
        (
          await request(
            "/api/admin/services",
            "POST",
            {},
            { "X-CSRF-Token": "wrong" },
          )
        ).status,
        403,
      );
    },
  );
  let id;
  const item = {
    name: "Corte de teste",
    description: "Teste de persistência",
    price: 42.5,
    category: "servico",
    active: true,
  };
  await t.test("valida entrada, cria e altera serviços", async () => {
    for (const d of [
      { ...item, price: -1 },
      { ...item, name: "" },
      { ...item, category: "invalid" },
      { ...item, active: "yes" },
    ])
      assert.equal(
        (await request("/api/admin/services", "POST", d)).status,
        400,
      );
    const r = await request("/api/admin/services", "POST", item);
    assert.equal(r.status, 201);
    id = (await r.json()).id;
    assert.ok(
      (await (await request("/api/services")).json()).some(
        (s) => s.id === id && s.price === 42.5,
      ),
    );
    assert.equal(
      (
        await request("/api/admin/services/" + id, "PUT", {
          ...item,
          price: 49.9,
          active: false,
        })
      ).status,
      200,
    );
    assert.ok(
      !(await (await request("/api/services")).json()).some((s) => s.id === id),
    );
    assert.equal(
      (
        await request("/api/admin/services/" + id, "PUT", {
          ...item,
          price: null,
        })
      ).status,
      200,
    );
  });
  await t.test(
    "persiste no SQLite após reinício e expira a sessão",
    async () => {
      await stop();
      await start();
      assert.equal((await request("/api/admin/services")).status, 401);
      const services = await (await request("/api/services")).json();
      assert.ok(services.some((s) => s.id === id && s.price === null));
      const r = await request("/api/login", "POST", { password });
      cookie = r.headers.get("set-cookie").split(";")[0];
      csrf = (await r.json()).csrf;
    },
  );
  await t.test("exclui e encerra a sessão", async () => {
    assert.equal(
      (await request("/api/admin/services/" + id, "DELETE")).status,
      200,
    );
    assert.equal(
      (await request("/api/admin/services/" + id, "DELETE")).status,
      404,
    );
    assert.equal((await request("/api/logout", "POST")).status, 200);
    assert.equal((await request("/api/admin/services")).status, 401);
    cookie = "";
    csrf = "";
  });
  await t.test(
    "não recria itens excluídos quando o catálogo fica vazio",
    async () => {
      const login = await request("/api/login", "POST", { password });
      cookie = login.headers.get("set-cookie").split(";")[0];
      csrf = (await login.json()).csrf;
      const rows = await (await request("/api/admin/services")).json();
      for (const row of rows)
        assert.equal(
          (await request("/api/admin/services/" + row.id, "DELETE")).status,
          200,
        );
      await stop();
      await start();
      cookie = "";
      csrf = "";
      assert.deepEqual(await (await request("/api/services")).json(), []);
    },
  );
  await t.test("limita tentativas de senha", async () => {
    for (let i = 0; i < 10; i++)
      assert.equal(
        (await request("/api/login", "POST", { password: "invalid" })).status,
        401,
      );
    assert.equal(
      (await request("/api/login", "POST", { password: "invalid" })).status,
      429,
    );
    assert.equal(
      (
        await request(
          "/api/login",
          "POST",
          { password: "invalid" },
          { "X-Forwarded-For": "203.0.113.5, 10.0.0.1" },
        )
      ).status,
      401,
    );
  });
});
