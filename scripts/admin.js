import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
async function hiddenPrompt(message) {
  if (!process.stdin.isTTY)
    throw Error(
      "Use um terminal interativo ou injete ADMIN_PASSWORD pelo gerenciador de segredos.",
    );
  process.stdout.write(message);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      process.stdin.off("data", handler);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const handler = (chunk) => {
      for (const c of chunk) {
        if (c === "\u0003") {
          cleanup();
          reject(Error("Configuração cancelada."));
          return;
        }
        if (c === "\r" || c === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (c === "\u007f" || c === "\b") value = value.slice(0, -1);
        else if (c >= " " && value.length < 1024) value += c;
      }
    };
    process.stdin.on("data", handler);
  });
}
try {
  const dir = resolve(process.env.DATA_DIR || "data");
  const password =
    process.env.ADMIN_PASSWORD ||
    (await hiddenPrompt(
      "Defina uma senha exclusiva (mínimo 12 caracteres; entrada oculta): ",
    ));
  if (password.length < 12 || password.length > 1024)
    throw Error("A senha deve ter de 12 a 1024 caracteres.");
  if (
    !process.env.ADMIN_PASSWORD &&
    password !== (await hiddenPrompt("Confirme a senha: "))
  )
    throw Error("As senhas não coincidem.");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const salt = randomBytes(32).toString("hex");
  writeFileSync(
    resolve(dir, "admin.json"),
    JSON.stringify({
      salt,
      hash: scryptSync(password, salt, 64).toString("hex"),
    }),
    { mode: 0o600 },
  );
  console.log(
    "Senha administrativa configurada. Reinicie o servidor para encerrar as sessões existentes.",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
