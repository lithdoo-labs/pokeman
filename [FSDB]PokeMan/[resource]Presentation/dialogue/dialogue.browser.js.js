(function () {
  "use strict";

  const TAGS = Object.freeze([
    "lr-dialogue-view",
    "lr-dialogue-characters",
    "lr-dialogue-character",
    "lr-dialogue-conversation",
    "lr-dialogue-text",
    "lr-dialogue-choices",
    "lr-dialogue-choice",
    "lr-dialogue-controls",
    "lr-dialogue-control-hint",
    "lr-dialogue-history",
    "lr-dialogue-history-entry",
  ]);
  const ACTIONS = Object.freeze(["confirm", "previous", "next", "history", "cancel"]);
  const ACTION_LABELS = Object.freeze({
    confirm: "继续",
    previous: "上一个",
    next: "下一个",
    history: "历史",
    cancel: "返回",
  });
  const CONTENT_VERSION = /^sha256:[0-9a-f]{64}$/;

  for (const tag of TAGS) {
    if (customElements.get(tag) !== undefined) {
      throw new TypeError(`PokeMan Dialogue browser element collision: ${tag}`);
    }
  }

  function attach(host, html) {
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = html;
    return root;
  }

  function reducedMotion() {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function directChildren(host, tag) {
    return Array.from(host.children).filter((child) => child.localName === tag);
  }

  function exactKeys(value, keys) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
  }

  function validResourceKey(value) {
    return typeof value === "string" && value.length > 0 && !value.startsWith("/") && !value.endsWith("/") &&
      !/[\\\0]|\p{Cc}|\p{Cs}/u.test(value) && !/^[A-Za-z]:/.test(value) &&
      !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) &&
      !value.split("/").some((part) => part.length === 0 || part === "." || part === "..");
  }

  function parseSpriteData(data) {
    if (!exactKeys(data, ["sprite"]) || !exactKeys(data.sprite, ["namespace", "key", "contentVersion"])) return null;
    const { namespace, key, contentVersion } = data.sprite;
    if (namespace !== "resource.Graphics" || !validResourceKey(key) || !CONTENT_VERSION.test(contentVersion)) return null;
    return Object.freeze({ namespace, key, contentVersion });
  }

  class DialogueViewElement extends HTMLElement {
    constructor() {
      super();
      // Presentation-local private facts (doc 74 §4.2). They are not public ABI,
      // never reflected as canonical attributes, and never reported to Runtime.
      this._mode = "conversation";
      this._controlsComplete = false;
      this._interactionActive = false;
      this._shellPresented = false;
      this._hasActiveCharacter = false;
      attach(this, `<style>
        :host { position: fixed; inset: 0; display: block; pointer-events: none; color: var(--pokeman-dialogue-text, #172033); font: var(--pokeman-dialogue-font, 400 18px/1.68 system-ui, sans-serif); }
        .backdrop { position: absolute; inset: 0; background: var(--pokeman-dialogue-backdrop, rgb(4 9 20 / .52)); backdrop-filter: blur(2px); }
        .modal { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(88vw, 960px); height: min(68vh, 520px); box-sizing: border-box; padding: 16px; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; grid-template-areas: "conversation" "controls"; gap: 0; overflow: hidden; border: 1px solid var(--pokeman-dialogue-border, rgb(85 105 145 / .2)); border-radius: var(--pokeman-dialogue-radius, 18px); background: var(--pokeman-dialogue-surface, rgb(249 251 255 / .97)); box-shadow: var(--pokeman-dialogue-shadow, 0 24px 70px rgb(0 0 0 / .34)); }
        .modal.with-character { grid-template-columns: 30% minmax(0, 70%); grid-template-rows: minmax(0, 1fr) auto; grid-template-areas: "characters conversation" "characters controls"; }
        .modal.history-mode { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; grid-template-areas: "history" "controls"; }
        .surface { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(140deg, rgb(255 255 255 / .55), transparent 42%); }
        slot.canonical-root { display: contents; }
        ::slotted(lr-dialogue-characters) { grid-area: characters; min-width: 0; min-height: 0; z-index: 1; }
        ::slotted(lr-dialogue-conversation) { grid-area: conversation; min-width: 0; min-height: 0; z-index: 1; }
        ::slotted(lr-dialogue-controls) { grid-area: controls; min-width: 0; z-index: 1; }
        ::slotted(lr-dialogue-history) { grid-area: history; min-width: 0; min-height: 0; z-index: 1; }
        .modal:not(.with-character):not(.history-mode) ::slotted(lr-dialogue-characters),
        .modal.history-mode ::slotted(lr-dialogue-characters),
        .modal.history-mode ::slotted(lr-dialogue-conversation),
        .modal:not(.history-mode) ::slotted(lr-dialogue-history) { display: none; }
        .backdrop[hidden], .modal[hidden] { display: none; }
        @media (max-width: 640px) {
          .modal { width: min(94vw, 960px); height: min(82vh, 520px); padding: 16px 14px; border-radius: 14px; }
        }
        @media (max-width: 479px) {
          .modal.with-character { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(88px, 30%) minmax(0, 1fr) auto; grid-template-areas: "characters" "conversation" "controls"; }
        }
        @media (prefers-reduced-motion: reduce) { .modal { scroll-behavior: auto; } }
      </style><div class="backdrop" hidden aria-hidden="true"></div><section class="modal" role="dialog" aria-modal="true" aria-label="对话" hidden><div class="surface" aria-hidden="true"></div><slot class="canonical-root"></slot></section>`);
    }

    connectedCallback() {
      this._syncAll();
    }

    disconnectedCallback() {
      // Presentation-local defensive lifecycle reset (doc 74 §4.6): a removed
      // shell no longer carries interaction authority, and a later (possibly
      // manual) reconnect must start from the initial hidden baseline. This is
      // not a Runtime lifecycle authority; the real session boundary is the
      // RenderDomain close that removes this view.
      this._interactionActive = false;
      this._shellPresented = false;
      this._syncPresentation();
    }

    syncHistoryFrom(history) {
      if (history?.closest("lr-dialogue-view") !== this) return;
      this._mode = history.getAttribute("visible") === "true" ? "history" : "conversation";
      this._syncPresentation();
    }

    syncControlsFrom(facts) {
      const complete = facts instanceof Map && facts.size === ACTIONS.length && ACTIONS.every((action) => facts.has(action));
      this._controlsComplete = complete;
      this._interactionActive = complete && ACTIONS.some((action) => facts.get(action) === true);
      if (this._interactionActive) this._shellPresented = true;
      this._syncPresentation();
    }

    syncCharactersFrom(characters) {
      if (characters?.closest("lr-dialogue-view") !== this) return;
      this._hasActiveCharacter = characters.hasPresentedCharacter();
      this._syncPresentation();
    }

    _syncAll() {
      const history = directChildren(this, "lr-dialogue-history")[0];
      if (history) this._mode = history.getAttribute("visible") === "true" ? "history" : "conversation";
      const characters = directChildren(this, "lr-dialogue-characters")[0];
      if (characters && typeof characters.syncActiveToView === "function") characters.syncActiveToView();
      const controls = directChildren(this, "lr-dialogue-controls")[0];
      if (controls && typeof controls.syncFactsToView === "function") controls.syncFactsToView();
      else this._syncPresentation();
    }

    _syncPresentation() {
      const modal = this.shadowRoot.querySelector(".modal");
      const backdrop = this.shadowRoot.querySelector(".backdrop");
      modal.classList.toggle("history-mode", this._mode === "history");
      modal.classList.toggle("with-character", this._mode === "conversation" && this._hasActiveCharacter);
      modal.setAttribute("aria-label", this._mode === "history" ? "历史记录" : "对话");
      // Shell visibility follows only the shellPresented latch; inertness and
      // the Conversation interaction gate follow interactionActive and mode.
      modal.hidden = !this._shellPresented;
      backdrop.hidden = !this._shellPresented;
      modal.inert = !this._interactionActive;
      this.inert = !this._interactionActive;
      const conversation = directChildren(this, "lr-dialogue-conversation")[0];
      if (conversation && typeof conversation.setInteractionActive === "function") {
        conversation.setInteractionActive(this._interactionActive && this._mode === "conversation");
      }
    }
  }

  class DialogueCharactersElement extends HTMLElement {
    constructor() {
      super();
      this._presentedCharacter = null;
      attach(this, `<style>
        :host { display: block; min-width: 0; min-height: 0; padding: 4px 12px 4px 0; box-sizing: border-box; }
        .character-stage { position: relative; width: 100%; height: 100%; min-height: 140px; overflow: hidden; border-radius: calc(var(--pokeman-dialogue-radius, 18px) - 4px); background: var(--pokeman-dialogue-stage, linear-gradient(160deg, #edf2fa, #e3eaf6)); }
        ::slotted(lr-dialogue-character) { position: absolute; inset: 0; }
        @media (max-width: 640px) { :host { padding: 4px 10px 4px 0; } .character-stage { min-height: 92px; } }
        @media (max-width: 479px) { :host { padding: 0 0 8px; } }
      </style><div class="character-stage" aria-label="当前人物"><slot></slot></div>`);
      this._observer = new MutationObserver(() => this.syncActiveToView());
    }

    connectedCallback() {
      this._observer.observe(this, { childList: true });
      this.syncActiveToView();
    }

    disconnectedCallback() {
      this._observer.disconnect();
    }

    hasPresentedCharacter() {
      return this._presentedCharacter !== null;
    }

    syncActiveToView() {
      const characters = directChildren(this, "lr-dialogue-character");
      const first = characters.find((character) => character.getAttribute("active") === "true") ?? null;
      this._presentedCharacter = first;
      for (const character of characters) character.setPresentationActive(character === first);
      this.closest("lr-dialogue-view")?.syncCharactersFrom?.(this);
    }
  }

  class DialogueCharacterElement extends HTMLElement {
    static get observedAttributes() { return ["character-id", "display-name", "active"]; }

    constructor() {
      super();
      this._context = null;
      this._data = undefined;
      this._presented = false;
      // Idempotent sprite-load coordinator state (doc 74 §6). The exact attempt
      // key is: connection epoch + renderContext identity + namespace + key +
      // contentVersion. Repeated triggers for the same attempt key must be a
      // resource-layer no-op, including for a previously failed attempt.
      this._connectionEpoch = 0;
      this._attemptRef = null;
      this._attemptContext = null;
      this._attemptEpoch = -1;
      this._loadController = null;
      this._loadToken = 0;
      this._spriteStatus = "empty";
      attach(this, `<style>
        :host { display: block; width: 100%; height: 100%; }
        .character { width: 100%; height: 100%; display: grid; place-items: center; }
        .character[hidden] { display: none; }
        canvas { display: block; width: auto; height: 70%; max-width: 100%; max-height: 100%; object-fit: contain; image-rendering: pixelated; }
        canvas[hidden], .fallback[hidden] { display: none; }
        .fallback { width: clamp(72px, 42%, 132px); aspect-ratio: 1; display: grid; place-items: center; border-radius: 50%; color: #45536d; background: rgb(255 255 255 / .7); box-shadow: inset 0 0 0 1px rgb(66 84 118 / .13); font-size: clamp(28px, 6vw, 52px); font-weight: 700; }
      </style><div class="character" hidden><canvas class="sprite" aria-hidden="true" hidden></canvas><div class="fallback" aria-hidden="true">?</div></div>`);
    }

    connectedCallback() {
      this._connectionEpoch += 1;
      this._renderFallback();
      this.parentElement?.syncActiveToView?.();
      this._ensureSpriteLoad();
    }

    disconnectedCallback() {
      this._cancelLoad();
      if (this._spriteStatus === "loading") this._showFallback();
    }

    attributeChangedCallback(name) {
      if (name === "active") this.parentElement?.syncActiveToView?.();
      else this._renderFallback();
    }

    receiveRenderContext(context) {
      if (context === null || typeof context !== "object" || context.resources === null || typeof context.resources !== "object" || typeof context.resources.resource !== "function") {
        throw new TypeError("Invalid WebPresentationContext");
      }
      this._context = context;
      this._ensureSpriteLoad();
    }

    receiveRenderData(data) {
      this._data = data;
      this._ensureSpriteLoad();
    }

    setPresentationActive(active) {
      this._presented = active;
      this.shadowRoot.querySelector(".character").hidden = !active;
      if (active && this.isConnected) this._ensureSpriteLoad();
    }

    _renderFallback() {
      const source = this.getAttribute("display-name") || this.getAttribute("character-id") || "?";
      this.shadowRoot.querySelector(".fallback").textContent = Array.from(source)[0] ?? "?";
    }

    _showFallback() {
      this._spriteStatus = "fallback";
      this.shadowRoot.querySelector("canvas").hidden = true;
      this.shadowRoot.querySelector(".fallback").hidden = false;
    }

    _cancelLoad() {
      this._loadToken += 1;
      this._loadController?.abort();
      this._loadController = null;
    }

    _sameAttempt(ref) {
      return this._attemptRef !== null
        && this._attemptEpoch === this._connectionEpoch
        && this._attemptContext === this._context
        && this._attemptRef.namespace === ref.namespace
        && this._attemptRef.key === ref.key
        && this._attemptRef.contentVersion === ref.contentVersion;
    }

    _ensureSpriteLoad() {
      if (!this.isConnected) return;
      const ref = parseSpriteData(this._data);
      if (this._context === null || ref === null) {
        // No loadable attempt: data/context became unusable. Any in-flight or
        // previously successful attempt for other data is terminated, and an
        // existing active character shows its fallback (doc 69 §8.1.4).
        if (this._data !== undefined && (this._spriteStatus === "loading" || this._spriteStatus === "ready")) {
          this._cancelLoad();
          this._attemptRef = null;
          this._showFallback();
        }
        return;
      }
      if (this._sameAttempt(ref)) {
        // Same exact attempt key: loading must not be restarted or aborted, a
        // ready canvas must not be cleared, and a failed attempt must not be
        // retried by ordinary reconciliation (doc 74 §6.2/§6.4).
        return;
      }
      this._startLoad(ref);
    }

    async _startLoad(ref) {
      this._cancelLoad();
      this._showFallback();
      this._attemptRef = ref;
      this._attemptContext = this._context;
      this._attemptEpoch = this._connectionEpoch;
      const token = this._loadToken;
      const controller = new AbortController();
      this._loadController = controller;
      this._spriteStatus = "loading";
      let bitmap = null;
      try {
        const resource = await this._context.resources.resource(ref.namespace, ref.key, ref.contentVersion, { signal: controller.signal });
        if (token !== this._loadToken || controller.signal.aborted || !this.isConnected) return;
        if (resource === null || typeof resource !== "object" || resource.mime !== "image/png" || resource.contentVersion !== ref.contentVersion || !(resource.bytes instanceof Uint8Array)) {
          throw new TypeError("Invalid Dialogue sprite resource");
        }
        bitmap = await createImageBitmap(new Blob([resource.bytes], { type: "image/png" }));
        if (token !== this._loadToken || controller.signal.aborted || !this.isConnected) return;
        if (!Number.isInteger(bitmap.width) || !Number.isInteger(bitmap.height) || bitmap.width <= 0 || bitmap.height <= 0 || bitmap.width % 4 !== 0 || bitmap.height % 4 !== 0) {
          throw new TypeError("Dialogue sprite sheet must be a 4x4 grid");
        }
        const width = bitmap.width / 4;
        const height = bitmap.height / 4;
        const canvas = this.shadowRoot.querySelector("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (context === null) throw new TypeError("Dialogue sprite canvas is unavailable");
        context.imageSmoothingEnabled = false;
        context.clearRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height, 0, 0, width, height);
        canvas.hidden = false;
        this.shadowRoot.querySelector(".fallback").hidden = true;
        this._spriteStatus = "ready";
      } catch {
        if (token === this._loadToken && !controller.signal.aborted) this._showFallback();
      } finally {
        bitmap?.close?.();
        if (this._loadController === controller) this._loadController = null;
      }
    }
  }

  class DialogueTextElement extends HTMLElement {
    static get observedAttributes() { return ["text"]; }

    constructor() {
      super();
      this._visibleText = "";
      attach(this, `<style>:host{display:block;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.68;min-height:1.68em}.text{white-space:inherit}</style><span class="text"></span>`);
    }

    connectedCallback() {
      this.parentElement?.syncDescendantFacts?.();
      this._render();
    }

    attributeChangedCallback() {
      this.parentElement?.syncDescendantFacts?.();
    }

    fullText() { return this.getAttribute("text") ?? ""; }

    setRevealedText(value) {
      this._visibleText = value;
      this._render();
    }

    _render() { this.shadowRoot.querySelector(".text").textContent = this._visibleText; }
  }

  class DialogueChoicesElement extends HTMLElement {
    constructor() {
      super();
      attach(this, `<style>:host{display:block}.choice-list{display:grid;gap:8px;margin-top:12px}</style><div class="choice-list" role="listbox" aria-label="选择"><slot></slot></div>`);
    }

    connectedCallback() { this.parentElement?.syncDescendantFacts?.(); }
  }

  class DialogueChoiceElement extends HTMLElement {
    static get observedAttributes() { return ["choice-id", "text", "enabled"]; }

    constructor() {
      super();
      this._data = undefined;
      this._selected = false;
      attach(this, `<style>
        :host { display: block; }
        .choice { min-height: 44px; box-sizing: border-box; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 8px 12px; border: 1px solid rgb(80 99 136 / .18); border-radius: 10px; background: rgb(237 242 251 / .72); overflow-wrap: anywhere; transition: border-color 140ms ease, background 140ms ease, transform 140ms ease; }
        .choice.selected { border-color: var(--pokeman-dialogue-accent, #456fd3); background: var(--pokeman-dialogue-selection, #e2ebff); box-shadow: inset 3px 0 0 var(--pokeman-dialogue-accent, #456fd3); }
        .choice.disabled { opacity: .45; }
        .marker { min-width: 1.2em; color: var(--pokeman-dialogue-accent, #456fd3); font-weight: 800; text-align: center; }
        @media (prefers-reduced-motion: reduce) { .choice { transition: none; } }
      </style><div class="choice" role="option"><span class="label"></span><span class="marker" aria-hidden="true"></span></div>`);
    }

    connectedCallback() { this._render(); this._conversation()?.syncDescendantFacts?.(); }
    attributeChangedCallback() { this._render(); this._conversation()?.syncDescendantFacts?.(); }
    receiveRenderData(data) { this._data = data; }
    choiceId() { return this.getAttribute("choice-id"); }
    isEnabled() { return this.getAttribute("enabled") !== "false"; }
    isSelected() { return this._selected; }
    setSelected(selected) { this._selected = selected; this._render(); }
    _conversation() { return this.closest("lr-dialogue-conversation"); }

    _render() {
      const target = this.shadowRoot.querySelector(".choice");
      target.querySelector(".label").textContent = this.getAttribute("text") ?? "";
      target.querySelector(".marker").textContent = this._selected ? "✓" : "";
      target.classList.toggle("selected", this._selected);
      target.classList.toggle("disabled", !this.isEnabled());
      target.setAttribute("aria-selected", this._selected ? "true" : "false");
      target.setAttribute("aria-disabled", this.isEnabled() ? "false" : "true");
    }
  }

  class DialogueConversationElement extends HTMLElement {
    static get observedAttributes() { return ["conversation-id", "speaker-name"]; }

    constructor() {
      super();
      this._context = null;
      this._data = undefined;
      this._events = [];
      this._selectedChoiceId = null;
      this._revealComplete = false;
      this._revealIndex = 0;
      this._revealText = "";
      this._revealTimer = undefined;
      this._observedConversationId = null;
      this._interactionActive = false;
      this._phase = "REVEALING";
      attach(this, `<style>
        :host { display: block; min-width: 0; min-height: 0; }
        .conversation { height: 100%; min-height: 0; box-sizing: border-box; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; padding: 2px 0 0 8px; }
        .speaker { color: var(--pokeman-dialogue-accent, #456fd3); font-size: .96em; font-weight: 700; letter-spacing: .01em; padding-bottom: 8px; border-bottom: 1px solid rgb(68 88 124 / .16); overflow-wrap: anywhere; }
        .speaker:empty { display: none; }
        .body { min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 10px 4px 6px 0; scrollbar-gutter: stable; }
        .status { min-height: 26px; display: flex; justify-content: flex-end; align-items: center; }
        .continue { color: var(--pokeman-dialogue-accent, #456fd3); font-size: 24px; line-height: 1; animation: continue 720ms ease-in-out infinite alternate; }
        .continue[hidden] { display: none; }
        @keyframes continue { from { opacity: .42; transform: translateY(-2px); } to { opacity: 1; transform: translateY(2px); } }
        @media (max-width: 640px) { .conversation { padding-left: 0; } }
        @media (prefers-reduced-motion: reduce) { .continue { animation: none; } }
      </style><section class="conversation"><header class="speaker"></header><div class="body"><slot></slot></div><footer class="status"><span class="continue" aria-label="可以继续" hidden>⌄</span></footer></section>`);
      this._observer = new MutationObserver(() => this.syncDescendantFacts());
    }

    connectedCallback() {
      this._observer.observe(this, { childList: true, subtree: true });
      this._renderSpeaker();
      this._syncConversationIdentity();
      this.syncDescendantFacts();
    }

    disconnectedCallback() {
      this._observer.disconnect();
      this._stopRevealTimer();
    }

    attributeChangedCallback(name) {
      if (name === "conversation-id") this._syncConversationIdentity();
      if (name === "speaker-name") this._renderSpeaker();
    }

    receiveRenderContext(context) {
      if (context === null || typeof context !== "object" || typeof context.emitCustomEvent !== "function") throw new TypeError("Invalid WebPresentationContext");
      this._context = context;
    }

    receiveRenderData(data) { this._data = data; }

    receiveRenderEvent(event) {
      if (event === null || typeof event !== "object" || typeof event.name !== "string") return;
      this._events.push(event.name);
      if (!this._interactionActive) return;
      if (event.name === "choice-next") this._moveSelection(1);
      else if (event.name === "choice-previous") this._moveSelection(-1);
      else if (event.name === "commit") this._commit();
      else if (event.name === "scroll-up") this._scroll(-1);
      else if (event.name === "scroll-down") this._scroll(1);
    }

    setInteractionActive(active) {
      if (this._interactionActive === active) return;
      this._interactionActive = active;
      if (!active) this._stopRevealTimer();
      else {
        this.syncDescendantFacts();
        this._startRevealTimer();
      }
    }

    syncDescendantFacts() {
      const text = this._textElement();
      if (text) {
        const full = text.fullText();
        if (full !== this._revealText) {
          this._revealText = full;
          this._revealIndex = 0;
          this._revealComplete = full.length === 0;
          text.setRevealedText(this._revealComplete ? full : "");
        } else if (full.length === 0) {
          this._revealComplete = true;
          text.setRevealedText("");
        } else if (this._revealComplete) text.setRevealedText(full);
        else text.setRevealedText(Array.from(full).slice(0, this._revealIndex).join(""));
      }
      const selectedValid = this._choiceElements().some((choice) => choice.choiceId() === this._selectedChoiceId && choice.isEnabled());
      if (!selectedValid) this._selectedChoiceId = null;
      this._syncSelection();
      this._updatePhase();
      this._startRevealTimer();
    }

    _syncConversationIdentity() {
      const next = this.getAttribute("conversation-id");
      if (next === null || next === this._observedConversationId) return;
      this._observedConversationId = next;
      this._selectedChoiceId = null;
      this._revealComplete = false;
      this._revealIndex = 0;
      this._revealText = "";
      this._stopRevealTimer();
      const body = this.shadowRoot.querySelector(".body");
      body.scrollTop = 0;
      this._syncSelection();
      this._updatePhase();
      queueMicrotask(() => this.syncDescendantFacts());
    }

    _renderSpeaker() { this.shadowRoot.querySelector(".speaker").textContent = this.getAttribute("speaker-name") ?? ""; }
    _textElement() { return directChildren(this, "lr-dialogue-text")[0] ?? null; }

    _choiceElements() {
      const choices = directChildren(this, "lr-dialogue-choices")[0];
      return choices ? directChildren(choices, "lr-dialogue-choice") : [];
    }

    _startRevealTimer() {
      if (!this._interactionActive || this._revealComplete || this._revealText.length === 0 || this._revealTimer !== undefined) return;
      if (reducedMotion()) { this._revealAll(); return; }
      const units = Array.from(this._revealText);
      this._revealTimer = window.setInterval(() => {
        this._revealIndex += 1;
        this._textElement()?.setRevealedText(units.slice(0, this._revealIndex).join(""));
        if (this._revealIndex >= units.length) {
          this._revealComplete = true;
          this._stopRevealTimer();
          this._updatePhase();
        }
      }, 24);
    }

    _stopRevealTimer() {
      if (this._revealTimer !== undefined) window.clearInterval(this._revealTimer);
      this._revealTimer = undefined;
    }

    _revealAll() {
      this._revealComplete = true;
      this._revealIndex = Array.from(this._revealText).length;
      this._stopRevealTimer();
      this._textElement()?.setRevealedText(this._revealText);
      this._updatePhase();
    }

    _updatePhase() {
      const choices = this._choiceElements();
      this._phase = !this._revealComplete ? "REVEALING" : choices.length > 0 ? "CHOICES" : "CONVERSATION";
      this.shadowRoot.querySelector(".conversation").dataset.phase = this._phase.toLowerCase();
      this.shadowRoot.querySelector(".continue").hidden = !(this._phase === "CONVERSATION");
    }

    _moveSelection(direction) {
      const enabled = this._choiceElements().filter((choice) => choice.isEnabled() && choice.choiceId() !== null);
      if (enabled.length === 0) return;
      const index = enabled.findIndex((choice) => choice.choiceId() === this._selectedChoiceId);
      const next = index < 0 ? (direction > 0 ? enabled[0] : enabled[enabled.length - 1]) : enabled[(index + direction + enabled.length) % enabled.length];
      this._selectedChoiceId = next.choiceId();
      this._syncSelection();
    }

    _syncSelection() {
      for (const choice of this._choiceElements()) choice.setSelected(choice.choiceId() === this._selectedChoiceId);
    }

    _commit() {
      this.syncDescendantFacts();
      if (!this._revealComplete) { this._revealAll(); return; }
      const conversationId = this.getAttribute("conversation-id");
      if (conversationId === null) return;
      const choices = this._choiceElements();
      if (choices.length === 0) {
        this._context?.emitCustomEvent("submit", { conversationId });
        return;
      }
      const selected = choices.find((choice) => choice.choiceId() === this._selectedChoiceId && choice.isEnabled());
      const choiceId = selected?.choiceId();
      if (choiceId !== null && choiceId !== undefined) this._context?.emitCustomEvent("submit", { conversationId, choiceId });
    }

    _scroll(direction) {
      const body = this.shadowRoot.querySelector(".body");
      body.scrollBy({ top: direction * Math.max(48, body.clientHeight * .7), behavior: reducedMotion() ? "auto" : "smooth" });
    }
  }

  class DialogueControlsElement extends HTMLElement {
    constructor() {
      super();
      attach(this, `<style>
        :host { display: block; padding: 8px 0 0; }
        .control-hints { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px 14px; padding-top: 8px; border-top: 1px solid rgb(68 88 124 / .13); }
      </style><footer class="control-hints" aria-label="对话操作"><slot></slot></footer>`);
    }

    connectedCallback() { this.syncFactsToView(); }

    syncFactsToView() {
      const hints = directChildren(this, "lr-dialogue-control-hint");
      const facts = new Map();
      let duplicate = false;
      for (const hint of hints) {
        const action = hint.getAttribute("action");
        if (!ACTIONS.includes(action)) continue;
        if (facts.has(action)) duplicate = true;
        facts.set(action, hint.getAttribute("enabled") === "true");
      }
      if (duplicate || hints.length !== ACTIONS.length) facts.clear();
      this.closest("lr-dialogue-view")?.syncControlsFrom?.(facts);
    }
  }

  class DialogueControlHintElement extends HTMLElement {
    static get observedAttributes() { return ["action", "label", "enabled"]; }

    constructor() {
      super();
      attach(this, `<style>
        :host { display: inline-block; }
        .hint { display: inline-flex; align-items: center; gap: 6px; color: #52617a; font-size: 13px; font-weight: 650; letter-spacing: .02em; }
        .hint::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
        .hint.disabled { opacity: .18; }
      </style><span class="hint"></span>`);
    }

    connectedCallback() { this._render(); this.parentElement?.syncFactsToView?.(); }

    attributeChangedCallback(name) {
      this._render();
      if (name === "action" || name === "enabled") this.parentElement?.syncFactsToView?.();
    }

    _render() {
      const action = this.getAttribute("action") ?? "";
      const target = this.shadowRoot.querySelector(".hint");
      target.textContent = ACTION_LABELS[action] ?? action;
      target.classList.toggle("disabled", this.getAttribute("enabled") !== "true");
      target.setAttribute("aria-disabled", this.getAttribute("enabled") === "true" ? "false" : "true");
    }
  }

  class DialogueHistoryElement extends HTMLElement {
    static get observedAttributes() { return ["visible"]; }

    constructor() {
      super();
      this._events = [];
      this._lastEventMode = null;
      attach(this, `<style>
        :host { display: block; min-width: 0; min-height: 0; }
        .history { height: 100%; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); }
        .history-header { padding-bottom: 8px; border-bottom: 1px solid rgb(68 88 124 / .16); }
        h2 { margin: 0; color: var(--pokeman-dialogue-accent, #456fd3); font-size: 16px; line-height: 1.4; letter-spacing: .1em; }
        .history-scroll { min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 8px 8px 4px 0; scrollbar-gutter: stable; }
        .empty { min-height: 100%; display: grid; place-items: center; color: #68758b; font-size: 16px; }
        .empty[hidden] { display: none; }
      </style><section class="history" aria-labelledby="pokeman-dialogue-history-heading"><header class="history-header"><h2 id="pokeman-dialogue-history-heading">HISTORY</h2></header><div class="history-scroll"><slot></slot><p class="empty">暂无历史记录</p></div></section>`);
      this._observer = new MutationObserver(() => this._syncEmpty());
    }

    connectedCallback() {
      this._observer.observe(this, { childList: true });
      this._syncEmpty();
      this._syncView();
    }

    disconnectedCallback() { this._observer.disconnect(); }
    attributeChangedCallback(name) { if (name === "visible") this._syncView(); }

    receiveRenderEvent(event) {
      if (event === null || typeof event !== "object" || typeof event.name !== "string") return;
      this._events.push(event.name);
      const view = this.closest("lr-dialogue-view");
      this._lastEventMode = view?._mode ?? null;
      const entries = directChildren(this, "lr-dialogue-history-entry");
      if (entries.length === 0) return;
      const scroll = this.shadowRoot.querySelector(".history-scroll");
      if (event.name === "scroll-to-latest") scroll.scrollTop = scroll.scrollHeight;
      else if (event.name === "scroll-up") scroll.scrollBy({ top: -Math.max(48, scroll.clientHeight * .75), behavior: reducedMotion() ? "auto" : "smooth" });
      else if (event.name === "scroll-down") scroll.scrollBy({ top: Math.max(48, scroll.clientHeight * .75), behavior: reducedMotion() ? "auto" : "smooth" });
    }

    _syncView() { this.closest("lr-dialogue-view")?.syncHistoryFrom?.(this); }
    _syncEmpty() { this.shadowRoot.querySelector(".empty").hidden = directChildren(this, "lr-dialogue-history-entry").length > 0; }
  }

  class DialogueHistoryEntryElement extends HTMLElement {
    static get observedAttributes() { return ["entry-id", "speaker-name", "text"]; }

    constructor() {
      super();
      attach(this, `<style>
        :host { display: block; }
        .entry { padding: 10px 2px 12px; border-bottom: 1px solid rgb(68 88 124 / .11); }
        .speaker { margin: 0 0 4px; color: #33415a; font-size: 14px; font-weight: 750; overflow-wrap: anywhere; }
        .speaker:empty { display: none; }
        .text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.65; }
      </style><article class="entry"><h3 class="speaker"></h3><p class="text"></p></article>`);
    }

    connectedCallback() { this._render(); }
    attributeChangedCallback() { this._render(); }

    _render() {
      this.shadowRoot.querySelector(".speaker").textContent = this.getAttribute("speaker-name") ?? "";
      this.shadowRoot.querySelector(".text").textContent = this.getAttribute("text") ?? "";
    }
  }

  customElements.define("lr-dialogue-view", DialogueViewElement);
  customElements.define("lr-dialogue-characters", DialogueCharactersElement);
  customElements.define("lr-dialogue-character", DialogueCharacterElement);
  customElements.define("lr-dialogue-conversation", DialogueConversationElement);
  customElements.define("lr-dialogue-text", DialogueTextElement);
  customElements.define("lr-dialogue-choices", DialogueChoicesElement);
  customElements.define("lr-dialogue-choice", DialogueChoiceElement);
  customElements.define("lr-dialogue-controls", DialogueControlsElement);
  customElements.define("lr-dialogue-control-hint", DialogueControlHintElement);
  customElements.define("lr-dialogue-history", DialogueHistoryElement);
  customElements.define("lr-dialogue-history-entry", DialogueHistoryEntryElement);
})();
