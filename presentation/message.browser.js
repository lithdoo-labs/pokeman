class PokeManMessageElement extends HTMLElement {
  constructor() {
    super();
    this._data = {};
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      :host{position:absolute;inset:0;display:grid;place-items:center;background:rgb(0 0 0/.58);font:16px/1.5 system-ui;color:#f8f7ff}
      section{width:min(32rem,calc(100% - 2rem));padding:1.25rem;border:2px solid #e8ddff;border-radius:14px;background:#201a33;box-shadow:0 16px 44px #0009}
      p{margin:0 0 1rem}.actions{display:grid;gap:.5rem}.action{padding:.55rem .75rem;border-radius:8px;background:#33284f}.action[aria-selected=true]{background:#6b50a4;outline:2px solid #fff}
    </style><section role="document"><p></p><div class="actions"></div></section>`;
  }
  connectedCallback() { this.render(); }
  receiveRenderData(data) { this._data = data ?? {}; this.render(); }
  render() {
    const text = this.shadowRoot?.querySelector("p");
    const actions = this.shadowRoot?.querySelector(".actions");
    if (!text || !actions) return;
    text.textContent = typeof this._data.text === "string" ? this._data.text : "";
    actions.replaceChildren(...(Array.isArray(this._data.actions) ? this._data.actions : []).map((action, index) => {
      const node = document.createElement("div"); node.className = "action"; node.textContent = action.label ?? "";
      node.setAttribute("aria-selected", String(index === this._data.selected)); return node;
    }));
  }
}
if (!customElements.get("pokeman-message")) customElements.define("pokeman-message", PokeManMessageElement);
