/**
 * @name client-instance-lab
 * @description Opens real League Client instances with local placeholder data.
 * @version 1.0.0
 */

import {
  initClientInstanceLabModal,
  disposeClientInstanceLabModal,
} from "./src/modal.js";
import {
  initLiveScreenRuntime,
  disposeLiveScreenRuntime,
  setLiveScreenContext,
} from "./src/live-screen-runtime.js";

const STATE_KEY = "__clientInstanceLab";
const CONTROL_URL = new URL("./control/command.json", import.meta.url).href;
const CONTROL_POLL_MS = 900;

let controlTimer = null;
let lastCommandNonce = null;

function logJson(label, value) {
  try {
    console.info(label, JSON.stringify(value));
  } catch (error) {
    console.info(label, value, error?.message || error);
  }
}

export function unload() {
  if (controlTimer) {
    clearInterval(controlTimer);
    controlTimer = null;
  }

  try {
    disposeClientInstanceLabModal();
  } catch (error) {
    console.warn("[client-instance-lab] Modal cleanup failed:", error);
  }

  try {
    disposeLiveScreenRuntime();
  } catch (error) {
    console.warn("[client-instance-lab] Runtime cleanup failed:", error);
  }

  if (window[STATE_KEY]?.dispose === unload) {
    delete window[STATE_KEY];
  }
}

export function init(context) {
  setLiveScreenContext(context);
  initLiveScreenRuntime(context);
}

export function load(context) {
  try {
    window[STATE_KEY]?.dispose?.();
  } catch (error) {
    console.warn("[client-instance-lab] Previous unload failed; continuing fresh load:", error);
  }

  window[STATE_KEY] = {
    dispose: unload,
  };

  if (context) {
    setLiveScreenContext(context);
  }

  initLiveScreenRuntime(context);
  initClientInstanceLabModal();
  startControlBridge();

  setTimeout(() => {
    try {
      logJson("[client-instance-lab] boot diagnostics", window.__ClientInstanceLabRuntime?.diagnostic?.());
    } catch (error) {
      console.warn("[client-instance-lab] boot diagnostics failed:", error);
    }
  }, 1800);

  console.info("[client-instance-lab] Instance lab loaded. Use Alt+Shift+I or the floating button.");
}

function startControlBridge() {
  if (controlTimer) {
    clearInterval(controlTimer);
  }

  const poll = async () => {
    const runtime = window.__ClientInstanceLabRuntime;
    if (!runtime) return;

    try {
      const response = await fetch(`${CONTROL_URL}?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!response.ok) return;

      const command = await response.json();
      if (!command?.nonce || command.nonce === lastCommandNonce) return;

      lastCommandNonce = command.nonce;
      logJson("[client-instance-lab] command received", command);

      if (command.action === "open" && command.scenario) {
        const result = await runtime.open(command.scenario);
        logJson("[client-instance-lab] command result", result);
        setTimeout(() => {
          logJson("[client-instance-lab] command diagnostic", runtime.diagnostic());
        }, 1600);
        return;
      }

      if (command.action === "clear") {
        logJson("[client-instance-lab] command result", await runtime.clear());
        return;
      }

      if (command.action === "diagnostic") {
        logJson("[client-instance-lab] command diagnostic", runtime.diagnostic());
      }
    } catch (error) {
      console.warn("[client-instance-lab] control bridge poll failed:", error?.message || error);
    }
  };

  controlTimer = setInterval(poll, CONTROL_POLL_MS);
  poll();
}
