import type { ControlsPublication } from "../src/controls-machine.js";
import {
  CONTROLS_STATE_REFRESH_MS, DEVICE_STATE_REFRESH_MS, isNonEmptyDeviceState,
  type ControlsStatePayloadV1, type DeviceInputChange, type DeviceStateChannel, type JsonObject, type JsonValue,
} from "../src/model.js";
import { createControlsInputSource } from "./controls-source.js";
import { createGamepadInputSource } from "./gamepad-source.js";
import { createKeyboardInputSource } from "./keyboard-source.js";
import { createPointerInputSource } from "./pointer-source.js";
import type { DeviceInputSource } from "./source-types.js";

interface PresentationContext {
  emitCustomEvent(
    name: string,
    data?: Readonly<Record<string, JsonValue>>,
    options?: { readonly broadcast?: boolean | "top-frame"; readonly channel?: string },
  ): void;
}

const owners = new WeakMap<Window, Map<string, HTMLElement>>();
const SELECT_HOLD_MS = 800;

const overlayStyles = Object.freeze({
  position: "fixed",
  inset: "0",
  width: "100vw",
  height: "100vh",
  maxWidth: "none",
  maxHeight: "none",
  margin: "0",
  padding: "0",
  border: "0",
  boxSizing: "border-box",
  background: "rgba(0, 0, 0, 0.78)",
  color: "white",
  zIndex: "2147483647",
});

abstract class DeviceInputElement extends HTMLElement {
  private context?: PresentationContext;
  private stopSource?: () => void;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private refresh?: { readonly channel: DeviceStateChannel; readonly payload: JsonObject };
  private claimed = false;
  protected abstract readonly device: string;
  protected abstract source(target: Window): DeviceInputSource;

  receiveRenderContext(context: PresentationContext): void {
    if (context === null || typeof context !== "object" || typeof context.emitCustomEvent !== "function") {
      throw new TypeError("Invalid WebPresentationContext");
    }
    this.context = context;
    this.startIfReady();
  }

  connectedCallback(): void { this.startIfReady(); }

  disconnectedCallback(): void {
    this.stopSource?.(); this.stopSource = undefined;
    this.stopRefresh();
    const target = this.ownerDocument.defaultView;
    if (target !== null && this.claimed) {
      const registry = owners.get(target);
      if (registry?.get(this.device) === this) registry.delete(this.device);
    }
    this.claimed = false;
  }

  private startIfReady(): void {
    if (!this.isConnected || this.context === undefined || this.stopSource !== undefined) return;
    const target = this.ownerDocument.defaultView;
    if (target === null) return;
    const registry = owners.get(target) ?? new Map<string, HTMLElement>();
    if (!owners.has(target)) owners.set(target, registry);
    const current = registry.get(this.device);
    if (current !== undefined && current !== this) {
      this.setAttribute("data-input-disabled", "duplicate");
      return;
    }
    this.removeAttribute("data-input-disabled");
    registry.set(this.device, this);
    this.claimed = true;
    this.stopSource = this.source(target).start((change) => this.emit(change));
  }

  private emit(change: DeviceInputChange): void {
    this.context?.emitCustomEvent(
      change.kind === "state" ? "input.state" : "input.event",
      change.payload,
      { broadcast: true, channel: change.channel },
    );
    if (change.kind !== "state") return;
    if (!isNonEmptyDeviceState(change.channel, change.payload)) { this.stopRefresh(); return; }
    this.refresh = { channel: change.channel, payload: change.payload };
    if (this.refreshTimer !== undefined) return;
    this.refreshTimer = setInterval(() => {
      const current = this.refresh;
      if (current !== undefined && this.isConnected) {
        this.context?.emitCustomEvent("input.state", current.payload, { broadcast: true, channel: current.channel });
      }
    }, DEVICE_STATE_REFRESH_MS);
  }

  private stopRefresh(): void {
    if (this.refreshTimer !== undefined) clearInterval(this.refreshTimer);
    this.refreshTimer = undefined; this.refresh = undefined;
  }
}

class GameKeyboardInputElement extends DeviceInputElement {
  protected readonly device = "keyboard";
  protected source(target: Window): DeviceInputSource { return createKeyboardInputSource(target); }
}
class GamePointerInputElement extends DeviceInputElement {
  protected readonly device = "pointer";
  protected source(target: Window): DeviceInputSource { return createPointerInputSource(target); }
}
class GameGamepadInputElement extends DeviceInputElement {
  protected readonly device = "gamepad";
  protected source(target: Window): DeviceInputSource { return createGamepadInputSource(target); }
}

class GameControlsInputElement extends HTMLElement {
  private context?: PresentationContext;
  private stopSource?: () => void;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private refreshPayload?: ControlsStatePayloadV1;
  private selectTimer?: ReturnType<typeof setTimeout>;
  private selectDown = false;
  private selectTriggered = false;
  private overlayDocument?: Document;
  private overlay?: HTMLDialogElement;
  private enterFullscreenButton?: HTMLButtonElement;
  private exitFullscreenButton?: HTMLButtonElement;
  private fullscreenStatus?: HTMLParagraphElement;
  private overlayOpen = false;
  private reorderingOverlay = false;
  private internalCloseEvents = 0;
  private fullscreenFailure?: string;
  private claimed = false;

  receiveRenderContext(context: PresentationContext): void {
    if (context === null || typeof context !== "object" || typeof context.emitCustomEvent !== "function") {
      throw new TypeError("Invalid WebPresentationContext");
    }
    this.context = context;
    this.startIfReady();
  }

  connectedCallback(): void { this.startIfReady(); }

  disconnectedCallback(): void {
    this.stopSource?.();
    this.stopSource = undefined;
    this.stopRefresh();
    this.resetSelectHold();
    this.destroyOverlay();
    const target = this.ownerDocument.defaultView;
    if (target !== null && this.claimed) {
      const registry = owners.get(target);
      if (registry?.get("controls") === this) registry.delete("controls");
    }
    this.claimed = false;
  }

  private startIfReady(): void {
    if (!this.isConnected || this.context === undefined || this.stopSource !== undefined) return;
    const target = this.ownerDocument.defaultView;
    if (target === null) return;
    const registry = owners.get(target) ?? new Map<string, HTMLElement>();
    if (!owners.has(target)) owners.set(target, registry);
    const current = registry.get("controls");
    if (current !== undefined && current !== this) {
      this.setAttribute("data-input-disabled", "duplicate");
      return;
    }
    this.removeAttribute("data-input-disabled");
    registry.set("controls", this);
    this.claimed = true;
    this.stopSource = createControlsInputSource(target, this).start((publication) => this.emit(publication));
  }

  private emit(publication: ControlsPublication): void {
    if (publication.state !== null) {
      const state = publication.state;
      this.updateSelectHold(state.down.includes("select"));
      this.context?.emitCustomEvent("input.state", state, { broadcast: "top-frame", channel: "controls.state" });
      if (state.down.length === 0) this.stopRefresh();
      else {
        this.refreshPayload = state;
        if (this.refreshTimer === undefined) {
          this.refreshTimer = setInterval(() => {
            const current = this.refreshPayload;
            if (current !== undefined && this.isConnected) {
              this.context?.emitCustomEvent("input.state", current, { broadcast: "top-frame", channel: "controls.state" });
            }
          }, CONTROLS_STATE_REFRESH_MS);
        }
      }
    }
    for (const event of publication.events) {
      this.context?.emitCustomEvent("input.event", event, { broadcast: "top-frame", channel: "controls.event" });
    }
  }

  private stopRefresh(): void {
    if (this.refreshTimer !== undefined) clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
    this.refreshPayload = undefined;
  }

  private updateSelectHold(pressed: boolean): void {
    if (pressed === this.selectDown) return;
    this.selectDown = pressed;
    if (!pressed) {
      this.cancelSelectTimer();
      this.selectTriggered = false;
      return;
    }
    this.selectTriggered = false;
    this.selectTimer = setTimeout(() => {
      this.selectTimer = undefined;
      if (!this.isConnected || !this.selectDown || this.selectTriggered) return;
      this.selectTriggered = true;
      this.openOverlay();
    }, SELECT_HOLD_MS);
  }

  private cancelSelectTimer(): void {
    if (this.selectTimer !== undefined) clearTimeout(this.selectTimer);
    this.selectTimer = undefined;
  }

  private resetSelectHold(): void {
    this.cancelSelectTimer();
    this.selectDown = false;
    this.selectTriggered = false;
  }

  private ensureOverlay(): HTMLDialogElement {
    if (this.overlay !== undefined) return this.overlay;
    const document = this.ownerDocument;
    const dialog = document.createElement("dialog");
    dialog.setAttribute("data-game-controls-fullscreen-overlay", "");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "全屏控制");
    dialog.tabIndex = -1;
    Object.assign(dialog.style, overlayStyles);

    const panel = document.createElement("section");
    panel.setAttribute("aria-label", "全屏操作");
    Object.assign(panel.style, {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      display: "grid",
      gap: "16px",
      minWidth: "min(320px, calc(100vw - 32px))",
      padding: "24px",
      borderRadius: "12px",
      boxSizing: "border-box",
      background: "#171717",
      boxShadow: "0 24px 80px rgba(0, 0, 0, 0.55)",
    });

    const title = document.createElement("h2");
    title.textContent = "全屏控制";
    Object.assign(title.style, { margin: "0", font: "600 20px/1.4 system-ui, sans-serif" });
    const enter = document.createElement("button");
    enter.type = "button";
    enter.textContent = "进入全屏";
    const exit = document.createElement("button");
    exit.type = "button";
    exit.textContent = "退出全屏";
    for (const button of [enter, exit]) {
      Object.assign(button.style, {
        minHeight: "48px",
        padding: "10px 18px",
        border: "2px solid currentColor",
        borderRadius: "8px",
        font: "600 16px/1.4 system-ui, sans-serif",
        cursor: "pointer",
      });
    }
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    Object.assign(status.style, { minHeight: "1.4em", margin: "0", font: "14px/1.4 system-ui, sans-serif" });
    panel.append(title, enter, exit, status);
    dialog.append(panel);
    document.body.append(dialog);

    dialog.addEventListener("cancel", this.handleOverlayCancel);
    dialog.addEventListener("click", this.handleOverlayClick);
    dialog.addEventListener("close", this.handleOverlayClose);
    enter.addEventListener("click", this.handleEnterFullscreen);
    exit.addEventListener("click", this.handleExitFullscreen);
    document.addEventListener("fullscreenchange", this.handleFullscreenChange);
    document.addEventListener("fullscreenerror", this.handleFullscreenError);
    this.overlayDocument = document;
    this.overlay = dialog;
    this.enterFullscreenButton = enter;
    this.exitFullscreenButton = exit;
    this.fullscreenStatus = status;
    return dialog;
  }

  private openOverlay(): void {
    const dialog = this.ensureOverlay();
    this.fullscreenFailure = undefined;
    this.syncFullscreenState();
    if (this.overlayOpen && dialog.open) {
      this.focusFullscreenAction();
      return;
    }
    try {
      dialog.showModal();
      this.overlayOpen = true;
      this.focusFullscreenAction();
    } catch (error) {
      this.overlayOpen = false;
      this.showFullscreenFailure("无法显示全屏控制面板", error);
    }
  }

  private closeOverlay(): void {
    const dialog = this.overlay;
    this.overlayOpen = false;
    if (dialog?.open === true) dialog.close();
  }

  private destroyOverlay(): void {
    const dialog = this.overlay;
    const document = this.overlayDocument;
    if (dialog === undefined || document === undefined) return;
    dialog.removeEventListener("cancel", this.handleOverlayCancel);
    dialog.removeEventListener("click", this.handleOverlayClick);
    dialog.removeEventListener("close", this.handleOverlayClose);
    this.enterFullscreenButton?.removeEventListener("click", this.handleEnterFullscreen);
    this.exitFullscreenButton?.removeEventListener("click", this.handleExitFullscreen);
    document.removeEventListener("fullscreenchange", this.handleFullscreenChange);
    document.removeEventListener("fullscreenerror", this.handleFullscreenError);
    this.overlayOpen = false;
    if (dialog.open) dialog.close();
    dialog.remove();
    this.overlayDocument = undefined;
    this.overlay = undefined;
    this.enterFullscreenButton = undefined;
    this.exitFullscreenButton = undefined;
    this.fullscreenStatus = undefined;
    this.fullscreenFailure = undefined;
    this.reorderingOverlay = false;
    this.internalCloseEvents = 0;
  }

  private readonly handleOverlayCancel = (event: Event): void => {
    event.preventDefault();
    this.closeOverlay();
  };

  private readonly handleOverlayClick = (event: MouseEvent): void => {
    if (event.target === this.overlay) this.closeOverlay();
  };

  private readonly handleOverlayClose = (): void => {
    if (this.internalCloseEvents > 0) {
      this.internalCloseEvents -= 1;
      return;
    }
    this.overlayOpen = false;
  };

  private readonly handleEnterFullscreen = (): void => {
    const document = this.overlayDocument;
    const root = document?.documentElement;
    const request = root?.requestFullscreen;
    if (document === undefined || root === undefined || typeof request !== "function" || document.fullscreenEnabled === false) {
      this.showFullscreenFailure("此浏览器不支持进入全屏。", undefined);
      return;
    }
    this.fullscreenFailure = undefined;
    this.syncFullscreenState();
    try {
      void request.call(root).catch((error: unknown) => {
        this.showFullscreenFailure("进入全屏失败", error);
      });
    } catch (error) {
      this.showFullscreenFailure("进入全屏失败", error);
    }
  };

  private readonly handleExitFullscreen = (): void => {
    const document = this.overlayDocument;
    const exit = document?.exitFullscreen;
    if (document === undefined || typeof exit !== "function") {
      this.showFullscreenFailure("此浏览器不支持退出全屏。", undefined);
      return;
    }
    this.fullscreenFailure = undefined;
    this.syncFullscreenState();
    try {
      void exit.call(document).catch((error: unknown) => {
        this.showFullscreenFailure("退出全屏失败", error);
      });
    } catch (error) {
      this.showFullscreenFailure("退出全屏失败", error);
    }
  };

  private readonly handleFullscreenChange = (): void => {
    this.fullscreenFailure = undefined;
    this.syncFullscreenState();
    this.reorderOverlay();
  };

  private readonly handleFullscreenError = (): void => {
    this.showFullscreenFailure("浏览器未能完成全屏操作。", undefined);
  };

  private fullscreenSupported(): boolean {
    const document = this.overlayDocument;
    return document !== undefined
      && document.fullscreenEnabled !== false
      && typeof document.documentElement.requestFullscreen === "function";
  }

  private syncFullscreenState(): void {
    const document = this.overlayDocument;
    const enter = this.enterFullscreenButton;
    const exit = this.exitFullscreenButton;
    const status = this.fullscreenStatus;
    if (document === undefined || enter === undefined || exit === undefined || status === undefined) return;
    const fullscreen = document.fullscreenElement !== null;
    const supported = this.fullscreenSupported();
    enter.disabled = fullscreen || !supported;
    exit.disabled = !fullscreen || typeof document.exitFullscreen !== "function";
    if (!supported && !fullscreen) status.textContent = "此浏览器不支持全屏功能。";
    else if (this.fullscreenFailure !== undefined) status.textContent = this.fullscreenFailure;
    else status.textContent = fullscreen ? "当前处于全屏状态。" : "当前未处于全屏状态。";
  }

  private showFullscreenFailure(prefix: string, error: unknown): void {
    const detail = error instanceof Error && error.message.length > 0 ? `：${error.message}` : "";
    this.fullscreenFailure = `${prefix}${detail}`;
    this.syncFullscreenState();
  }

  private focusFullscreenAction(): void {
    const document = this.overlayDocument;
    const dialog = this.overlay;
    if (document === undefined || dialog === undefined) return;
    const preferred = document.fullscreenElement === null ? this.enterFullscreenButton : this.exitFullscreenButton;
    const fallback = preferred?.disabled === false ? preferred : dialog;
    fallback.focus({ preventScroll: true });
  }

  private reorderOverlay(): void {
    const dialog = this.overlay;
    if (!this.overlayOpen || dialog?.open !== true || this.reorderingOverlay) return;
    this.reorderingOverlay = true;
    this.internalCloseEvents += 1;
    try {
      dialog.close();
      dialog.showModal();
      this.focusFullscreenAction();
    } catch (error) {
      this.overlayOpen = false;
      this.showFullscreenFailure("无法恢复全屏控制面板层级", error);
    } finally {
      this.reorderingOverlay = false;
    }
  }
}

customElements.define("game-keyboard-input", GameKeyboardInputElement);
customElements.define("game-pointer-input", GamePointerInputElement);
customElements.define("game-gamepad-input", GameGamepadInputElement);
customElements.define("game-controls-input", GameControlsInputElement);
