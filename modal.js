const HOST_ID = "client-instance-lab-host";
const LAUNCHER_ID = "client-instance-lab-launcher";
const HOTKEY_LABEL = "Alt+Q";

const LAB_SCREENS = [
  {
    id: "aram-mayhem-champ-select",
    label: "ARAM Mayhem Champ Select",
    note: "Selecao de campeoes real com payload local inspirado no dump de ARAM Mayhem.",
  },
  {
    id: "match-found",
    label: "Partida Encontrada",
    note: "Ready check real do client com busca ARAM e popup de partida encontrada.",
  },
  {
    id: "in-game",
    label: "Partida em Andamento",
    note: "Estado do client durante ingame com a fase InProgress.",
  },
  {
    id: "pre-end",
    label: "Pre-End-of-Game",
    note: "Tela intermediaria real antes do pos-partida.",
  },
  {
    id: "waiting-stats",
    label: "Waiting for Stats",
    note: "Estado em que o client aguarda o bloco final de estatisticas.",
  },
  {
    id: "postgame",
    label: "Pos-Partida",
    note: "Tela real de pos-partida com scoreboard e estatisticas placeholder.",
  },
  {
    id: "honor-vote",
    label: "Honra Pos-Partida",
    note: "Cerimonia real de honra baseada no dump da vote ceremony.",
  },
  {
    id: "honor",
    label: "Honra Recebida",
    note: "Notificacao real de honra recebida com placeholders.",
  },
  {
    id: "honor-upgrade",
    label: "Honor Upgrade",
    note: "Fluxo de subida de honra baseado em level-change.",
  },
  {
    id: "reconnect",
    label: "Reconnect",
    note: "Tela real de reconexao do client.",
  },
];

let observer = null;
let hotkeyHandler = null;

export function initClientInstanceLabModal() {
  ensureLauncher();
  bindHotkey();
  observeDom();
}

export function disposeClientInstanceLabModal() {
  observer?.disconnect();
  observer = null;

  if (hotkeyHandler) {
    document.removeEventListener("keydown", hotkeyHandler, true);
    hotkeyHandler = null;
  }

  document.getElementById(HOST_ID)?.remove();
  document.getElementById(LAUNCHER_ID)?.remove();
}

function observeDom() {
  if (observer || !document.documentElement) return;

  observer = new MutationObserver(() => {
    ensureLauncher();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function bindHotkey() {
  if (hotkeyHandler) return;

  hotkeyHandler = (event) => {
    if (!event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return;
    if (event.key.toLowerCase() !== "q") return;

    event.preventDefault();
    event.stopPropagation();
    toggleModal();
  };

  document.addEventListener("keydown", hotkeyHandler, true);
}

function ensureLauncher() {
  if (!document.body || document.getElementById(LAUNCHER_ID)) return;

  const button = document.createElement("button");
  button.id = LAUNCHER_ID;
  button.type = "button";
  button.textContent = "Instancias";
  button.title = `Client Instance Lab (${HOTKEY_LABEL})`;
  button.style.cssText = [
    "position:fixed",
    "left:18px",
    "top:18px",
    "z-index:2147483645",
    "min-width:120px",
    "height:38px",
    "padding:0 16px",
    "border:1px solid #785a28",
    "border-radius:999px",
    "background:linear-gradient(180deg,#5a2033 0%,#0a1428 100%)",
    "color:#f0e6d2",
    "font:600 12px/1 Arial,sans-serif",
    "letter-spacing:.04em",
    "text-transform:uppercase",
    "cursor:pointer",
    "box-shadow:0 10px 28px rgba(0,0,0,.55)",
    "app-region:no-drag",
  ].join(";");
  button.addEventListener("click", toggleModal);

  document.body.appendChild(button);
}

function toggleModal() {
  const current = document.getElementById(HOST_ID);
  if (current) {
    current.remove();
    return;
  }

  createModal();
}

async function triggerScenario(id, statusNode) {
  const api = window.__ClientInstanceLabRuntime;
  const label = LAB_SCREENS.find((screen) => screen.id === id)?.label || id;

  if (!api) {
    console.warn("[client-instance-lab] Runtime missing while trying to open", id);
    flashLauncher("Runtime ausente");
    setStatus(statusNode, "Runtime ausente. Recarregue o UX.", true);
    return;
  }

  flashLauncher(`Abrindo: ${label}`);
  setStatus(statusNode, `Abrindo ${label}...`);

  try {
    const result = await api.open(id);
    console.info("[client-instance-lab] scenario result", JSON.stringify(result));
    const found = result?.targetFoundAfterDelay || result?.targetFound;
    setStatus(statusNode, found ? `${label} aberto.` : `${label} enviado ao client.`);
  } catch (error) {
    console.warn("[client-instance-lab] scenario failed", id, error);
    flashLauncher("Falha");
    setStatus(statusNode, error?.message || "Falha ao abrir a instancia.", true);
  }
}

function createModal() {
  if (!document.body) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "position:fixed;inset:0;z-index:2147483646;pointer-events:none;app-region:no-drag;";

  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = getModalHtml();
  document.body.appendChild(host);

  const panel = root.querySelector(".cil-panel");
  const list = root.querySelector(".cil-list");
  const status = root.querySelector("#cil-status");

  LAB_SCREENS.forEach((screen) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cil-card";
    button.innerHTML = `
      <span class="cil-card-title">${screen.label}</span>
      <span class="cil-card-note">${screen.note}</span>
    `;
    button.addEventListener("click", async () => {
      await triggerScenario(screen.id, status);
      host.remove();
    });
    list.appendChild(button);
  });

  setStatus(status, `Pressione ${HOTKEY_LABEL} para abrir ou fechar este painel.`);

  root.querySelector("#cil-close").addEventListener("click", () => host.remove());
  root.querySelector("#cil-clear").addEventListener("click", async () => {
    const api = window.__ClientInstanceLabRuntime;
    if (!api) {
      setStatus(status, "Runtime ausente. Recarregue o UX.", true);
      return;
    }

    try {
      await api.clear();
      flashLauncher("Estado real");
      setStatus(status, "Estado real restaurado.");
      host.remove();
    } catch (error) {
      setStatus(status, error?.message || "Falha ao restaurar estado real.", true);
    }
  });

  let drag = null;
  const titlebar = root.querySelector(".cil-titlebar");
  titlebar.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    const rect = panel.getBoundingClientRect();
    drag = {
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
    };
    titlebar.setPointerCapture(event.pointerId);
  });

  titlebar.addEventListener("pointermove", (event) => {
    if (!drag) return;
    panel.style.left = `${Math.max(12, drag.left + event.clientX - drag.x)}px`;
    panel.style.top = `${Math.max(12, drag.top + event.clientY - drag.y)}px`;
    panel.style.transform = "none";
  });

  titlebar.addEventListener("pointerup", () => {
    drag = null;
  });
}

function getModalHtml() {
  return `
    <style>
      :host {
        pointer-events: none;
        font-family: Arial, sans-serif;
      }

      .cil-panel {
        pointer-events: auto;
        position: fixed;
        left: 50%;
        top: 88px;
        transform: translateX(-50%);
        width: 540px;
        max-height: calc(100vh - 120px);
        display: grid;
        grid-template-rows: 46px auto 1fr auto;
        background: linear-gradient(180deg, #0a1428 0%, #09111f 100%);
        color: #f0e6d2;
        border: 1px solid #785a28;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.58);
      }

      .cil-titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 12px;
        background: #0b162d;
        border-bottom: 1px solid #463714;
        cursor: move;
        user-select: none;
      }

      .cil-title {
        font-size: 13px;
        letter-spacing: .08em;
        text-transform: uppercase;
        color: #c8aa6e;
      }

      .cil-subtitle {
        color: #8f8a7d;
        font-size: 11px;
      }

      .cil-close,
      .cil-clear {
        border: 1px solid #785a28;
        background: #111827;
        color: #f0e6d2;
        cursor: pointer;
      }

      .cil-close {
        width: 28px;
        height: 28px;
      }

      .cil-intro {
        padding: 14px 16px 8px;
        color: #a8a293;
        font-size: 12px;
        line-height: 1.5;
      }

      .cil-list {
        display: grid;
        gap: 10px;
        padding: 8px 16px 16px;
        overflow: auto;
      }

      .cil-card {
        display: grid;
        gap: 6px;
        text-align: left;
        padding: 14px 16px;
        border: 1px solid #2f3d54;
        background: linear-gradient(180deg, #122239 0%, #0c1728 100%);
        color: #f0e6d2;
        cursor: pointer;
      }

      .cil-card:hover {
        border-color: #c8aa6e;
        background: linear-gradient(180deg, #193050 0%, #102038 100%);
      }

      .cil-card-title {
        color: #f0e6d2;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: .03em;
      }

      .cil-card-note {
        color: #9ea6b0;
        font-size: 12px;
        line-height: 1.45;
      }

      .cil-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px 16px;
        border-top: 1px solid #1f2f4a;
      }

      .cil-status {
        color: #88c49c;
        font-size: 12px;
        line-height: 1.4;
      }

      .cil-clear {
        height: 34px;
        padding: 0 12px;
        background: #121d34;
      }
    </style>

    <section class="cil-panel">
      <header class="cil-titlebar">
        <div>
          <div class="cil-title">Client Instance Lab</div>
          <div class="cil-subtitle">Atalho rapido: ${HOTKEY_LABEL}</div>
        </div>
        <button id="cil-close" class="cil-close" type="button">x</button>
      </header>

      <div class="cil-intro">
        Clique em uma instancia para mandar o client diretamente para ela. O painel lista apenas as telas registradas no plugin.
      </div>

      <div class="cil-list"></div>

      <div class="cil-footer">
        <div id="cil-status" class="cil-status"></div>
        <button id="cil-clear" class="cil-clear" type="button">Voltar ao real</button>
      </div>
    </section>
  `;
}

function setStatus(node, message, isError = false) {
  if (!node) return;
  node.textContent = message;
  node.style.color = isError ? "#d06a6a" : "#88c49c";
}

function flashLauncher(message) {
  const button = document.getElementById(LAUNCHER_ID);
  if (!button) return;

  const previousText = button.textContent;
  button.textContent = message;
  clearTimeout(button.__clientInstanceLabTimer);
  button.__clientInstanceLabTimer = setTimeout(() => {
    button.textContent = previousText || "Instancias";
  }, 1800);
}
