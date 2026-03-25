function slugifyMosqueId(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32);
}

function ensureAdminUX() {
  const modal = document.getElementById("modal-admin");
  if (!modal) return;
  const box = modal.querySelector(".box.admin");
  if (!box) return;

  // Petit helper en haut du panneau
  if (!document.getElementById("admin-ux-hint")) {
    const hint = document.createElement("div");
    hint.id = "admin-ux-hint";
    hint.className = "small";
    hint.style.marginTop = "6px";
    hint.style.marginBottom = "10px";
    hint.style.textAlign = "left";
    hint.innerHTML = `Astuce : pour ajouter une mosquée, mets un <strong>nom</strong> puis clique <strong>Ajouter</strong>. L'ID est généré automatiquement.`;
    const title = box.querySelector("h3");
    if (title?.parentNode) title.parentNode.insertBefore(hint, title.nextSibling);
  }

  // Sections pliables (sans toucher HTML)
  const makeCollapsible = (h3Text) => {
    const h3 = Array.from(box.querySelectorAll("h3")).find((x) => x.textContent.trim() === h3Text);
    if (!h3 || h3.dataset.collapsible === "1") return;

    h3.dataset.collapsible = "1";
    h3.style.cursor = "pointer";
    h3.title = "Cliquer pour plier/déplier";

    // on regroupe les éléments jusqu'au prochain h3
    const nodes = [];
    let n = h3.nextElementSibling;
    while (n && n.tagName.toLowerCase() !== "h3") {
      nodes.push(n);
      n = n.nextElementSibling;
    }

    let open = true;
    const apply = () => nodes.forEach((x) => { x.style.display = open ? "" : "none"; });

    h3.onclick = () => {
      open = !open;
      apply();
    };
  };

  makeCollapsible("Collecte (public)");
  makeCollapsible("Demandes de dons (à valider)");
}

function wireSuperAddMosqueUX() {
  const nameInput = document.getElementById("adm-new-name");
  const addBtn = document.getElementById("add-mosque");
  if (!nameInput || !addBtn) return;
  if (addBtn.dataset.wired === "1") return;
  addBtn.dataset.wired = "1";

  // Preview ID sous l'input
  if (!document.getElementById("adm-new-preview")) {
    const p = document.createElement("div");
    p.id = "adm-new-preview";
    p.className = "small";
    p.style.marginTop = "6px";
    p.style.textAlign = "left";
    p.textContent = "ID : —";
    nameInput.parentNode.appendChild(p);
  }
  const preview = document.getElementById("adm-new-preview");

  const updatePreview = () => {
    const id = slugifyMosqueId(nameInput.value);
    preview.textContent = `ID : ${id || "—"}`;
  };
  nameInput.addEventListener("input", updatePreview);
  updatePreview();
}
