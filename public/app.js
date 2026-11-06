const $ = id => document.getElementById(id);

const state = {
  mods: [],
  cart: new Map(),
  offset: 0,
  page: 1,
  total: 0,
  loading: false
};

const game = $("game");
const loader = $("loader");

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function validSettings() {
  if (!/^\d+\.\d+(\.\d+)?$/.test(game.value.trim())) {
    alert("Enter a valid Minecraft version.");
    return false;
  }
  return true;
}

async function api(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "API request failed");
  }

  return data;
}

// SEARCH MODS FROM MODRINTH

async function searchMods() {
  if (!validSettings() || state.loading) return;

  state.loading = true;

  $("searchBtn").disabled = true;
  $("mods").innerHTML = "<p>Loading Mods from Modrinth...</p>";

  try {
    const params = new URLSearchParams({
      q: $("query").value.trim(),
      offset: String(state.offset)
    });

    const data = await api(`/api/search?${params}`);

    state.mods = data.hits || [];
    state.total = data.total_hits || 0;

    await checkCompatibility();

    renderMods();

    $("resultCount").textContent =
      `${state.total.toLocaleString()} Mods found`;

    $("pageNumber").textContent = `Page ${state.page}`;

    $("previous").disabled = state.page === 1;
    $("next").disabled = state.offset + 20 >= state.total;

  } catch (error) {
    $("mods").textContent = error.message;
  } finally {
    state.loading = false;
    $("searchBtn").disabled = false;
  }
}

// CHECK COMPATIBILITY

async function checkCompatibility() {
  const ids = state.mods.map(mod => mod.project_id);

  const data = await api("/api/check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ids,
      game: game.value.trim(),
      loader: loader.value
    })
  });

  const results = new Map(
    data.results.map(item => [item.id, item])
  );

  state.mods.forEach(mod => {
    mod.compatibility = results.get(mod.project_id) || {
      compatible: false,
      reason: "Could not check compatibility"
    };
  });
}

// RENDER MOD LIST

function renderMods() {
  const container = $("mods");
  container.innerHTML = "";

  if (!state.mods.length) {
    container.innerHTML = "<p>No Mods found.</p>";
    return;
  }

  state.mods.forEach(mod => {
    const id = mod.project_id;
    const status = mod.compatibility || {};
    const good = status.compatible;
    const added = state.cart.has(id);

    const card = document.createElement("article");

    card.className = `mod-card ${good ? "good" : "bad"}`;

    const icon = document.createElement("img");
    icon.className = "mod-icon";
    icon.src = mod.icon_url || "";
    icon.alt = "";
    icon.onerror = () => {
      icon.style.visibility = "hidden";
    };

    const info = document.createElement("div");
    info.className = "mod-info";

    info.innerHTML = `
      <h3>${escapeHTML(mod.title)}</h3>

      <p>${escapeHTML(mod.description)}</p>

      <div class="status ${good ? "good" : "bad"}">
        ${good
          ? "● Compatible"
          : "● " + escapeHTML(status.reason)}
      </div>

      <p>${Number(mod.downloads || 0).toLocaleString()} downloads</p>
    `;

    const button = document.createElement("button");

    button.className = "add-btn";

    if (!good) {
      button.textContent = "Unavailable";
      button.disabled = true;
    } else if (added) {
      button.textContent = "✓ Added";
      button.disabled = true;
    } else {
      button.textContent = "+ Add to Inbox";
      button.addEventListener("click", () => addToCart(mod));
    }

    card.append(icon, info, button);
    container.appendChild(card);
  });
}

// ADD TO INBOX

function addToCart(mod) {
  if (!mod.compatibility?.compatible) return;

  if (state.cart.size >= 30) {
    alert("Maximum 30 manually selected Mods.");
    return;
  }

  state.cart.set(mod.project_id, mod);

  updateCart();
  renderMods();
}

// REMOVE FROM INBOX

function removeFromCart(id) {
  state.cart.delete(id);

  updateCart();
  renderMods();
}

// UPDATE CART

function updateCart() {
  $("cartCount").textContent = state.cart.size;

  $("cartTotal").textContent =
    `${state.cart.size} Mods Selected`;

  $("downloadBtn").disabled =
    state.cart.size === 0 || state.loading;

  const container = $("cartItems");
  container.innerHTML = "";

  if (state.cart.size === 0) {
    container.innerHTML =
      "<p>No Mods in your inbox. Explore and add some Mods.</p>";
  }

  state.cart.forEach(mod => {
    const item = document.createElement("div");

    item.className = "cart-item";

    const icon = document.createElement("img");
    icon.className = "mod-icon";
    icon.src = mod.icon_url || "";
    icon.alt = "";
    icon.onerror = () => {
      icon.style.visibility = "hidden";
    };

    const info = document.createElement("div");
    info.className = "cart-item-info";

    info.innerHTML = `
      <h3>${escapeHTML(mod.title)}</h3>
      <p>✓ Compatible with ${escapeHTML(game.value)} ${escapeHTML(loader.value)}</p>
    `;

    const remove = document.createElement("button");
    remove.className = "remove-btn";
    remove.textContent = "Remove";

    remove.addEventListener("click", () => {
      removeFromCart(mod.project_id);
    });

    item.append(icon, info, remove);
    container.appendChild(item);
  });

  $("downloadBtn").disabled =
    state.cart.size === 0 || state.loading;
}

// DOWNLOAD ALL MODS

async function downloadAll() {
  if (!state.cart.size || state.loading) return;

  state.loading = true;

  const button = $("downloadBtn");
  button.disabled = true;

  $("downloadStatus").textContent =
    "Resolving compatible Mods and dependencies...";

  $("issues").innerHTML = "";

  try {
    const selectedIds = [...state.cart.keys()];

    const result = await api("/api/resolve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ids: selectedIds,
        game: game.value.trim(),
        loader: loader.value
      })
    });

    if (!result.files.length) {
      throw new Error("No downloadable compatible Mods found.");
    }

    const zip = new JSZip();
    const folder = zip.folder("mods");

    let success = 0;
    let failed = 0;
    let totalBytes = 0;

    // Download files from official Modrinth CDN

    for (let i = 0; i < result.files.length; i++) {
      const file = result.files[i];

      button.textContent =
        `Downloading ${i + 1}/${result.files.length}`;

      $("downloadStatus").textContent =
        `Downloading ${file.name}`;

      try {
        // Only accept official Modrinth CDN URLs
        const parsed = new URL(file.url);

        if (
          parsed.protocol !== "https:" ||
          parsed.hostname !== "cdn.modrinth.com"
        ) {
          throw new Error("Untrusted download URL");
        }

        const response = await fetch(file.url);

        if (!response.ok) {
          throw new Error("Download failed");
        }

        const blob = await response.blob();

        totalBytes += blob.size;

        if (totalBytes > 500 * 1024 * 1024) {
          throw new Error("ZIP size exceeded 500 MB limit");
        }

        folder.file(file.name, blob);

        success++;

      } catch (error) {
        failed++;
        console.error(file.name, error);
      }
    }

    if (!success) {
      throw new Error("All downloads failed.");
    }

    button.textContent = "Creating ZIP...";

    const content = await zip.generateAsync(
      {
        type: "blob",
        compression: "STORE"
      },
      metadata => {
        $("downloadStatus").textContent =
          `Creating ZIP: ${metadata.percent.toFixed(0)}%`;
      }
    );

    const url = URL.createObjectURL(content);

    const link = document.createElement("a");

    link.href = url;

    link.download =
      `ModPackX-${game.value}-${loader.value}.zip`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 60000);

    $("downloadStatus").textContent =
      `Finished! ${success} files added. ${failed} failed.`;

    // Show unresolved dependencies
    const issueList = [
      ...(result.issues || []),
      ...(failed ? [{
        id: "download",
        reason: `${failed} file downloads failed`
      }] : [])
    ];

    $("issues").innerHTML = issueList.length
      ? "<h3>Skipped / Failed</h3>" +
        issueList.map(issue =>
          `<p class="issue-item">${escapeHTML(issue.id)}: ${escapeHTML(issue.reason)}</p>`
        ).join("")
      : "";

  } catch (error) {
    $("downloadStatus").textContent =
      "Error: " + error.message;

  } finally {
    state.loading = false;

    button.textContent = "↓ Download All ZIP";

    updateCart();
  }
}

// TAB SWITCHING

function switchTab(tab) {
  document.querySelectorAll(".tab").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.tab === tab
    );
  });

  $("exploreView").hidden = tab !== "explore";
  $("inboxView").hidden = tab !== "inbox";

  if (tab === "inbox") updateCart();
}

document.querySelectorAll(".tab").forEach(button => {
  button.addEventListener("click", () => {
    switchTab(button.dataset.tab);
  });
});

// EVENTS

$("searchBtn").addEventListener("click", () => {
  state.offset = 0;
  state.page = 1;
  searchMods();
});

$("query").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    state.offset = 0;
    state.page = 1;
    searchMods();
  }
});

$("apply").addEventListener("click", () => {
  if (!validSettings()) return;

  // Clear old selection after settings change
  state.cart.clear();

  updateCart();

  state.offset = 0;
  state.page = 1;

  searchMods();
});

$("previous").addEventListener("click", () => {
  if (state.offset >= 20) {
    state.offset -= 20;
    state.page--;
    searchMods();
  }
});

$("next").addEventListener("click", () => {
  if (state.offset + 20 < state.total) {
    state.offset += 20;
    state.page++;
    searchMods();
  }
});

$("clearCart").addEventListener("click", () => {
  state.cart.clear();
  updateCart();
  renderMods();
});

$("downloadBtn").addEventListener("click", downloadAll);

// INITIALIZE

updateCart();
searchMods();
