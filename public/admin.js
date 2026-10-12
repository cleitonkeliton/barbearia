let csrf = "";
const $ = (id) => document.getElementById(id);
const notice = (message) => {
  $("notice").textContent = message;
};
async function api(path, method = "GET", data) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await res.json();
  if (!res.ok) {
    if (res.status === 401) show(false);
    throw Error(result.error || "Falha na solicitação.");
  }
  return result;
}
function show(connected) {
  $("login").hidden = connected;
  $("dashboard").hidden = !connected;
  if (!connected) {
    csrf = "";
    $("items").replaceChildren();
  }
}
function clear() {
  $("service-form").reset();
  $("item-id").value = "";
  $("form-title").textContent = "Novo item";
}
async function load() {
  const items = await api("/api/admin/services");
  $("items").replaceChildren();
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "admin-item";
    const title = document.createElement("h3");
    title.textContent = item.name;
    const desc = document.createElement("p");
    desc.className = "muted";
    desc.textContent = `${item.category === "plano" ? "Plano" : "Serviço"} · ${item.price === null ? "Sob consulta" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.price)} · ${item.active ? "Publicado" : "Oculto"}`;
    const actions = document.createElement("div");
    actions.className = "actions";
    const edit = document.createElement("button");
    edit.className = "button outline";
    edit.textContent = "Editar";
    edit.onclick = () => {
      $("item-id").value = item.id;
      for (const k of ["name", "description", "category"]) $(k).value = item[k];
      $("price").value = item.price ?? "";
      $("active").checked = !!item.active;
      $("form-title").textContent = "Editar item";
      $("name").focus();
    };
    const del = document.createElement("button");
    del.className = "delete";
    del.textContent = "Excluir";
    del.onclick = async () => {
      if (!confirm(`Excluir “${item.name}”? Esta ação não pode ser desfeita.`))
        return;
      try {
        await api("/api/admin/services/" + item.id, "DELETE");
        if ($("item-id").value === String(item.id)) clear();
        await load();
        notice("Item excluído.");
      } catch (e) {
        notice(e.message);
      }
    };
    actions.append(edit, del);
    card.append(title, desc, actions);
    $("items").append(card);
  });
}
$("login-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const data = await api("/api/login", "POST", {
      password: $("password").value,
    });
    csrf = data.csrf;
    $("password").value = "";
    show(true);
    await load();
    notice("");
  } catch (e) {
    notice(e.message);
  }
};
$("service-form").onsubmit = async (e) => {
  e.preventDefault();
  const id = $("item-id").value;
  try {
    await api(
      "/api/admin/services" + (id ? "/" + id : ""),
      id ? "PUT" : "POST",
      {
        name: $("name").value,
        description: $("description").value,
        category: $("category").value,
        price: $("price").value === "" ? null : Number($("price").value),
        active: $("active").checked,
      },
    );
    clear();
    await load();
    notice("Item salvo e catálogo atualizado.");
  } catch (e) {
    notice(e.message);
  }
};
$("cancel").onclick = clear;
$("logout").onclick = async () => {
  try {
    await api("/api/logout", "POST");
    show(false);
    clear();
    notice("Você saiu do painel.");
  } catch (e) {
    notice(e.message);
  }
};
(async () => {
  try {
    const session = await api("/api/admin/session");
    csrf = session.csrf;
    show(true);
    await load();
  } catch (e) {
    show(false);
  }
})();
