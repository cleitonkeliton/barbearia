const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
function whatsapp(el, message) {
  el.href = "https://wa.me/5581981038416?text=" + encodeURIComponent(message);
  el.target = "_blank";
  el.rel = "noopener noreferrer";
}
document
  .querySelectorAll("[data-wa]")
  .forEach((el) => whatsapp(el, el.dataset.wa));
document.querySelector("#year").textContent = new Date().getFullYear();
const menu = document.querySelector(".menu-toggle");
menu.addEventListener("click", () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  menu.setAttribute("aria-expanded", String(open));
  document.querySelector("nav").classList.toggle("open", open);
});
document.querySelectorAll("nav a").forEach((a) =>
  a.addEventListener("click", () => {
    menu.setAttribute("aria-expanded", "false");
    document.querySelector("nav").classList.remove("open");
  }),
);
function node(tag, className, text) {
  const e = document.createElement(tag);
  e.className = className || "";
  if (text !== undefined) e.textContent = text;
  return e;
}
async function load() {
  try {
    const res = await fetch("/api/services");
    if (!res.ok) throw Error();
    const all = await res.json();
    for (const [category, target] of [
      ["servico", "#service-list"],
      ["plano", "#plan-list"],
    ]) {
      const container = document.querySelector(target);
      container.replaceChildren();
      const rows = all.filter((s) => s.category === category);
      if (!rows.length) {
        container.append(
          node("p", "muted", "Consulte as opções disponíveis pelo WhatsApp."),
        );
        continue;
      }
      rows.forEach((s, i) => {
        const plan = category === "plano";
        const card = node(
          "article",
          plan
            ? "plan-card" + (s.name === "Ouro" ? " featured" : "")
            : "service-card",
        );
        if (plan && s.name === "Ouro")
          card.append(node("span", "recommended", "EXPERIÊNCIA COMPLETA"));
        card.append(
          node(
            "span",
            plan ? "plan-icon" : "service-icon",
            plan ? ["♛", "♜", "♛", "◇"][i % 4] : "✂",
          ),
        );
        card.append(node("h3", "", s.name));
        const price = node(
          "p",
          "price",
          s.price === null ? "Sob consulta" : money.format(s.price),
        );
        if (plan && s.price !== null) price.append(node("small", "", " / mês"));
        card.append(price);
        card.append(node("p", "muted", s.description));
        const link = node(
          "a",
          plan ? "button outline" : "text-link gold",
          plan ? "Quero esse plano ↗" : "Agendar serviço ↗",
        );
        whatsapp(
          link,
          `Olá! Tenho interesse em ${s.name}. Gostaria de informações e disponibilidade.`,
        );
        card.append(link);
        container.append(card);
      });
    }
  } catch {
    for (const id of ["#service-list", "#plan-list"])
      document
        .querySelector(id)
        .replaceChildren(
          node(
            "p",
            "muted",
            "Não foi possível carregar os preços. Consulte nossa equipe pelo WhatsApp.",
          ),
        );
  }
}
load();
