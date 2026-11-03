type JsonData = Readonly<Record<string, unknown>>;

interface PresentationContext {
  emitCustomEvent(name: string, data?: Record<string, unknown>): void;
}

interface PresentationEvent {
  readonly name: string;
  readonly data: JsonData;
}

function shadow(host: HTMLElement, content: string): ShadowRoot {
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = content;
  return root;
}

class SlotElement extends HTMLElement {
  constructor() {
    super();
    shadow(this, `<slot></slot>`);
  }
}

export class DialogueViewElement extends SlotElement {}
export class DialogueCharactersElement extends SlotElement {}
export class DialogueChoicesElement extends SlotElement {}
export class DialogueControlsElement extends SlotElement {}

export class DialogueCharacterElement extends HTMLElement {
  static observedAttributes = ["character-id", "display-name", "active"];
  _data?: JsonData;

  constructor() {
    super();
    shadow(this, `<style>
      :host { display: block; }
      .character { display: grid; place-items: center; gap: .25rem; opacity: .68; transition: opacity 120ms ease; }
      :host([active="true"]) .character { opacity: 1; }
      .portrait { width: 4rem; height: 4rem; border-radius: 50%; background: color-mix(in srgb, currentColor 14%, transparent); display: grid; place-items: center; font-weight: 700; }
      .name { font-size: .875rem; max-width: 8rem; overflow-wrap: anywhere; text-align: center; }
    </style><div class="character"><div class="portrait" aria-hidden="true"></div><div class="name"></div></div>`);
  }

  connectedCallback(): void { this.render(); }
  attributeChangedCallback(): void { this.render(); }
  receiveRenderData(data: JsonData): void { this._data = data; }

  private render(): void {
    const name = this.getAttribute("display-name") ?? this.getAttribute("character-id") ?? "";
    const portrait = this.shadowRoot?.querySelector<HTMLElement>(".portrait");
    const label = this.shadowRoot?.querySelector<HTMLElement>(".name");
    if (portrait !== null && portrait !== undefined) portrait.textContent = Array.from(name)[0] ?? "";
    if (label !== null && label !== undefined) label.textContent = name;
  }
}

export class DialogueTextElement extends HTMLElement {
  static observedAttributes = ["text"];
  private coordinated = false;
  private visibleText = "";

  constructor() {
    super();
    shadow(this, `<style>:host{display:block;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55;min-height:1.55em}</style><span></span>`);
  }

  connectedCallback(): void { this.render(); }
  attributeChangedCallback(): void {
    if (!this.coordinated) this.visibleText = "";
    this.render();
  }

  setRevealedText(value: string): void {
    this.coordinated = true;
    this.visibleText = value;
    this.render();
  }

  fullText(): string { return this.getAttribute("text") ?? ""; }

  private render(): void {
    const target = this.shadowRoot?.querySelector("span");
    if (target !== null && target !== undefined) target.textContent = this.visibleText;
  }
}

export class DialogueChoiceElement extends HTMLElement {
  static observedAttributes = ["choice-id", "text", "enabled"];
  _data?: JsonData;
  private selected = false;

  constructor() {
    super();
    shadow(this, `<style>
      :host { display: block; }
      .choice { padding: .55rem .75rem; border-radius: .45rem; border: 1px solid color-mix(in srgb, currentColor 24%, transparent); overflow-wrap: anywhere; }
      .choice.selected { outline: 2px solid currentColor; outline-offset: 2px; }
      .choice.disabled { opacity: .45; }
    </style><div class="choice" role="option"></div>`);
  }

  connectedCallback(): void { this.render(); }
  attributeChangedCallback(): void { this.render(); }
  receiveRenderData(data: JsonData): void { this._data = data; }
  choiceId(): string | null { return this.getAttribute("choice-id"); }
  isEnabled(): boolean { return this.getAttribute("enabled") !== "false"; }
  isSelected(): boolean { return this.selected; }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.render();
  }

  private render(): void {
    const target = this.shadowRoot?.querySelector<HTMLElement>(".choice");
    if (target === null || target === undefined) return;
    target.textContent = this.getAttribute("text") ?? "";
    target.classList.toggle("selected", this.selected);
    target.classList.toggle("disabled", !this.isEnabled());
    target.setAttribute("aria-selected", this.selected ? "true" : "false");
    target.setAttribute("aria-disabled", this.isEnabled() ? "false" : "true");
  }
}

export class DialogueConversationElement extends HTMLElement {
  static observedAttributes = ["conversation-id", "speaker-name"];
  _data?: JsonData;
  _events: string[] = [];
  _selectedChoiceId: string | null = null;
  _revealComplete = false;
  private context?: PresentationContext;
  private revealTimer?: number;
  private revealIndex = 0;
  private revealText = "";
  private observedConversationId: string | null = null;
  private readonly observer = new MutationObserver(() => this.syncPresentation());

  constructor() {
    super();
    shadow(this, `<style>
      :host { display: block; min-width: 0; }
      .speaker { font-weight: 700; margin-bottom: .35rem; overflow-wrap: anywhere; }
      .speaker:empty { display: none; }
      .body { max-height: min(42vh, 24rem); overflow: auto; overscroll-behavior: contain; padding: .15rem; }
      ::slotted(lr-dialogue-choices) { display: grid; gap: .55rem; margin-top: .9rem; }
    </style><div class="speaker"></div><div class="body"><slot></slot></div>`);
  }

  connectedCallback(): void {
    this.observer.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: ["text", "enabled", "choice-id"] });
    this.renderSpeaker();
    this.syncConversationIdentity();
    this.syncPresentation();
  }

  disconnectedCallback(): void {
    this.observer.disconnect();
    this.stopRevealTimer();
  }

  attributeChangedCallback(name: string): void {
    if (name === "conversation-id") this.syncConversationIdentity();
    this.renderSpeaker();
  }

  receiveRenderContext(context: PresentationContext): void {
    if (context === null || typeof context !== "object" || typeof context.emitCustomEvent !== "function") {
      throw new TypeError("Invalid WebPresentationContext");
    }
    this.context = context;
  }

  receiveRenderData(data: JsonData): void { this._data = data; }

  receiveRenderEvent(event: PresentationEvent): void {
    if (event === null || typeof event !== "object" || typeof event.name !== "string") return;
    this._events.push(event.name);
    if (event.name === "choice-next") this.moveSelection(1);
    else if (event.name === "choice-previous") this.moveSelection(-1);
    else if (event.name === "commit") this.commit();
    else if (event.name === "scroll-up") this.scrollConversation(-1);
    else if (event.name === "scroll-down") this.scrollConversation(1);
  }

  private renderSpeaker(): void {
    const target = this.shadowRoot?.querySelector<HTMLElement>(".speaker");
    if (target !== null && target !== undefined) target.textContent = this.getAttribute("speaker-name") ?? "";
  }

  private syncConversationIdentity(): void {
    const next = this.getAttribute("conversation-id");
    if (next === null || next === this.observedConversationId) return;
    this.observedConversationId = next;
    this._selectedChoiceId = null;
    this._revealComplete = false;
    this.revealIndex = 0;
    this.revealText = "";
    this.stopRevealTimer();
    const body = this.shadowRoot?.querySelector<HTMLElement>(".body");
    if (body !== null && body !== undefined) body.scrollTop = 0;
    this.syncSelection();
    queueMicrotask(() => this.syncPresentation());
  }

  private textElement(): DialogueTextElement | null {
    return this.querySelector("lr-dialogue-text") as DialogueTextElement | null;
  }

  private choiceElements(): DialogueChoiceElement[] {
    const container = this.querySelector("lr-dialogue-choices");
    if (container === null) return [];
    return Array.from(container.children).filter((child): child is DialogueChoiceElement => child instanceof DialogueChoiceElement);
  }

  private syncPresentation(): void {
    const text = this.textElement();
    if (text !== null) {
      const full = text.fullText();
      if (full !== this.revealText) {
        this.revealText = full;
        this.revealIndex = 0;
        this._revealComplete = full.length === 0;
        text.setRevealedText(this._revealComplete ? full : "");
        this.startRevealTimer();
      } else if (full.length === 0) {
        this._revealComplete = true;
        text.setRevealedText("");
      } else if (this._revealComplete) {
        text.setRevealedText(full);
      }
      if (this.isConnected && !this._revealComplete && full.length > 0 && this.revealTimer === undefined) {
        this.startRevealTimer();
      }
    }
    const selectedStillEnabled = this.choiceElements().some((choice) => choice.choiceId() === this._selectedChoiceId && choice.isEnabled());
    if (!selectedStillEnabled) this._selectedChoiceId = null;
    this.syncSelection();
  }

  private startRevealTimer(): void {
    this.stopRevealTimer();
    if (this._revealComplete || this.revealText.length === 0) return;
    const units = Array.from(this.revealText);
    this.revealTimer = window.setInterval(() => {
      this.revealIndex += 1;
      this.textElement()?.setRevealedText(units.slice(0, this.revealIndex).join(""));
      if (this.revealIndex >= units.length) {
        this._revealComplete = true;
        this.stopRevealTimer();
      }
    }, 24);
  }

  private stopRevealTimer(): void {
    if (this.revealTimer !== undefined) window.clearInterval(this.revealTimer);
    this.revealTimer = undefined;
  }

  private revealAll(): void {
    this._revealComplete = true;
    this.revealIndex = Array.from(this.revealText).length;
    this.stopRevealTimer();
    this.textElement()?.setRevealedText(this.revealText);
  }

  private moveSelection(direction: 1 | -1): void {
    const enabled = this.choiceElements().filter((choice) => choice.isEnabled() && choice.choiceId() !== null);
    if (enabled.length === 0) return;
    const index = enabled.findIndex((choice) => choice.choiceId() === this._selectedChoiceId);
    const next = index < 0
      ? (direction === 1 ? enabled[0] : enabled[enabled.length - 1])
      : enabled[(index + direction + enabled.length) % enabled.length];
    this._selectedChoiceId = next.choiceId();
    this.syncSelection();
  }

  private syncSelection(): void {
    for (const choice of this.choiceElements()) choice.setSelected(choice.choiceId() === this._selectedChoiceId);
  }

  private commit(): void {
    this.syncPresentation();
    if (!this._revealComplete) {
      this.revealAll();
      return;
    }
    const choices = this.choiceElements();
    const conversationId = this.getAttribute("conversation-id");
    if (conversationId === null) return;
    if (choices.length === 0) {
      this.context?.emitCustomEvent("submit", { conversationId });
      return;
    }
    const selected = choices.find((choice) => choice.choiceId() === this._selectedChoiceId && choice.isEnabled());
    if (selected?.choiceId() !== null && selected?.choiceId() !== undefined) {
      this.context?.emitCustomEvent("submit", { conversationId, choiceId: selected.choiceId() as string });
    }
  }

  private scrollConversation(direction: 1 | -1): void {
    const body = this.shadowRoot?.querySelector<HTMLElement>(".body");
    if (body !== null && body !== undefined) body.scrollBy({ top: direction * Math.max(48, body.clientHeight * .7), behavior: "smooth" });
  }
}

export class DialogueControlHintElement extends HTMLElement {
  static observedAttributes = ["action", "label", "enabled"];

  constructor() {
    super();
    shadow(this, `<style>:host{display:inline-block}.hint{font-size:.8rem;padding:.2rem .45rem;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:.35rem}.disabled{opacity:.38}</style><span class="hint"></span>`);
  }

  connectedCallback(): void { this.render(); }
  attributeChangedCallback(): void { this.render(); }

  private render(): void {
    const target = this.shadowRoot?.querySelector<HTMLElement>(".hint");
    if (target === null || target === undefined) return;
    target.textContent = this.getAttribute("label") ?? this.getAttribute("action") ?? "";
    target.classList.toggle("disabled", this.getAttribute("enabled") !== "true");
    target.setAttribute("aria-disabled", this.getAttribute("enabled") === "true" ? "false" : "true");
  }
}

export class DialogueHistoryEntryElement extends HTMLElement {
  static observedAttributes = ["entry-id", "speaker-name", "text"];

  constructor() {
    super();
    shadow(this, `<style>:host{display:block}.entry{padding:.55rem 0;border-bottom:1px solid color-mix(in srgb,currentColor 14%,transparent)}.speaker{font-weight:700;margin-right:.4rem}.text{white-space:pre-wrap;overflow-wrap:anywhere}</style><div class="entry"><span class="speaker"></span><span class="text"></span></div>`);
  }

  connectedCallback(): void { this.render(); }
  attributeChangedCallback(): void { this.render(); }

  private render(): void {
    const speaker = this.shadowRoot?.querySelector<HTMLElement>(".speaker");
    const text = this.shadowRoot?.querySelector<HTMLElement>(".text");
    if (speaker !== null && speaker !== undefined) speaker.textContent = this.hasAttribute("speaker-name") ? `${this.getAttribute("speaker-name")}:` : "";
    if (text !== null && text !== undefined) text.textContent = this.getAttribute("text") ?? "";
  }
}

export class DialogueHistoryElement extends HTMLElement {
  static observedAttributes = ["visible"];
  _events: string[] = [];

  constructor() {
    super();
    shadow(this, `<style>
      :host { display: none; position: absolute; inset: 0; z-index: 2; }
      :host([visible="true"]) { display: grid; }
      .backdrop { position: absolute; inset: 0; background: rgb(0 0 0 / .54); }
      .panel { position: relative; align-self: center; justify-self: center; width: min(42rem, calc(100% - 2rem)); max-height: min(70vh, 36rem); overflow: auto; box-sizing: border-box; padding: 1rem 1.25rem; border-radius: .75rem; background: Canvas; color: CanvasText; }
      h2 { margin: 0 0 .75rem; font-size: 1rem; }
    </style><div class="backdrop"></div><section class="panel" aria-label="Dialogue history"><h2>History</h2><slot></slot></section>`);
  }

  receiveRenderEvent(event: PresentationEvent): void {
    if (event === null || typeof event !== "object" || typeof event.name !== "string") return;
    this._events.push(event.name);
    const panel = this.shadowRoot?.querySelector<HTMLElement>(".panel");
    if (panel === null || panel === undefined) return;
    if (event.name === "scroll-to-latest") panel.scrollTop = panel.scrollHeight;
    else if (event.name === "scroll-up") panel.scrollBy({ top: -Math.max(48, panel.clientHeight * .75), behavior: "smooth" });
    else if (event.name === "scroll-down") panel.scrollBy({ top: Math.max(48, panel.clientHeight * .75), behavior: "smooth" });
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
