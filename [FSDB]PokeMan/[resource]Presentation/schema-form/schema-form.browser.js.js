for (const tag of ["lr-schema-form", "lr-schema-form-field", "wa-input", "wa-icon", "wa-textarea", "wa-checkbox", "wa-select", "wa-tag", "wa-option", "wa-popup", "wa-button", "wa-spinner", "wa-dialog"]) { if (customElements.get(tag) !== undefined) throw new TypeError("Schema Form browser element collision: " + tag); }
"use strict";
(() => {
  // ../../node_modules/@lit/reactive-element/css-tag.js
  var t = globalThis;
  var e = t.ShadowRoot && (void 0 === t.ShadyCSS || t.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
  var s = Symbol();
  var o = /* @__PURE__ */ new WeakMap();
  var n = class {
    constructor(t6, e10, o10) {
      if (this._$cssResult$ = true, o10 !== s) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
      this.cssText = t6, this.t = e10;
    }
    get styleSheet() {
      let t6 = this.o;
      const s4 = this.t;
      if (e && void 0 === t6) {
        const e10 = void 0 !== s4 && 1 === s4.length;
        e10 && (t6 = o.get(s4)), void 0 === t6 && ((this.o = t6 = new CSSStyleSheet()).replaceSync(this.cssText), e10 && o.set(s4, t6));
      }
      return t6;
    }
    toString() {
      return this.cssText;
    }
  };
  var r = (t6) => new n("string" == typeof t6 ? t6 : t6 + "", void 0, s);
  var i = (t6, ...e10) => {
    const o10 = 1 === t6.length ? t6[0] : e10.reduce((e11, s4, o11) => e11 + ((t7) => {
      if (true === t7._$cssResult$) return t7.cssText;
      if ("number" == typeof t7) return t7;
      throw Error("Value passed to 'css' function must be a 'css' function result: " + t7 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
    })(s4) + t6[o11 + 1], t6[0]);
    return new n(o10, t6, s);
  };
  var S = (s4, o10) => {
    if (e) s4.adoptedStyleSheets = o10.map((t6) => t6 instanceof CSSStyleSheet ? t6 : t6.styleSheet);
    else for (const e10 of o10) {
      const o11 = document.createElement("style"), n6 = t.litNonce;
      void 0 !== n6 && o11.setAttribute("nonce", n6), o11.textContent = e10.cssText, s4.appendChild(o11);
    }
  };
  var c = e ? (t6) => t6 : (t6) => t6 instanceof CSSStyleSheet ? ((t7) => {
    let e10 = "";
    for (const s4 of t7.cssRules) e10 += s4.cssText;
    return r(e10);
  })(t6) : t6;

  // ../../node_modules/@lit/reactive-element/reactive-element.js
  var { is: i2, defineProperty: e2, getOwnPropertyDescriptor: h, getOwnPropertyNames: r2, getOwnPropertySymbols: o2, getPrototypeOf: n2 } = Object;
  var a = globalThis;
  var c2 = a.trustedTypes;
  var l = c2 ? c2.emptyScript : "";
  var p = a.reactiveElementPolyfillSupport;
  var d = (t6, s4) => t6;
  var u = { toAttribute(t6, s4) {
    switch (s4) {
      case Boolean:
        t6 = t6 ? l : null;
        break;
      case Object:
      case Array:
        t6 = null == t6 ? t6 : JSON.stringify(t6);
    }
    return t6;
  }, fromAttribute(t6, s4) {
    let i8 = t6;
    switch (s4) {
      case Boolean:
        i8 = null !== t6;
        break;
      case Number:
        i8 = null === t6 ? null : Number(t6);
        break;
      case Object:
      case Array:
        try {
          i8 = JSON.parse(t6);
        } catch (t7) {
          i8 = null;
        }
    }
    return i8;
  } };
  var f = (t6, s4) => !i2(t6, s4);
  var b = { attribute: true, type: String, converter: u, reflect: false, useDefault: false, hasChanged: f };
  Symbol.metadata ??= Symbol("metadata"), a.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
  var y = class extends HTMLElement {
    static addInitializer(t6) {
      this._$Ei(), (this.l ??= []).push(t6);
    }
    static get observedAttributes() {
      return this.finalize(), this._$Eh && [...this._$Eh.keys()];
    }
    static createProperty(t6, s4 = b) {
      if (s4.state && (s4.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t6) && ((s4 = Object.create(s4)).wrapped = true), this.elementProperties.set(t6, s4), !s4.noAccessor) {
        const i8 = Symbol(), h3 = this.getPropertyDescriptor(t6, i8, s4);
        void 0 !== h3 && e2(this.prototype, t6, h3);
      }
    }
    static getPropertyDescriptor(t6, s4, i8) {
      const { get: e10, set: r8 } = h(this.prototype, t6) ?? { get() {
        return this[s4];
      }, set(t7) {
        this[s4] = t7;
      } };
      return { get: e10, set(s5) {
        const h3 = e10?.call(this);
        r8?.call(this, s5), this.requestUpdate(t6, h3, i8);
      }, configurable: true, enumerable: true };
    }
    static getPropertyOptions(t6) {
      return this.elementProperties.get(t6) ?? b;
    }
    static _$Ei() {
      if (this.hasOwnProperty(d("elementProperties"))) return;
      const t6 = n2(this);
      t6.finalize(), void 0 !== t6.l && (this.l = [...t6.l]), this.elementProperties = new Map(t6.elementProperties);
    }
    static finalize() {
      if (this.hasOwnProperty(d("finalized"))) return;
      if (this.finalized = true, this._$Ei(), this.hasOwnProperty(d("properties"))) {
        const t7 = this.properties, s4 = [...r2(t7), ...o2(t7)];
        for (const i8 of s4) this.createProperty(i8, t7[i8]);
      }
      const t6 = this[Symbol.metadata];
      if (null !== t6) {
        const s4 = litPropertyMetadata.get(t6);
        if (void 0 !== s4) for (const [t7, i8] of s4) this.elementProperties.set(t7, i8);
      }
      this._$Eh = /* @__PURE__ */ new Map();
      for (const [t7, s4] of this.elementProperties) {
        const i8 = this._$Eu(t7, s4);
        void 0 !== i8 && this._$Eh.set(i8, t7);
      }
      this.elementStyles = this.finalizeStyles(this.styles);
    }
    static finalizeStyles(s4) {
      const i8 = [];
      if (Array.isArray(s4)) {
        const e10 = new Set(s4.flat(1 / 0).reverse());
        for (const s5 of e10) i8.unshift(c(s5));
      } else void 0 !== s4 && i8.push(c(s4));
      return i8;
    }
    static _$Eu(t6, s4) {
      const i8 = s4.attribute;
      return false === i8 ? void 0 : "string" == typeof i8 ? i8 : "string" == typeof t6 ? t6.toLowerCase() : void 0;
    }
    constructor() {
      super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
    }
    _$Ev() {
      this._$ES = new Promise((t6) => this.enableUpdating = t6), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t6) => t6(this));
    }
    addController(t6) {
      (this._$EO ??= /* @__PURE__ */ new Set()).add(t6), void 0 !== this.renderRoot && this.isConnected && t6.hostConnected?.();
    }
    removeController(t6) {
      this._$EO?.delete(t6);
    }
    _$E_() {
      const t6 = /* @__PURE__ */ new Map(), s4 = this.constructor.elementProperties;
      for (const i8 of s4.keys()) this.hasOwnProperty(i8) && (t6.set(i8, this[i8]), delete this[i8]);
      t6.size > 0 && (this._$Ep = t6);
    }
    createRenderRoot() {
      const t6 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
      return S(t6, this.constructor.elementStyles), t6;
    }
    connectedCallback() {
      this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(true), this._$EO?.forEach((t6) => t6.hostConnected?.());
    }
    enableUpdating(t6) {
    }
    disconnectedCallback() {
      this._$EO?.forEach((t6) => t6.hostDisconnected?.());
    }
    attributeChangedCallback(t6, s4, i8) {
      this._$AK(t6, i8);
    }
    _$ET(t6, s4) {
      const i8 = this.constructor.elementProperties.get(t6), e10 = this.constructor._$Eu(t6, i8);
      if (void 0 !== e10 && true === i8.reflect) {
        const h3 = (void 0 !== i8.converter?.toAttribute ? i8.converter : u).toAttribute(s4, i8.type);
        this._$Em = t6, null == h3 ? this.removeAttribute(e10) : this.setAttribute(e10, h3), this._$Em = null;
      }
    }
    _$AK(t6, s4) {
      const i8 = this.constructor, e10 = i8._$Eh.get(t6);
      if (void 0 !== e10 && this._$Em !== e10) {
        const t7 = i8.getPropertyOptions(e10), h3 = "function" == typeof t7.converter ? { fromAttribute: t7.converter } : void 0 !== t7.converter?.fromAttribute ? t7.converter : u;
        this._$Em = e10;
        const r8 = h3.fromAttribute(s4, t7.type);
        this[e10] = r8 ?? this._$Ej?.get(e10) ?? r8, this._$Em = null;
      }
    }
    requestUpdate(t6, s4, i8, e10 = false, h3) {
      if (void 0 !== t6) {
        const r8 = this.constructor;
        if (false === e10 && (h3 = this[t6]), i8 ??= r8.getPropertyOptions(t6), !((i8.hasChanged ?? f)(h3, s4) || i8.useDefault && i8.reflect && h3 === this._$Ej?.get(t6) && !this.hasAttribute(r8._$Eu(t6, i8)))) return;
        this.C(t6, s4, i8);
      }
      false === this.isUpdatePending && (this._$ES = this._$EP());
    }
    C(t6, s4, { useDefault: i8, reflect: e10, wrapped: h3 }, r8) {
      i8 && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t6) && (this._$Ej.set(t6, r8 ?? s4 ?? this[t6]), true !== h3 || void 0 !== r8) || (this._$AL.has(t6) || (this.hasUpdated || i8 || (s4 = void 0), this._$AL.set(t6, s4)), true === e10 && this._$Em !== t6 && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t6));
    }
    async _$EP() {
      this.isUpdatePending = true;
      try {
        await this._$ES;
      } catch (t7) {
        Promise.reject(t7);
      }
      const t6 = this.scheduleUpdate();
      return null != t6 && await t6, !this.isUpdatePending;
    }
    scheduleUpdate() {
      return this.performUpdate();
    }
    performUpdate() {
      if (!this.isUpdatePending) return;
      if (!this.hasUpdated) {
        if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
          for (const [t8, s5] of this._$Ep) this[t8] = s5;
          this._$Ep = void 0;
        }
        const t7 = this.constructor.elementProperties;
        if (t7.size > 0) for (const [s5, i8] of t7) {
          const { wrapped: t8 } = i8, e10 = this[s5];
          true !== t8 || this._$AL.has(s5) || void 0 === e10 || this.C(s5, void 0, i8, e10);
        }
      }
      let t6 = false;
      const s4 = this._$AL;
      try {
        t6 = this.shouldUpdate(s4), t6 ? (this.willUpdate(s4), this._$EO?.forEach((t7) => t7.hostUpdate?.()), this.update(s4)) : this._$EM();
      } catch (s5) {
        throw t6 = false, this._$EM(), s5;
      }
      t6 && this._$AE(s4);
    }
    willUpdate(t6) {
    }
    _$AE(t6) {
      this._$EO?.forEach((t7) => t7.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t6)), this.updated(t6);
    }
    _$EM() {
      this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = false;
    }
    get updateComplete() {
      return this.getUpdateComplete();
    }
    getUpdateComplete() {
      return this._$ES;
    }
    shouldUpdate(t6) {
      return true;
    }
    update(t6) {
      this._$Eq &&= this._$Eq.forEach((t7) => this._$ET(t7, this[t7])), this._$EM();
    }
    updated(t6) {
    }
    firstUpdated(t6) {
    }
  };
  y.elementStyles = [], y.shadowRootOptions = { mode: "open" }, y[d("elementProperties")] = /* @__PURE__ */ new Map(), y[d("finalized")] = /* @__PURE__ */ new Map(), p?.({ ReactiveElement: y }), (a.reactiveElementVersions ??= []).push("2.1.2");

  // ../../node_modules/lit-html/lit-html.js
  var t2 = globalThis;
  var i3 = (t6) => t6;
  var s2 = t2.trustedTypes;
  var e3 = s2 ? s2.createPolicy("lit-html", { createHTML: (t6) => t6 }) : void 0;
  var h2 = "$lit$";
  var o3 = `lit$${Math.random().toFixed(9).slice(2)}$`;
  var n3 = "?" + o3;
  var r3 = `<${n3}>`;
  var l2 = document;
  var c3 = () => l2.createComment("");
  var a2 = (t6) => null === t6 || "object" != typeof t6 && "function" != typeof t6;
  var u2 = Array.isArray;
  var d2 = (t6) => u2(t6) || "function" == typeof t6?.[Symbol.iterator];
  var f2 = "[ 	\n\f\r]";
  var v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
  var _ = /-->/g;
  var m = />/g;
  var p2 = RegExp(`>|${f2}(?:([^\\s"'>=/]+)(${f2}*=${f2}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g");
  var g = /'/g;
  var $ = /"/g;
  var y2 = /^(?:script|style|textarea|title)$/i;
  var x = (t6) => (i8, ...s4) => ({ _$litType$: t6, strings: i8, values: s4 });
  var b2 = x(1);
  var w = x(2);
  var T = x(3);
  var E = Symbol.for("lit-noChange");
  var A = Symbol.for("lit-nothing");
  var C = /* @__PURE__ */ new WeakMap();
  var P = l2.createTreeWalker(l2, 129);
  function V(t6, i8) {
    if (!u2(t6) || !t6.hasOwnProperty("raw")) throw Error("invalid template strings array");
    return void 0 !== e3 ? e3.createHTML(i8) : i8;
  }
  var N = (t6, i8) => {
    const s4 = t6.length - 1, e10 = [];
    let n6, l6 = 2 === i8 ? "<svg>" : 3 === i8 ? "<math>" : "", c5 = v;
    for (let i9 = 0; i9 < s4; i9++) {
      const s5 = t6[i9];
      let a4, u4, d3 = -1, f3 = 0;
      for (; f3 < s5.length && (c5.lastIndex = f3, u4 = c5.exec(s5), null !== u4); ) f3 = c5.lastIndex, c5 === v ? "!--" === u4[1] ? c5 = _ : void 0 !== u4[1] ? c5 = m : void 0 !== u4[2] ? (y2.test(u4[2]) && (n6 = RegExp("</" + u4[2], "g")), c5 = p2) : void 0 !== u4[3] && (c5 = p2) : c5 === p2 ? ">" === u4[0] ? (c5 = n6 ?? v, d3 = -1) : void 0 === u4[1] ? d3 = -2 : (d3 = c5.lastIndex - u4[2].length, a4 = u4[1], c5 = void 0 === u4[3] ? p2 : '"' === u4[3] ? $ : g) : c5 === $ || c5 === g ? c5 = p2 : c5 === _ || c5 === m ? c5 = v : (c5 = p2, n6 = void 0);
      const x2 = c5 === p2 && t6[i9 + 1].startsWith("/>") ? " " : "";
      l6 += c5 === v ? s5 + r3 : d3 >= 0 ? (e10.push(a4), s5.slice(0, d3) + h2 + s5.slice(d3) + o3 + x2) : s5 + o3 + (-2 === d3 ? i9 : x2);
    }
    return [V(t6, l6 + (t6[s4] || "<?>") + (2 === i8 ? "</svg>" : 3 === i8 ? "</math>" : "")), e10];
  };
  var S2 = class _S {
    constructor({ strings: t6, _$litType$: i8 }, e10) {
      let r8;
      this.parts = [];
      let l6 = 0, a4 = 0;
      const u4 = t6.length - 1, d3 = this.parts, [f3, v2] = N(t6, i8);
      if (this.el = _S.createElement(f3, e10), P.currentNode = this.el.content, 2 === i8 || 3 === i8) {
        const t7 = this.el.content.firstChild;
        t7.replaceWith(...t7.childNodes);
      }
      for (; null !== (r8 = P.nextNode()) && d3.length < u4; ) {
        if (1 === r8.nodeType) {
          if (r8.hasAttributes()) for (const t7 of r8.getAttributeNames()) if (t7.endsWith(h2)) {
            const i9 = v2[a4++], s4 = r8.getAttribute(t7).split(o3), e11 = /([.?@])?(.*)/.exec(i9);
            d3.push({ type: 1, index: l6, name: e11[2], strings: s4, ctor: "." === e11[1] ? I : "?" === e11[1] ? L : "@" === e11[1] ? z : H }), r8.removeAttribute(t7);
          } else t7.startsWith(o3) && (d3.push({ type: 6, index: l6 }), r8.removeAttribute(t7));
          if (y2.test(r8.tagName)) {
            const t7 = r8.textContent.split(o3), i9 = t7.length - 1;
            if (i9 > 0) {
              r8.textContent = s2 ? s2.emptyScript : "";
              for (let s4 = 0; s4 < i9; s4++) r8.append(t7[s4], c3()), P.nextNode(), d3.push({ type: 2, index: ++l6 });
              r8.append(t7[i9], c3());
            }
          }
        } else if (8 === r8.nodeType) if (r8.data === n3) d3.push({ type: 2, index: l6 });
        else {
          let t7 = -1;
          for (; -1 !== (t7 = r8.data.indexOf(o3, t7 + 1)); ) d3.push({ type: 7, index: l6 }), t7 += o3.length - 1;
        }
        l6++;
      }
    }
    static createElement(t6, i8) {
      const s4 = l2.createElement("template");
      return s4.innerHTML = t6, s4;
    }
  };
  function M(t6, i8, s4 = t6, e10) {
    if (i8 === E) return i8;
    let h3 = void 0 !== e10 ? s4._$Co?.[e10] : s4._$Cl;
    const o10 = a2(i8) ? void 0 : i8._$litDirective$;
    return h3?.constructor !== o10 && (h3?._$AO?.(false), void 0 === o10 ? h3 = void 0 : (h3 = new o10(t6), h3._$AT(t6, s4, e10)), void 0 !== e10 ? (s4._$Co ??= [])[e10] = h3 : s4._$Cl = h3), void 0 !== h3 && (i8 = M(t6, h3._$AS(t6, i8.values), h3, e10)), i8;
  }
  var R = class {
    constructor(t6, i8) {
      this._$AV = [], this._$AN = void 0, this._$AD = t6, this._$AM = i8;
    }
    get parentNode() {
      return this._$AM.parentNode;
    }
    get _$AU() {
      return this._$AM._$AU;
    }
    u(t6) {
      const { el: { content: i8 }, parts: s4 } = this._$AD, e10 = (t6?.creationScope ?? l2).importNode(i8, true);
      P.currentNode = e10;
      let h3 = P.nextNode(), o10 = 0, n6 = 0, r8 = s4[0];
      for (; void 0 !== r8; ) {
        if (o10 === r8.index) {
          let i9;
          2 === r8.type ? i9 = new k(h3, h3.nextSibling, this, t6) : 1 === r8.type ? i9 = new r8.ctor(h3, r8.name, r8.strings, this, t6) : 6 === r8.type && (i9 = new Z(h3, this, t6)), this._$AV.push(i9), r8 = s4[++n6];
        }
        o10 !== r8?.index && (h3 = P.nextNode(), o10++);
      }
      return P.currentNode = l2, e10;
    }
    p(t6) {
      let i8 = 0;
      for (const s4 of this._$AV) void 0 !== s4 && (void 0 !== s4.strings ? (s4._$AI(t6, s4, i8), i8 += s4.strings.length - 2) : s4._$AI(t6[i8])), i8++;
    }
  };
  var k = class _k {
    get _$AU() {
      return this._$AM?._$AU ?? this._$Cv;
    }
    constructor(t6, i8, s4, e10) {
      this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t6, this._$AB = i8, this._$AM = s4, this.options = e10, this._$Cv = e10?.isConnected ?? true;
    }
    get parentNode() {
      let t6 = this._$AA.parentNode;
      const i8 = this._$AM;
      return void 0 !== i8 && 11 === t6?.nodeType && (t6 = i8.parentNode), t6;
    }
    get startNode() {
      return this._$AA;
    }
    get endNode() {
      return this._$AB;
    }
    _$AI(t6, i8 = this) {
      t6 = M(this, t6, i8), a2(t6) ? t6 === A || null == t6 || "" === t6 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t6 !== this._$AH && t6 !== E && this._(t6) : void 0 !== t6._$litType$ ? this.$(t6) : void 0 !== t6.nodeType ? this.T(t6) : d2(t6) ? this.k(t6) : this._(t6);
    }
    O(t6) {
      return this._$AA.parentNode.insertBefore(t6, this._$AB);
    }
    T(t6) {
      this._$AH !== t6 && (this._$AR(), this._$AH = this.O(t6));
    }
    _(t6) {
      this._$AH !== A && a2(this._$AH) ? this._$AA.nextSibling.data = t6 : this.T(l2.createTextNode(t6)), this._$AH = t6;
    }
    $(t6) {
      const { values: i8, _$litType$: s4 } = t6, e10 = "number" == typeof s4 ? this._$AC(t6) : (void 0 === s4.el && (s4.el = S2.createElement(V(s4.h, s4.h[0]), this.options)), s4);
      if (this._$AH?._$AD === e10) this._$AH.p(i8);
      else {
        const t7 = new R(e10, this), s5 = t7.u(this.options);
        t7.p(i8), this.T(s5), this._$AH = t7;
      }
    }
    _$AC(t6) {
      let i8 = C.get(t6.strings);
      return void 0 === i8 && C.set(t6.strings, i8 = new S2(t6)), i8;
    }
    k(t6) {
      u2(this._$AH) || (this._$AH = [], this._$AR());
      const i8 = this._$AH;
      let s4, e10 = 0;
      for (const h3 of t6) e10 === i8.length ? i8.push(s4 = new _k(this.O(c3()), this.O(c3()), this, this.options)) : s4 = i8[e10], s4._$AI(h3), e10++;
      e10 < i8.length && (this._$AR(s4 && s4._$AB.nextSibling, e10), i8.length = e10);
    }
    _$AR(t6 = this._$AA.nextSibling, s4) {
      for (this._$AP?.(false, true, s4); t6 !== this._$AB; ) {
        const s5 = i3(t6).nextSibling;
        i3(t6).remove(), t6 = s5;
      }
    }
    setConnected(t6) {
      void 0 === this._$AM && (this._$Cv = t6, this._$AP?.(t6));
    }
  };
  var H = class {
    get tagName() {
      return this.element.tagName;
    }
    get _$AU() {
      return this._$AM._$AU;
    }
    constructor(t6, i8, s4, e10, h3) {
      this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t6, this.name = i8, this._$AM = e10, this.options = h3, s4.length > 2 || "" !== s4[0] || "" !== s4[1] ? (this._$AH = Array(s4.length - 1).fill(new String()), this.strings = s4) : this._$AH = A;
    }
    _$AI(t6, i8 = this, s4, e10) {
      const h3 = this.strings;
      let o10 = false;
      if (void 0 === h3) t6 = M(this, t6, i8, 0), o10 = !a2(t6) || t6 !== this._$AH && t6 !== E, o10 && (this._$AH = t6);
      else {
        const e11 = t6;
        let n6, r8;
        for (t6 = h3[0], n6 = 0; n6 < h3.length - 1; n6++) r8 = M(this, e11[s4 + n6], i8, n6), r8 === E && (r8 = this._$AH[n6]), o10 ||= !a2(r8) || r8 !== this._$AH[n6], r8 === A ? t6 = A : t6 !== A && (t6 += (r8 ?? "") + h3[n6 + 1]), this._$AH[n6] = r8;
      }
      o10 && !e10 && this.j(t6);
    }
    j(t6) {
      t6 === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t6 ?? "");
    }
  };
  var I = class extends H {
    constructor() {
      super(...arguments), this.type = 3;
    }
    j(t6) {
      this.element[this.name] = t6 === A ? void 0 : t6;
    }
  };
  var L = class extends H {
    constructor() {
      super(...arguments), this.type = 4;
    }
    j(t6) {
      this.element.toggleAttribute(this.name, !!t6 && t6 !== A);
    }
  };
  var z = class extends H {
    constructor(t6, i8, s4, e10, h3) {
      super(t6, i8, s4, e10, h3), this.type = 5;
    }
    _$AI(t6, i8 = this) {
      if ((t6 = M(this, t6, i8, 0) ?? A) === E) return;
      const s4 = this._$AH, e10 = t6 === A && s4 !== A || t6.capture !== s4.capture || t6.once !== s4.once || t6.passive !== s4.passive, h3 = t6 !== A && (s4 === A || e10);
      e10 && this.element.removeEventListener(this.name, this, s4), h3 && this.element.addEventListener(this.name, this, t6), this._$AH = t6;
    }
    handleEvent(t6) {
      "function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t6) : this._$AH.handleEvent(t6);
    }
  };
  var Z = class {
    constructor(t6, i8, s4) {
      this.element = t6, this.type = 6, this._$AN = void 0, this._$AM = i8, this.options = s4;
    }
    get _$AU() {
      return this._$AM._$AU;
    }
    _$AI(t6) {
      M(this, t6);
    }
  };
  var j = { M: h2, P: o3, A: n3, C: 1, L: N, R, D: d2, V: M, I: k, H, N: L, U: z, B: I, F: Z };
  var B = t2.litHtmlPolyfillSupport;
  B?.(S2, k), (t2.litHtmlVersions ??= []).push("3.3.3");
  var D = (t6, i8, s4) => {
    const e10 = s4?.renderBefore ?? i8;
    let h3 = e10._$litPart$;
    if (void 0 === h3) {
      const t7 = s4?.renderBefore ?? null;
      e10._$litPart$ = h3 = new k(i8.insertBefore(c3(), t7), t7, void 0, s4 ?? {});
    }
    return h3._$AI(t6), h3;
  };

  // ../../node_modules/lit-element/lit-element.js
  var s3 = globalThis;
  var i4 = class extends y {
    constructor() {
      super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
    }
    createRenderRoot() {
      const t6 = super.createRenderRoot();
      return this.renderOptions.renderBefore ??= t6.firstChild, t6;
    }
    update(t6) {
      const r8 = this.render();
      this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t6), this._$Do = D(r8, this.renderRoot, this.renderOptions);
    }
    connectedCallback() {
      super.connectedCallback(), this._$Do?.setConnected(true);
    }
    disconnectedCallback() {
      super.disconnectedCallback(), this._$Do?.setConnected(false);
    }
    render() {
      return E;
    }
  };
  i4._$litElement$ = true, i4["finalized"] = true, s3.litElementHydrateSupport?.({ LitElement: i4 });
  var o4 = s3.litElementPolyfillSupport;
  o4?.({ LitElement: i4 });
  (s3.litElementVersions ??= []).push("4.2.2");

  // ../../node_modules/lit-html/is-server.js
  var o5 = false;

  // ../../node_modules/lit-html/directive.js
  var t3 = { ATTRIBUTE: 1, CHILD: 2, PROPERTY: 3, BOOLEAN_ATTRIBUTE: 4, EVENT: 5, ELEMENT: 6 };
  var e4 = (t6) => (...e10) => ({ _$litDirective$: t6, values: e10 });
  var i5 = class {
    constructor(t6) {
    }
    get _$AU() {
      return this._$AM._$AU;
    }
    _$AT(t6, e10, i8) {
      this._$Ct = t6, this._$AM = e10, this._$Ci = i8;
    }
    _$AS(t6, e10) {
      return this.update(t6, e10);
    }
    update(t6, e10) {
      return this.render(...e10);
    }
  };

  // ../../node_modules/lit-html/directive-helpers.js
  var { I: t4 } = j;
  var l3 = (o10, t6) => void 0 === t6 ? void 0 !== o10?._$litType$ : o10?._$litType$ === t6;
  var r4 = (o10) => void 0 === o10.strings;
  var m2 = {};
  var p3 = (o10, t6 = m2) => o10._$AH = t6;

  // ../../node_modules/lit-html/directives/live.js
  var l4 = e4(class extends i5 {
    constructor(r8) {
      if (super(r8), r8.type !== t3.PROPERTY && r8.type !== t3.ATTRIBUTE && r8.type !== t3.BOOLEAN_ATTRIBUTE) throw Error("The `live` directive is not allowed on child or event bindings");
      if (!r4(r8)) throw Error("`live` bindings can only contain a single expression");
    }
    render(r8) {
      return r8;
    }
    update(i8, [t6]) {
      if (t6 === E || t6 === A) return t6;
      const o10 = i8.element, l6 = i8.name;
      if (i8.type === t3.PROPERTY) {
        if (t6 === o10[l6]) return E;
      } else if (i8.type === t3.BOOLEAN_ATTRIBUTE) {
        if (!!t6 === o10.hasAttribute(l6)) return E;
      } else if (i8.type === t3.ATTRIBUTE && o10.getAttribute(l6) === t6 + "") return E;
      return p3(i8), t6;
    }
  });

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.JTOY5KP3.js
  var WaClearEvent = class extends Event {
    constructor() {
      super("wa-clear", { bubbles: true, cancelable: false, composed: true });
    }
  };

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.4XYGFHPR.js
  function submitOnEnter(event, el) {
    const hasModifier = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (event.key === "Enter" && !hasModifier) {
      setTimeout(() => {
        if (!event.defaultPrevented && !event.isComposing) {
          submitForm(el);
        }
      });
    }
  }
  var submittableTags = /* @__PURE__ */ new Map([
    ["input", true],
    ["wa-input", true],
    ["wa-tag-input", true],
    ["wa-number-input", true],
    ["wa-otp-input", true],
    ["wa-slider", true]
  ]);
  var submittableTypes = /* @__PURE__ */ new Map([
    ["button", false],
    ["checkbox", false],
    ["color", false],
    ["date", false],
    ["datetime-local", false],
    ["email", true],
    ["file", false],
    ["hidden", false],
    ["image", false],
    ["month", false],
    ["number", true],
    ["password", true],
    ["radio", false],
    ["range", false],
    ["reset", true],
    ["search", true],
    ["submit", false],
    ["tel", true],
    ["text", true],
    ["time", false],
    ["url", true],
    ["week", false]
  ]);
  var isSubmittableElement = (el) => {
    const tagName = el?.localName;
    if (!tagName) {
      return false;
    }
    const isSubmittableTag = Boolean(submittableTags.get(tagName));
    if (!isSubmittableTag) {
      return false;
    }
    if (tagName !== "input" && tagName !== "wa-input") {
      return true;
    }
    const type = el.type;
    return Boolean(submittableTypes.get(type));
  };
  function submitForm(el) {
    let form = null;
    if ("form" in el) {
      form = el.form;
    }
    if (!form && "getForm" in el) {
      form = el.getForm();
    }
    if (!form) {
      return;
    }
    const formElements = Array.from(form.elements);
    let submittableFormElements = 0;
    for (const el2 of formElements) {
      if (isSubmittableElement(el2)) {
        submittableFormElements += 1;
      }
    }
    if (submittableFormElements === 1) {
      form.requestSubmit(null);
      return;
    }
    const button = formElements.find((el2) => {
      return el2.type === "submit" && !el2.matches(":disabled");
    });
    if (!button) {
      return;
    }
    if (["input", "button"].includes(button.localName)) {
      form.requestSubmit(button);
    } else {
      button.click();
    }
  }

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.3ZKPD2O5.js
  var input_styles_default = i`
  :host {
    border-width: 0;
  }

  :host(:focus) {
    outline: none;
  }

  .text-field {
    display: flex;
    align-items: stretch;
    justify-content: start;
    position: relative;
    transition: inherit;
    height: var(--wa-form-control-height);
    border-color: var(--wa-form-control-border-color);
    border-radius: var(--wa-form-control-border-radius);
    border-style: var(--wa-form-control-border-style);
    border-width: var(--wa-form-control-border-width);
    cursor: text;
    color: var(--wa-form-control-value-color);
    font-size: var(--wa-form-control-value-font-size);
    font-family: inherit;
    font-weight: var(--wa-form-control-value-font-weight);
    line-height: var(--wa-form-control-value-line-height);
    vertical-align: middle;
    width: 100%;
    transition:
      background-color var(--wa-transition-normal),
      border-color var(--wa-transition-normal),
      outline-color var(--wa-transition-fast);
    transition-timing-function: var(--wa-transition-easing);
    background-color: var(--wa-form-control-background-color);
    box-shadow: var(--box-shadow);
    padding: 0 var(--wa-form-control-padding-inline);
    outline: var(--wa-focus-ring-style) var(--wa-focus-ring-width) transparent;
    outline-offset: var(--wa-focus-ring-offset);

    /* Only ring the field when the text input has focus, not inner buttons */
    &:has(input:focus, textarea:focus) {
      outline-color: var(--wa-color-focus);
    }

    /* Style disabled inputs */
    &:has(:disabled) {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  /* Appearance modifiers */
  :host([appearance='outlined']) .text-field {
    background-color: var(--wa-form-control-background-color);
    border-color: var(--wa-form-control-border-color);
  }

  :host([appearance='filled']) .text-field {
    background-color: var(--wa-color-neutral-fill-quiet);
    border-color: var(--wa-color-neutral-fill-quiet);
  }

  :host([appearance='filled-outlined']) .text-field {
    background-color: var(--wa-color-neutral-fill-quiet);
    border-color: var(--wa-form-control-border-color);
  }

  :host([pill]) .text-field {
    border-radius: var(--wa-border-radius-pill) !important;
  }

  .text-field {
    /* Show autofill styles over the entire text field, not just the native <input> */
    &:has(:autofill),
    &:has(:-webkit-autofill) {
      background-color: var(--wa-color-brand-fill-quiet) !important;
    }

    input,
    textarea {
      /*
      Fixes an alignment issue with placeholders.
      https://github.com/shoelace-style/webawesome/issues/342
    */
      height: 100%;

      padding: 0;
      border: none;
      outline: none;
      box-shadow: none;
      margin: 0;
      cursor: inherit;
      -webkit-appearance: none;
      font: inherit;

      /* Turn off Safari's autofill styles */
      &:-webkit-autofill,
      &:-webkit-autofill:hover,
      &:-webkit-autofill:focus,
      &:-webkit-autofill:active {
        -webkit-background-clip: text;
        background-color: transparent;
        -webkit-text-fill-color: inherit;
      }
    }
  }

  input {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    transition: inherit;

    /* prettier-ignore */
    background-color: rgb(118 118 118 / 0); /* ensures proper placeholder styles in webkit's date input */
    height: calc(var(--wa-form-control-height) - var(--border-width) * 2);
    padding-block: 0;
    color: inherit;

    &:autofill {
      &,
      &:hover,
      &:focus,
      &:active {
        box-shadow: none;
        caret-color: var(--wa-form-control-value-color);
      }
    }

    &::placeholder {
      color: var(--wa-form-control-placeholder-color);
      user-select: none;
      -webkit-user-select: none;
    }

    &::-webkit-search-decoration,
    &::-webkit-search-cancel-button,
    &::-webkit-search-results-button,
    &::-webkit-search-results-decoration {
      -webkit-appearance: none;
    }

    &:focus {
      outline: none;
    }
  }

  textarea {
    &:autofill {
      &,
      &:hover,
      &:focus,
      &:active {
        box-shadow: none;
        caret-color: var(--wa-form-control-value-color);
      }
    }

    &::placeholder {
      color: var(--wa-form-control-placeholder-color);
      user-select: none;
      -webkit-user-select: none;
    }
  }

  .start,
  .end {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    cursor: default;

    &::slotted(wa-icon) {
      color: var(--wa-color-neutral-on-quiet);
    }
  }

  .start::slotted(*) {
    margin-inline-end: var(--wa-form-control-padding-inline);
  }

  .end::slotted(*) {
    margin-inline-start: var(--wa-form-control-padding-inline);
  }

  /*
   * Clearable + Password Toggle
   */

  .clear,
  .password-toggle {
    position: relative;
    display: inline-flex;
    align-self: center;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
    height: 1.5em;
    font-size: inherit;
    color: var(--wa-color-neutral-on-quiet);
    border: none;
    border-radius: var(--wa-border-radius-s);
    background: none;
    padding: 0;
    transition: var(--wa-transition-normal) color;
    cursor: pointer;
    /* The box is wider than the glyph, so overhang half of that growth on each side. Keeps the
       glyph flush with the field's trailing padding edge, like every other form control. */
    margin-inline-start: calc(var(--wa-form-control-padding-inline) - 0.125em);
    margin-inline-end: -0.125em;

    &::after {
      content: '';
      position: absolute;
      inset-inline: 0;
      height: var(--wa-form-control-height);
    }

    @media (hover: hover) {
      &:hover {
        color: color-mix(in oklab, currentColor, var(--wa-color-mix-hover));
      }
    }

    &:active {
      color: color-mix(in oklab, currentColor, var(--wa-color-mix-active));
    }

    &:focus {
      outline: none;
    }

    &:focus-visible {
      outline: var(--wa-focus-ring);
      outline-offset: var(--wa-focus-ring-offset);
    }
  }

  /* Don't show the browser's password toggle in Edge */
  ::-ms-reveal {
    display: none;
  }

  /* Hide the built-in number spinner */
  :host([without-spin-buttons]) input[type='number'] {
    -moz-appearance: textfield;

    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      -webkit-appearance: none;
      display: none;
    }
  }
`;

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.JPBXG7RE.js
  var form_control_styles_default = i`
  :host {
    display: flex;
    flex-direction: column;
  }

  /* Treat wrapped labels, inputs, and hints as direct children of the host element */
  [part~='form-control'] {
    display: contents;
  }

  /* Label */
  :is([part~='form-control-label'], [part~='label']):has(*:not(:empty)),
  :is([part~='form-control-label'], [part~='label']).has-label {
    display: inline-flex;
    color: var(--wa-form-control-label-color);
    font-weight: var(--wa-form-control-label-font-weight);
    line-height: var(--wa-form-control-label-line-height);
    margin-block-end: 0.5em;
  }

  :host([required]) :is([part~='form-control-label'], [part~='label'])::after {
    content: var(--wa-form-control-required-content);
    margin-inline-start: var(--wa-form-control-required-content-offset);
    color: var(--wa-form-control-required-content-color);
  }

  /* Help text */
  [part~='hint'] {
    display: block;
    color: var(--wa-form-control-hint-color);
    font-weight: var(--wa-form-control-hint-font-weight);
    line-height: var(--wa-form-control-hint-line-height);
    margin-block-start: 0.5em;
    font-size: var(--wa-font-size-smaller);

    &:not(.has-slotted, .has-hint, .has-count) {
      display: none;
    }
  }
`;

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.R7QX4M6R.js
  var MirrorValidator = () => {
    return {
      checkValidity(element) {
        const formControl = element.input;
        const validity = {
          message: "",
          isValid: true,
          invalidKeys: []
        };
        if (!formControl) {
          return validity;
        }
        let isValid = true;
        if ("checkValidity" in formControl) {
          isValid = formControl.checkValidity();
        }
        if (isValid) {
          return validity;
        }
        validity.isValid = false;
        if ("validationMessage" in formControl) {
          validity.message = formControl.validationMessage;
        }
        if (!("validity" in formControl)) {
          validity.invalidKeys.push("customError");
          return validity;
        }
        for (const key in formControl.validity) {
          if (key === "valid") {
            continue;
          }
          const checkedKey = key;
          if (formControl.validity[checkedKey]) {
            validity.invalidKeys.push(checkedKey);
          }
        }
        return validity;
      }
    };
  };

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.VC3BPUZJ.js
  var WaInvalidEvent = class extends Event {
    constructor() {
      super("wa-invalid", { bubbles: true, cancelable: false, composed: true });
    }
  };

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.7VGCIHDG.js
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __typeError = (msg) => {
    throw TypeError(msg);
  };
  var __decorateClass = (decorators, target, key, kind) => {
    var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
    for (var i8 = decorators.length - 1, decorator; i8 >= 0; i8--)
      if (decorator = decorators[i8])
        result = (kind ? decorator(target, key, result) : decorator(result)) || result;
    if (kind && result) __defProp(target, key, result);
    return result;
  };
  var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
  var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
  var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);

  // ../../node_modules/@lit/reactive-element/decorators/custom-element.js
  var t5 = (t6) => (e10, o10) => {
    void 0 !== o10 ? o10.addInitializer(() => {
      customElements.define(t6, e10);
    }) : customElements.define(t6, e10);
  };

  // ../../node_modules/@lit/reactive-element/decorators/property.js
  var o6 = { attribute: true, type: String, converter: u, reflect: false, hasChanged: f };
  var r5 = (t6 = o6, e10, r8) => {
    const { kind: n6, metadata: i8 } = r8;
    let s4 = globalThis.litPropertyMetadata.get(i8);
    if (void 0 === s4 && globalThis.litPropertyMetadata.set(i8, s4 = /* @__PURE__ */ new Map()), "setter" === n6 && ((t6 = Object.create(t6)).wrapped = true), s4.set(r8.name, t6), "accessor" === n6) {
      const { name: o10 } = r8;
      return { set(r9) {
        const n7 = e10.get.call(this);
        e10.set.call(this, r9), this.requestUpdate(o10, n7, t6, true, r9);
      }, init(e11) {
        return void 0 !== e11 && this.C(o10, void 0, t6, e11), e11;
      } };
    }
    if ("setter" === n6) {
      const { name: o10 } = r8;
      return function(r9) {
        const n7 = this[o10];
        e10.call(this, r9), this.requestUpdate(o10, n7, t6, true, r9);
      };
    }
    throw Error("Unsupported decorator location: " + n6);
  };
  function n4(t6) {
    return (e10, o10) => "object" == typeof o10 ? r5(t6, e10, o10) : ((t7, e11, o11) => {
      const r8 = e11.hasOwnProperty(o11);
      return e11.constructor.createProperty(o11, t7), r8 ? Object.getOwnPropertyDescriptor(e11, o11) : void 0;
    })(t6, e10, o10);
  }

  // ../../node_modules/@lit/reactive-element/decorators/state.js
  function r6(r8) {
    return n4({ ...r8, state: true, attribute: false });
  }

  // ../../node_modules/@lit/reactive-element/decorators/base.js
  var e5 = (e10, t6, c5) => (c5.configurable = true, c5.enumerable = true, Reflect.decorate && "object" != typeof t6 && Object.defineProperty(e10, t6, c5), c5);

  // ../../node_modules/@lit/reactive-element/decorators/query.js
  function e6(e10, r8) {
    return (n6, s4, i8) => {
      const o10 = (t6) => t6.renderRoot?.querySelector(e10) ?? null;
      if (r8) {
        const { get: e11, set: r9 } = "object" == typeof s4 ? n6 : i8 ?? (() => {
          const t6 = Symbol();
          return { get() {
            return this[t6];
          }, set(e12) {
            this[t6] = e12;
          } };
        })();
        return e5(n6, s4, { get() {
          let t6 = e11.call(this);
          return void 0 === t6 && (t6 = o10(this), (null !== t6 || this.hasUpdated) && r9.call(this, t6)), t6;
        } });
      }
      return e5(n6, s4, { get() {
        return o10(this);
      } });
    };
  }

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.AOKMSJXD.js
  var host_styles_default = i`
  :host {
    box-sizing: border-box;
  }

  :host *,
  :host *::before,
  :host *::after {
    box-sizing: inherit;
  }

  [hidden],
  :host([hidden]) {
    display: none !important;
  }
`;
  var HAS_ENDING_COLON = /;\s+$/;
  function camelToKebab(str) {
    return str.replace(/[A-Z]/g, (c5) => `-${c5.toLowerCase()}`);
  }
  function buildStyleAttribute(options) {
    const { property: property2, value, element } = options;
    if (value) {
      let style = element.getAttribute("style") || "";
      if (style) {
        if (!style.match(HAS_ENDING_COLON)) {
          style += ";";
        }
        style += " ";
      }
      const str = `${property2}: ${value}`;
      if (style.includes(str)) {
        return;
      }
      return `${style}${str};`;
    }
    return null;
  }
  var _hasRecordedInitialProperties;
  var WebAwesomeElement = class extends i4 {
    constructor() {
      super();
      __privateAdd(this, _hasRecordedInitialProperties, false);
      this.initialReflectedProperties = /* @__PURE__ */ new Map();
      this.didSSR = o5 || Boolean(this.shadowRoot);
      this.customStates = {
        /** Adds or removes the specified custom state. */
        set: (customState, active) => {
          if (!Boolean(this.internals?.states)) return;
          try {
            if (active) {
              this.internals.states.add(customState);
            } else {
              this.internals.states.delete(customState);
            }
          } catch (e10) {
            if (String(e10).includes("must start with '--'")) {
              console.error("Your browser implements an outdated version of CustomStateSet. Consider using a polyfill");
            } else {
              throw e10;
            }
          }
        },
        /** Determines whether or not the element currently has the specified state. */
        has: (customState) => {
          if (!Boolean(this.internals?.states)) return false;
          try {
            return this.internals.states.has(customState);
          } catch {
            return false;
          }
        }
      };
      try {
        this.internals = this.attachInternals();
      } catch {
        console.error("Element internals are not supported in your browser. Consider using a polyfill");
      }
      this.customStates.set("wa-defined", true);
      let Self = this.constructor;
      for (let [property2, spec] of Self.elementProperties) {
        if (spec.default === "inherit" && spec.initial !== void 0 && typeof property2 === "string") {
          this.customStates.set(`initial-${property2}-${spec.initial}`, true);
        }
      }
    }
    /** Prepends host styles to the component's styles. */
    static get styles() {
      const styles = Array.isArray(this.css) ? this.css : this.css ? [this.css] : [];
      return [host_styles_default, ...styles];
    }
    connectedCallback() {
      super.connectedCallback();
      if (!this.didSSR) {
        this.shadowRoot?.prepend(
          document.createComment(
            ` Web Awesome: https://webawesome.com/docs/components/${this.localName.replace("wa-", "")} `
          )
        );
      }
      if (this.didSSR) {
        this.updateComplete.then(() => {
          this.shadowRoot?.prepend(
            document.createComment(
              ` Web Awesome: https://webawesome.com/docs/components/${this.localName.replace("wa-", "")} `
            )
          );
        });
      }
    }
    attributeChangedCallback(name, oldValue, newValue) {
      if (!__privateGet(this, _hasRecordedInitialProperties)) {
        this.constructor.elementProperties.forEach(
          (obj, prop) => {
            if (obj.reflect && this[prop] != null) {
              this.initialReflectedProperties.set(prop, this[prop]);
            }
          }
        );
        __privateSet(this, _hasRecordedInitialProperties, true);
      }
      super.attributeChangedCallback(name, oldValue, newValue);
    }
    willUpdate(changedProperties) {
      super.willUpdate(changedProperties);
      this.initialReflectedProperties.forEach((value, prop) => {
        if (changedProperties.has(prop) && this[prop] == null) {
          this[prop] = value;
        }
      });
    }
    firstUpdated(changedProperties) {
      super.firstUpdated(changedProperties);
      if (this.didSSR) {
        this.shadowRoot?.querySelectorAll("slot").forEach((slotElement) => {
          slotElement.dispatchEvent(new Event("slotchange", { bubbles: true, composed: false, cancelable: false }));
        });
      }
    }
    update(changedProperties) {
      try {
        super.update(changedProperties);
      } catch (e10) {
        if (this.didSSR && !this.hasUpdated) {
          const event = new Event("lit-hydration-error", { bubbles: true, composed: true, cancelable: false });
          event.error = e10;
          this.dispatchEvent(event);
        }
        throw e10;
      }
    }
    /**
     * @internal
     * Internal way to set styles across both client and server
     */
    setStyle(property2, value) {
      if (!this.style) {
        const str = buildStyleAttribute({
          // because this is going to be serialized to an HTML style attribute, need to transform the casing.
          property: camelToKebab(property2),
          value,
          element: this
        });
        if (str) {
          this.setAttribute("style", str);
        }
        return;
      }
      this.style[property2] = value;
    }
    /**
     * @internal
     * Internal way to set a CSS custom property across both client and server.
     */
    setStyleProperty(property2, value) {
      if (!this.style) {
        const str = buildStyleAttribute({
          // because this is going to be serialized to an HTML style attribute, need to transform the casing.
          property: property2,
          value,
          element: this
        });
        if (str) {
          this.setAttribute("style", str);
        }
        return;
      }
      this.style.setProperty(property2, value);
    }
    /**
     * @internal Given a native event, this function cancels it and dispatches it again from the host element using the desired
     * event options.
     */
    relayNativeEvent(event, eventOptions) {
      event.stopImmediatePropagation();
      this.dispatchEvent(
        new event.constructor(event.type, {
          ...event,
          ...eventOptions
        })
      );
    }
  };
  _hasRecordedInitialProperties = /* @__PURE__ */ new WeakMap();
  __decorateClass([
    n4()
  ], WebAwesomeElement.prototype, "dir", 2);
  __decorateClass([
    n4()
  ], WebAwesomeElement.prototype, "lang", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true, attribute: "did-ssr" })
  ], WebAwesomeElement.prototype, "didSSR", 2);

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.KBXNFZQL.js
  var CustomErrorValidator = () => {
    return {
      observedAttributes: ["custom-error"],
      checkValidity(element) {
        const validity = {
          message: "",
          isValid: true,
          invalidKeys: []
        };
        if (element.customError) {
          validity.message = element.customError;
          validity.isValid = false;
          validity.invalidKeys = ["customError"];
        }
        return validity;
      }
    };
  };
  var WebAwesomeFormAssociatedElement = class extends WebAwesomeElement {
    constructor() {
      super();
      this.name = null;
      this.disabled = false;
      this.required = false;
      this.assumeInteractionOn = ["input"];
      this.validators = [];
      this.valueHasChanged = false;
      this.hasInteracted = false;
      this.customError = null;
      this.emittedEvents = [];
      this.emitInvalid = (e10) => {
        if (e10.target !== this) return;
        this.hasInteracted = true;
        this.dispatchEvent(new WaInvalidEvent());
      };
      this.handleInteraction = (event) => {
        const emittedEvents = this.emittedEvents;
        if (!emittedEvents.includes(event.type)) {
          emittedEvents.push(event.type);
        }
        if (emittedEvents.length === this.assumeInteractionOn?.length) {
          this.hasInteracted = true;
        }
      };
      if ("addEventListener" in this) {
        this.addEventListener("invalid", this.emitInvalid);
      }
    }
    /**
     * Validators are static because they have `observedAttributes`, essentially attributes to "watch"
     * for changes. Whenever these attributes change, we want to be notified and update the validator.
     */
    static get validators() {
      return o5 ? [] : [CustomErrorValidator()];
    }
    // Append all Validator "observedAttributes" into the "observedAttributes" so they can run.
    static get observedAttributes() {
      const parentAttrs = new Set(super.observedAttributes || []);
      for (const validator of this.validators) {
        if (!validator.observedAttributes) {
          continue;
        }
        for (const attr of validator.observedAttributes) {
          parentAttrs.add(attr);
        }
      }
      return [...parentAttrs];
    }
    connectedCallback() {
      super.connectedCallback();
      if (this.didSSR && !this.hasUpdated) {
        this.updateComplete.then(() => {
          this.updateValidity();
        });
      } else {
        this.updateValidity();
      }
      this.assumeInteractionOn.forEach((event) => {
        this.addEventListener?.(event, this.handleInteraction);
      });
    }
    firstUpdated(...args) {
      super.firstUpdated(...args);
      this.updateValidity();
    }
    willUpdate(changedProperties) {
      if (!o5 && changedProperties.has("customError")) {
        if (!this.customError) {
          this.customError = null;
        }
        this.setCustomValidity(this.customError || "");
      }
      if (changedProperties.has("value") || changedProperties.has("disabled") || changedProperties.has("defaultValue")) {
        const value = this.value;
        this.updateFormValue(value);
      }
      if (changedProperties.has("disabled")) {
        this.customStates.set("disabled", this.disabled);
        if (this.hasAttribute("disabled") || !o5 && !this.matches(":disabled")) {
          this.toggleAttribute("disabled", this.disabled);
        }
      }
      super.willUpdate(changedProperties);
      if (this.didSSR && !this.hasUpdated) {
        this.updateComplete.then(() => this.updateValidity());
      } else {
        this.updateValidity();
      }
    }
    /**
     * @internal
     */
    updateFormValue(value) {
      if (Array.isArray(value)) {
        if (this.name) {
          const formData = new FormData();
          for (const val of value) {
            formData.append(this.name, val);
          }
          this.setValue(formData, formData);
        }
      } else {
        this.setValue(value, value);
      }
    }
    get labels() {
      return this.internals.labels;
    }
    getForm() {
      return this.internals.form;
    }
    /**
     * By default, form controls are associated with the nearest containing `<form>` element. This attribute allows you
     * to place the form control outside of a form and associate it with the form that has this `id`. The form must be in
     * the same document or shadow root for this to work.
     */
    set form(val) {
      if (val) {
        this.setAttribute("form", val);
      } else {
        this.removeAttribute("form");
      }
    }
    get form() {
      return this.internals.form;
    }
    get validity() {
      return this.internals.validity;
    }
    // Not sure if this supports `novalidate`. Will need to test.
    get willValidate() {
      return this.internals.willValidate;
    }
    get validationMessage() {
      return this.internals.validationMessage;
    }
    checkValidity() {
      this.updateValidity();
      return this.internals.checkValidity();
    }
    reportValidity() {
      this.updateValidity();
      this.hasInteracted = true;
      return this.internals.reportValidity();
    }
    /**
     * Override this to change where constraint validation popups are anchored.
     */
    get validationTarget() {
      return this.input || void 0;
    }
    setValidity(...args) {
      const flags = args[0];
      const message = args[1];
      let anchor = args[2];
      if (!anchor) {
        anchor = this.validationTarget;
      }
      this.internals.setValidity(flags, message, anchor || void 0);
      this.requestUpdate("validity");
      this.setCustomStates();
    }
    setCustomStates() {
      const required = Boolean(this.required);
      const isValid = this.internals.validity.valid;
      const hasInteracted = this.hasInteracted;
      this.customStates.set("required", required);
      this.customStates.set("optional", !required);
      this.customStates.set("invalid", !isValid);
      this.customStates.set("valid", isValid);
      this.customStates.set("user-invalid", !isValid && hasInteracted);
      this.customStates.set("user-valid", isValid && hasInteracted);
    }
    /**
     * Do not use this when creating a "Validator". This is intended for end users of components.
     * We track manually defined custom errors so we don't clear them on accident in our validators.
     *
     */
    setCustomValidity(message) {
      if (!message) {
        this.customError = null;
        this.setValidity({});
        return;
      }
      this.customError = message;
      this.setValidity({ customError: true }, message, this.validationTarget);
    }
    formResetCallback() {
      this.resetValidity();
      this.hasInteracted = false;
      this.valueHasChanged = false;
      this.emittedEvents = [];
      this.updateValidity();
    }
    formDisabledCallback(isDisabled) {
      this.disabled = isDisabled;
      this.updateValidity();
    }
    /**
     * Called when the browser is trying to restore element’s state to state in which case reason is "restore", or when
     * the browser is trying to fulfill autofill on behalf of user in which case reason is "autocomplete". In the case of
     * "restore", state is a string, File, or FormData object previously set as the second argument to setFormValue.
     */
    formStateRestoreCallback(state, reason) {
      if (this.didSSR && !this.hasUpdated) {
        this.updateComplete.then(() => {
          this.value = state;
          if (reason === "restore") {
            this.resetValidity();
          }
          this.updateValidity();
        });
      } else {
        this.value = state;
        if (reason === "restore") {
          this.resetValidity();
        }
        this.updateValidity();
      }
    }
    setValue(...args) {
      const [value, state] = args;
      this.internals.setFormValue(value, state);
    }
    get allValidators() {
      const staticValidators = this.constructor.validators || [];
      const validators = this.validators || [];
      return [...staticValidators, ...validators];
    }
    /**
     * Reset validity is a way of removing manual custom errors and native validation.
     */
    resetValidity() {
      this.setCustomValidity("");
      this.setValidity({});
    }
    updateValidity() {
      if (this.disabled || this.hasAttribute("disabled") || !this.willValidate) {
        this.resetValidity();
        return;
      }
      const validators = this.allValidators;
      if (!validators?.length) {
        return;
      }
      const flags = {
        // Don't trust custom errors from the Browser. Safari breaks the spec.
        customError: Boolean(this.customError)
      };
      const formControl = this.validationTarget || this.input || void 0;
      let finalMessage = "";
      for (const validator of validators) {
        const { isValid, message, invalidKeys } = validator.checkValidity(this);
        if (isValid) {
          continue;
        }
        if (!finalMessage) {
          finalMessage = message;
        }
        if (invalidKeys?.length >= 0) {
          invalidKeys.forEach((str) => flags[str] = true);
        }
      }
      if (!finalMessage) {
        finalMessage = this.validationMessage;
      }
      this.setValidity(flags, finalMessage, formControl);
    }
  };
  WebAwesomeFormAssociatedElement.formAssociated = true;
  __decorateClass([
    n4({ reflect: true })
  ], WebAwesomeFormAssociatedElement.prototype, "name", 2);
  __decorateClass([
    n4({ type: Boolean })
  ], WebAwesomeFormAssociatedElement.prototype, "disabled", 2);
  __decorateClass([
    n4({ state: true, attribute: false })
  ], WebAwesomeFormAssociatedElement.prototype, "valueHasChanged", 2);
  __decorateClass([
    n4({ state: true, attribute: false })
  ], WebAwesomeFormAssociatedElement.prototype, "hasInteracted", 2);
  __decorateClass([
    n4({ attribute: "custom-error", reflect: true })
  ], WebAwesomeFormAssociatedElement.prototype, "customError", 2);
  __decorateClass([
    n4({ attribute: false, state: true, type: Object })
  ], WebAwesomeFormAssociatedElement.prototype, "validity", 1);

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.RPQJAXXR.js
  var DEPRECATION_MAP = {
    small: "s",
    medium: "m",
    large: "l"
  };
  var warned = /* @__PURE__ */ new Set();
  function warnDeprecatedSize(tagName, value) {
    if (value in DEPRECATION_MAP && !warned.has(`${tagName}:${value}`)) {
      warned.add(`${tagName}:${value}`);
      console.warn(
        `[${tagName}] size="${value}" is deprecated. Use size="${DEPRECATION_MAP[value]}" instead. The long-form value will be removed in the next major version.`
      );
    }
  }

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.RWNXKUCF.js
  var HasSlotController = class {
    constructor(host, ...slotNames) {
      this.slotNames = [];
      this.handleSlotChange = (event) => {
        const slot = event.target;
        if (this.slotNames.includes("[default]") && !slot.name || slot.name && this.slotNames.includes(slot.name)) {
          this.host.requestUpdate();
        }
      };
      (this.host = host).addController(this);
      this.slotNames = slotNames;
    }
    hasDefaultSlot() {
      if (!this.host.childNodes) {
        return false;
      }
      return [...this.host.childNodes].some((node) => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== "") {
          return true;
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node;
          const tagName = el.tagName.toLowerCase();
          if (tagName === "wa-visually-hidden") {
            return false;
          }
          if (!el.hasAttribute("slot")) {
            return true;
          }
        }
        return false;
      });
    }
    hasNamedSlot(name) {
      return this.host.querySelector?.(`:scope > [slot="${name}"]`) !== null;
    }
    /**
     * @param slotName     - Name of the slot to look for
     * @param propertyName - Generally we infer via `withHeader` property on the host, but in cases where its different, you can specify a manual property name.
     */
    test(slotName, propertyName) {
      if (propertyName && this.host.didSSR && !this.host.hasUpdated) {
        return Boolean(this.host[propertyName]);
      }
      return slotName === "[default]" ? this.hasDefaultSlot() : this.hasNamedSlot(slotName);
    }
    hostConnected() {
      const shadowRoot = this.host.shadowRoot;
      if (shadowRoot && "addEventListener" in shadowRoot) {
        shadowRoot.addEventListener("slotchange", this.handleSlotChange);
      }
    }
    hostDisconnected() {
      const shadowRoot = this.host.shadowRoot;
      if (shadowRoot && "removeEventListener" in shadowRoot) {
        shadowRoot.removeEventListener("slotchange", this.handleSlotChange);
      }
    }
  };

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.G5ZZIGWB.js
  var size_styles_default = i`
  :host([size='xs']) {
    font-size: var(--wa-font-size-xs);
  }

  :host([size='s']),
  :host([size='small']) {
    font-size: var(--wa-font-size-s);
  }

  :host([size='m']),
  :host([size='medium']) {
    font-size: var(--wa-font-size-m);
  }

  :host([size='l']),
  :host([size='large']) {
    font-size: var(--wa-font-size-l);
  }

  :host([size='xl']) {
    font-size: var(--wa-font-size-xl);
  }
`;

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.PZAN6FPN.js
  function watch(propertyName, options) {
    const resolvedOptions = {
      waitUntilFirstUpdate: false,
      ...options
    };
    return (proto, decoratedFnName) => {
      const { update: update2 } = proto;
      const watchedProperties = Array.isArray(propertyName) ? propertyName : [propertyName];
      proto.update = function(changedProps) {
        watchedProperties.forEach((property) => {
          const key = property;
          if (changedProps.has(key)) {
            const oldValue = changedProps.get(key);
            const newValue = this[key];
            if (oldValue !== newValue) {
              if (!resolvedOptions.waitUntilFirstUpdate || this.hasUpdated) {
                this[decoratedFnName](oldValue, newValue);
              }
            }
          }
        });
        update2.call(this, changedProps);
      };
    };
  }

  // ../../node_modules/@shoelace-style/localize/dist/index.js
  var connectedElements = /* @__PURE__ */ new Set();
  var translations = /* @__PURE__ */ new Map();
  var fallback;
  var documentDirection = "ltr";
  var documentLanguage = "en";
  var isClient = typeof MutationObserver !== "undefined" && typeof document !== "undefined" && typeof document.documentElement !== "undefined";
  if (isClient) {
    const documentElementObserver = new MutationObserver(update);
    documentDirection = document.documentElement.dir || "ltr";
    documentLanguage = document.documentElement.lang || navigator.language;
    documentElementObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["dir", "lang"]
    });
  }
  function registerTranslation(...translation2) {
    translation2.map((t6) => {
      const code = t6.$code.toLowerCase();
      if (translations.has(code)) {
        translations.set(code, Object.assign(Object.assign({}, translations.get(code)), t6));
      } else {
        translations.set(code, t6);
      }
      if (!fallback) {
        fallback = t6;
      }
    });
    update();
  }
  function update() {
    if (isClient) {
      documentDirection = document.documentElement.dir || "ltr";
      documentLanguage = document.documentElement.lang || navigator.language;
    }
    [...connectedElements.keys()].map((el) => {
      if (typeof el.requestUpdate === "function") {
        el.requestUpdate();
      }
    });
  }
  var LocalizeController = class {
    constructor(host) {
      this.host = host;
      this.host.addController(this);
    }
    hostConnected() {
      connectedElements.add(this.host);
    }
    hostDisconnected() {
      connectedElements.delete(this.host);
    }
    dir() {
      return `${this.host.dir || documentDirection}`.toLowerCase();
    }
    lang() {
      const lang = `${this.host.lang || documentLanguage}`.toLowerCase().replace(/_/g, "-");
      try {
        new Intl.Locale(lang);
        return lang;
      } catch (_a) {
        return fallback ? fallback.$code.toLowerCase() : "en";
      }
    }
    getTranslationData(lang) {
      var _a, _b;
      let locale;
      try {
        locale = new Intl.Locale(lang.replace(/_/g, "-"));
      } catch (_c) {
        return { locale: void 0, language: "", region: "", primary: void 0, secondary: void 0 };
      }
      const language = locale.language.toLowerCase();
      const region = (_b = (_a = locale.region) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== null && _b !== void 0 ? _b : "";
      const primary = translations.get(`${language}-${region}`);
      const secondary = translations.get(language);
      return { locale, language, region, primary, secondary };
    }
    exists(key, options) {
      var _a;
      const { primary, secondary } = this.getTranslationData((_a = options.lang) !== null && _a !== void 0 ? _a : this.lang());
      options = Object.assign({ includeFallback: false }, options);
      if (primary && primary[key] || secondary && secondary[key] || options.includeFallback && fallback && fallback[key]) {
        return true;
      }
      return false;
    }
    term(key, ...args) {
      const { primary, secondary } = this.getTranslationData(this.lang());
      let term;
      if (primary && primary[key]) {
        term = primary[key];
      } else if (secondary && secondary[key]) {
        term = secondary[key];
      } else if (fallback && fallback[key]) {
        term = fallback[key];
      } else {
        console.error(`No translation found for: ${String(key)}`);
        return String(key);
      }
      if (typeof term === "function") {
        return term(...args);
      }
      return term;
    }
    date(dateToFormat, options) {
      dateToFormat = new Date(dateToFormat);
      return new Intl.DateTimeFormat(this.lang(), options).format(dateToFormat);
    }
    number(numberToFormat, options) {
      numberToFormat = Number(numberToFormat);
      return isNaN(numberToFormat) ? "" : new Intl.NumberFormat(this.lang(), options).format(numberToFormat);
    }
    relativeTime(value, unit, options) {
      return new Intl.RelativeTimeFormat(this.lang(), options).format(value, unit);
    }
  };

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.M45NRQFW.js
  var translation = {
    $code: "en",
    $name: "English",
    $dir: "ltr",
    allTagsRemoved: "All tags removed",
    am: "AM",
    autosizeColumn: "Autosize column",
    captions: "Captions",
    carousel: "Carousel",
    chooseDate: "Choose date",
    chooseDecade: "Choose decade",
    chooseMonth: "Choose month",
    chooseTime: "Choose time",
    chooseYear: "Choose year",
    clearEntry: "Clear entry",
    clearFilter: "Clear filter",
    clearSort: "Clear sort",
    close: "Close",
    closeCalendar: "Close calendar",
    closeTimeInput: "Close time picker",
    collapseRow: "Collapse row",
    columnMenu: "Column options",
    columnMovedToPosition: (label, position, total) => `${label} moved to position ${position} of ${total}`,
    columns: "Columns",
    compactPageXOfY: (page, total) => `${page} of ${total}`,
    completed: "Completed",
    copied: "Copied",
    copy: "Copy",
    createOption: (value) => `Create "${value}"`,
    currentlyPlaying: "currently playing",
    currentValue: "Current value",
    date: "Date",
    datePickerKeyboardHelp: "Use arrow keys to change values; press Alt+Down Arrow to open the calendar.",
    day: "Day",
    dayPeriod: "AM/PM",
    decrement: "Decrement",
    deselectAllRows: "Deselect all rows",
    disabled: "Disabled",
    dropFileHere: "Drop file here or click to browse",
    dropFilesHere: "Drop files here or click to browse",
    empty: "Empty",
    endDate: "End date",
    enterFullscreen: "Enter fullscreen",
    error: "Error",
    exitFullscreen: "Exit fullscreen",
    expandRow: "Expand row",
    filterByColumn: (label) => `Filter by ${label}`,
    filterFrom: "From",
    filterMax: "Max",
    filterMin: "Min",
    filterTo: "To",
    firstPage: "First page",
    goToSlide: (slide, count) => `Go to slide ${slide} of ${count}`,
    hideColumn: "Hide column",
    hidePassword: "Hide password",
    hour: "Hour",
    incompleteDate: "Enter a valid date.",
    increment: "Increment",
    jumpBackwardX: (count) => `Jump back ${count} pages`,
    jumpForwardX: (count) => `Jump forward ${count} pages`,
    lastPage: "Last page",
    loading: "Loading",
    locked: "Locked",
    minute: "Minute",
    month: "Month",
    moreOptions: "More Options",
    mute: "Mute",
    nextDecade: "Next decade",
    nextMonth: "Next month",
    nextPage: "Next page",
    nextSlide: "Next slide",
    nextVideo: "Next Video",
    nextYear: "Next year",
    noData: "No data",
    noOptions: "No options",
    noResults: "No matching results",
    notCompleted: "Not completed",
    now: "Now",
    numCharacters: (num) => {
      if (num === 1) return "1 character";
      return `${num} characters`;
    },
    numCharactersRemaining: (num) => {
      if (num === 1) return "1 character remaining";
      return `${num} characters remaining`;
    },
    numOptionsAvailable: (num) => {
      if (num === 0) return "No options available";
      if (num === 1) return "1 option available";
      return `${num} options available`;
    },
    numOptionsSelected: (num) => {
      if (num === 0) return "No options selected";
      if (num === 1) return "1 option selected";
      return `${num} options selected`;
    },
    numRowsCopied: (num) => num === 1 ? "1 row copied" : `${num} rows copied`,
    numRowsSelected: (num) => num === 1 ? "1 row selected" : `${num} rows selected`,
    optionPosition: (label, position, total) => `${label}, ${position} of ${total}`,
    optionsLoadError: "Options could not be loaded",
    pageXOfY: (page, total) => `Page ${page} of ${total}`,
    pagination: "Pagination",
    pause: "Pause",
    pauseAnimation: "Pause animation",
    pictureInPicture: "Picture in picture",
    pinLeft: "Pin left",
    pinRight: "Pin right",
    play: "Play",
    playAnimation: "Play animation",
    playbackSpeed: "Playback speed",
    playlist: "Playlist",
    pm: "PM",
    previousDecade: "Previous decade",
    previousMonth: "Previous month",
    previousPage: "Previous page",
    previousSlide: "Previous slide",
    previousVideo: "Previous video",
    previousYear: "Previous year",
    progress: "Progress",
    rangeTooLong: (max2) => {
      if (max2 === 1) return "Select a range no longer than 1 day";
      return `Select a range no longer than ${max2} days`;
    },
    rangeTooShort: (min2) => {
      if (min2 === 1) return "Select a range at least 1 day long";
      return `Select a range at least ${min2} days long`;
    },
    readonly: "Read-only",
    remove: "Remove",
    resetColumns: "Reset columns",
    resize: "Resize",
    resizeColumn: "Resize column",
    rowsPerPage: "Rows per page",
    scrollableRegion: "Scrollable region",
    scrollToEnd: "Scroll to end",
    scrollToStart: "Scroll to start",
    search: "Search",
    second: "Second",
    seek: "Seek",
    seekProgress: (current, duration) => `${current} of ${duration}`,
    selectAColorFromTheScreen: "Select a color from the screen",
    selectAllRows: "Select all rows",
    selected: "Selected",
    selectedDateLabel: (date) => `Selected: ${date}`,
    selectedRangeLabel: (range) => `Selected range: ${range}`,
    selectGroup: "Select group",
    selectionCleared: "Selection cleared",
    selectRow: "Select row",
    showingNofMRows: (shown, total) => `Showing ${shown} of ${total} rows`,
    showingXtoYofZ: (start, end, total) => `${start}\u2013${end} of ${total}`,
    showPassword: "Show password",
    slideNum: (slide) => `Slide ${slide}`,
    sortAscending: "Sort ascending",
    sortColumn: "Sort column",
    sortDescending: "Sort descending",
    startDate: "Start date",
    steps: "Steps",
    stepXOfY: (step, total) => `Step ${step} of ${total}`,
    tagAdded: (tag) => `${tag} added`,
    tagAlreadyAdded: (tag) => `${tag} is already added`,
    tagInputKeyboardHelp: "Press Backspace or Delete to remove this tag.",
    tagRemoved: (tag) => `${tag} removed`,
    time: "Time",
    timeInputKeyboardHelp: "Use arrow keys to change values; press Alt+Down Arrow to open the time picker.",
    today: "Today",
    toggleColorFormat: "Toggle color format",
    tooFewTags: (min2) => min2 === 1 ? "Add at least 1 tag" : `Add at least ${min2} tags`,
    tooManyTags: (max2) => max2 === 1 ? "Add no more than 1 tag" : `Add no more than ${max2} tags`,
    unmute: "Unmute",
    unpin: "Unpin",
    unpinColumn: "Unpin column",
    videoPlayer: "Video player",
    volume: "Volume",
    year: "Year",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out"
  };
  registerTranslation(translation);
  var en_default = translation;

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.S67PIWQL.js
  var LocalizeController2 = class extends LocalizeController {
    lang() {
      if (this.host.didSSR && !this.host.hasUpdated) {
        return this.host.lang || "en";
      }
      return super.lang();
    }
  };
  registerTranslation(en_default);

  // ../../node_modules/lit-html/directives/class-map.js
  var e7 = e4(class extends i5 {
    constructor(t6) {
      if (super(t6), t6.type !== t3.ATTRIBUTE || "class" !== t6.name || t6.strings?.length > 2) throw Error("`classMap()` can only be used in the `class` attribute and must be the only part in the attribute.");
    }
    render(t6) {
      return " " + Object.keys(t6).filter((s4) => t6[s4]).join(" ") + " ";
    }
    update(s4, [i8]) {
      if (void 0 === this.st) {
        this.st = /* @__PURE__ */ new Set(), void 0 !== s4.strings && (this.nt = new Set(s4.strings.join(" ").split(/\s/).filter((t6) => "" !== t6)));
        for (const t6 in i8) i8[t6] && !this.nt?.has(t6) && this.st.add(t6);
        return this.render(i8);
      }
      const r8 = s4.element.classList;
      for (const t6 of this.st) t6 in i8 || (r8.remove(t6), this.st.delete(t6));
      for (const t6 in i8) {
        const s5 = !!i8[t6];
        s5 === this.st.has(t6) || this.nt?.has(t6) || (s5 ? (r8.add(t6), this.st.add(t6)) : (r8.remove(t6), this.st.delete(t6)));
      }
      return E;
    }
  });

  // ../../node_modules/lit-html/directives/if-defined.js
  var o7 = (o10) => o10 ?? A;

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.R6M2PXD4.js
  var WaInput = class extends WebAwesomeFormAssociatedElement {
    constructor() {
      super(...arguments);
      this.assumeInteractionOn = ["blur", "input"];
      this.hasSlotController = new HasSlotController(this, "hint", "label");
      this.localize = new LocalizeController2(this);
      this.title = "";
      this.type = "text";
      this._value = null;
      this.defaultValue = this.getAttribute("value") || null;
      this.size = "m";
      this.appearance = "outlined";
      this.pill = false;
      this.label = "";
      this.hint = "";
      this.withClear = false;
      this.placeholder = "";
      this.readonly = false;
      this.passwordToggle = false;
      this.passwordVisible = false;
      this.withoutSpinButtons = false;
      this.required = false;
      this.spellcheck = true;
      this.withLabel = false;
      this.withHint = false;
    }
    static get validators() {
      return o5 ? [] : [...super.validators, MirrorValidator()];
    }
    /** The current value of the input, submitted as a name/value pair with form data. */
    get value() {
      if (this.valueHasChanged) {
        return this._value;
      }
      return this._value ?? this.defaultValue;
    }
    set value(val) {
      if (this._value === val) {
        return;
      }
      this.valueHasChanged = true;
      this._value = val;
    }
    /**
     * @internal
     */
    updateFormValue(value) {
      if (value == null) {
        this.setValue("", null);
        return;
      }
      super.updateFormValue(value);
    }
    handleSizeChange() {
      warnDeprecatedSize(this.localName, this.size);
    }
    handleChange(event) {
      this.value = this.input.value;
      this.relayNativeEvent(event, { bubbles: true, composed: true });
    }
    handleClearClick(event) {
      event.preventDefault();
      if (this.value !== "") {
        this.value = "";
        this.updateComplete.then(() => {
          this.dispatchEvent(new WaClearEvent());
          this.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
          this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        });
      }
      this.input.focus();
    }
    handleInput() {
      this.value = this.input.value;
    }
    handleKeyDown(event) {
      submitOnEnter(event, this);
    }
    handlePasswordToggle() {
      this.passwordVisible = !this.passwordVisible;
    }
    updated(changedProperties) {
      super.updated(changedProperties);
      if (changedProperties.has("value") || changedProperties.has("defaultValue") || changedProperties.has("type")) {
        const sanitizingTypes = ["number", "date", "time", "datetime-local"];
        if (this.input && sanitizingTypes.includes(this.type) && this.value && this.input.value !== this.value) {
          this._value = this.input.value;
        }
        this.customStates.set("blank", !this.value);
        this.updateValidity();
      }
    }
    handleStepChange() {
      this.input.step = String(this.step);
      this.updateValidity();
    }
    /** Sets focus on the input. */
    focus(options) {
      this.input.focus(options);
    }
    /** Removes focus from the input. */
    blur() {
      this.input.blur();
    }
    /** Selects all the text in the input. */
    select() {
      this.input.select();
    }
    /** Sets the start and end positions of the text selection (0-based). */
    setSelectionRange(selectionStart, selectionEnd, selectionDirection = "none") {
      this.input.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
    }
    /** Replaces a range of text with a new string. */
    setRangeText(replacement, start, end, selectMode = "preserve") {
      const selectionStart = start ?? this.input.selectionStart;
      const selectionEnd = end ?? this.input.selectionEnd;
      this.input.setRangeText(replacement, selectionStart, selectionEnd, selectMode);
      if (this.value !== this.input.value) {
        this.value = this.input.value;
      }
    }
    /** Displays the browser picker for an input element (only works if the browser supports it for the input type). */
    showPicker() {
      if ("showPicker" in HTMLInputElement.prototype) {
        this.input.showPicker();
      }
    }
    /** Increments the value of a numeric input type by the value of the step attribute. */
    stepUp() {
      this.input.stepUp();
      if (this.value !== this.input.value) {
        this.value = this.input.value;
      }
    }
    /** Decrements the value of a numeric input type by the value of the step attribute. */
    stepDown() {
      this.input.stepDown();
      if (this.value !== this.input.value) {
        this.value = this.input.value;
      }
    }
    formResetCallback() {
      this.value = null;
      if (this.input) {
        this.input.value = this.value;
      }
      super.formResetCallback();
    }
    render() {
      const hasLabelSlot = this.hasSlotController.test("label", "withLabel");
      const hasHintSlot = this.hasSlotController.test("hint", "withHint");
      const hasLabel = this.label ? true : !!hasLabelSlot;
      const hasHint = this.hint ? true : !!hasHintSlot;
      const hasClearIcon = this.withClear && !this.disabled && !this.readonly;
      const isClearIconVisible = (
        // prevents hydration mismatch errors.
        (!this.didSSR || this.hasUpdated) && hasClearIcon && (typeof this.value === "number" || this.value && this.value.length > 0)
      );
      return b2`
      <label
        part="form-control-label label"
        class=${e7({
        label: true,
        "has-label": hasLabel
      })}
        for="input"
        aria-hidden=${hasLabel ? "false" : "true"}
      >
        <slot name="label">${this.label}</slot>
      </label>

      <div part="base input-wrapper" class="text-field">
        <slot name="start" part="start" class="start"></slot>

        <input
          part="input"
          id="input"
          class="control"
          type=${this.type === "password" && this.passwordVisible ? "text" : this.type}
          title=${this.title}
          name=${o7(this.name)}
          ?disabled=${this.disabled}
          ?readonly=${this.readonly}
          ?required=${this.required}
          placeholder=${o7(this.placeholder)}
          minlength=${o7(this.minlength)}
          maxlength=${o7(this.maxlength)}
          min=${o7(this.min)}
          max=${o7(this.max)}
          step=${o7(this.step)}
          .value=${l4(this.value ?? "")}
          autocapitalize=${o7(this.autocapitalize)}
          autocomplete=${o7(this.autocomplete)}
          autocorrect=${this.autocorrect ? "on" : "off"}
          ?autofocus=${this.autofocus}
          spellcheck=${this.spellcheck}
          pattern=${o7(this.pattern)}
          enterkeyhint=${o7(this.enterkeyhint)}
          inputmode=${o7(this.inputmode)}
          aria-describedby="hint"
          @change=${this.handleChange}
          @input=${this.handleInput}
          @keydown=${this.handleKeyDown}
        />

        ${isClearIconVisible ? b2`
              <button
                part="clear-button"
                class="clear"
                type="button"
                aria-label=${this.localize.term("clearEntry")}
                @click=${this.handleClearClick}
                tabindex="-1"
              >
                <slot name="clear-icon">
                  <wa-icon name="circle-xmark" library="system" variant="regular"></wa-icon>
                </slot>
              </button>
            ` : ""}
        ${this.passwordToggle && !this.disabled ? b2`
              <button
                part="password-toggle-button"
                class="password-toggle"
                type="button"
                aria-label=${this.localize.term(this.passwordVisible ? "hidePassword" : "showPassword")}
                @click=${this.handlePasswordToggle}
              >
                ${!this.passwordVisible ? b2`
                      <slot name="show-password-icon">
                        <wa-icon name="eye" library="system" variant="regular"></wa-icon>
                      </slot>
                    ` : b2`
                      <slot name="hide-password-icon">
                        <wa-icon name="eye-slash" library="system" variant="regular"></wa-icon>
                      </slot>
                    `}
              </button>
            ` : ""}

        <slot name="end" part="end" class="end"></slot>
      </div>

      <slot
        id="hint"
        part="hint"
        name="hint"
        class=${e7({
        "has-slotted": hasHint
      })}
        aria-hidden=${hasHint ? "false" : "true"}
        >${this.hint}</slot
      >
    `;
    }
  };
  WaInput.css = [size_styles_default, form_control_styles_default, input_styles_default];
  WaInput.shadowRootOptions = { ...WebAwesomeFormAssociatedElement.shadowRootOptions, delegatesFocus: true };
  __decorateClass([
    e6("input")
  ], WaInput.prototype, "input", 2);
  __decorateClass([
    n4()
  ], WaInput.prototype, "title", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaInput.prototype, "type", 2);
  __decorateClass([
    r6()
  ], WaInput.prototype, "value", 1);
  __decorateClass([
    n4({ attribute: "value", reflect: true })
  ], WaInput.prototype, "defaultValue", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaInput.prototype, "size", 2);
  __decorateClass([
    watch("size")
  ], WaInput.prototype, "handleSizeChange", 1);
  __decorateClass([
    n4({ reflect: true })
  ], WaInput.prototype, "appearance", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaInput.prototype, "pill", 2);
  __decorateClass([
    n4()
  ], WaInput.prototype, "label", 2);
  __decorateClass([
    n4({ attribute: "hint" })
  ], WaInput.prototype, "hint", 2);
  __decorateClass([
    n4({ attribute: "with-clear", type: Boolean })
  ], WaInput.prototype, "withClear", 2);
  __decorateClass([
    n4()
  ], WaInput.prototype, "placeholder", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaInput.prototype, "readonly", 2);
  __decorateClass([
    n4({ attribute: "password-toggle", type: Boolean })
  ], WaInput.prototype, "passwordToggle", 2);
  __decorateClass([
    n4({ attribute: "password-visible", type: Boolean })
  ], WaInput.prototype, "passwordVisible", 2);
  __decorateClass([
    n4({ attribute: "without-spin-buttons", type: Boolean, reflect: true })
  ], WaInput.prototype, "withoutSpinButtons", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaInput.prototype, "required", 2);
  __decorateClass([
    n4()
  ], WaInput.prototype, "pattern", 2);
  __decorateClass([
    n4({ type: Number })
  ], WaInput.prototype, "minlength", 2);
  __decorateClass([
    n4({ type: Number })
  ], WaInput.prototype, "maxlength", 2);
  __decorateClass([
    n4()
  ], WaInput.prototype, "min", 2);
  __decorateClass([
    n4()
  ], WaInput.prototype, "max", 2);
  __decorateClass([
    n4()
  ], WaInput.prototype, "step", 2);
  __decorateClass([
    n4()
  ], WaInput.prototype, "autocapitalize", 2);
  __decorateClass([
    n4({
      type: Boolean,
      converter: {
        fromAttribute: (value) => !value || value === "off" ? false : true,
        toAttribute: (value) => value ? "on" : "off"
      }
    })
  ], WaInput.prototype, "autocorrect", 2);
  __decorateClass([
    n4()
  ], WaInput.prototype, "autocomplete", 2);
  __decorateClass([
    n4({ type: Boolean })
  ], WaInput.prototype, "autofocus", 2);
  __decorateClass([
    n4()
  ], WaInput.prototype, "enterkeyhint", 2);
  __decorateClass([
    n4({
      type: Boolean,
      converter: {
        // Allow "true|false" attribute values but keep the property boolean
        fromAttribute: (value) => !value || value === "false" ? false : true,
        toAttribute: (value) => value ? "true" : "false"
      }
    })
  ], WaInput.prototype, "spellcheck", 2);
  __decorateClass([
    n4()
  ], WaInput.prototype, "inputmode", 2);
  __decorateClass([
    n4({ attribute: "with-label", type: Boolean })
  ], WaInput.prototype, "withLabel", 2);
  __decorateClass([
    n4({ attribute: "with-hint", type: Boolean })
  ], WaInput.prototype, "withHint", 2);
  __decorateClass([
    watch("step", { waitUntilFirstUpdate: true })
  ], WaInput.prototype, "handleStepChange", 1);
  WaInput = __decorateClass([
    t5("wa-input")
  ], WaInput);
  WaInput.disableWarning?.("change-in-update");

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.YDQCS2HK.js
  var WaErrorEvent = class extends Event {
    constructor() {
      super("wa-error", { bubbles: true, cancelable: false, composed: true });
    }
  };

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.WDIIGUNP.js
  var WaLoadEvent = class extends Event {
    constructor() {
      super("wa-load", { bubbles: true, cancelable: false, composed: true });
    }
  };

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.O74G5RVH.js
  var icon_styles_default = i`
  :host {
    --primary-color: currentColor;
    --primary-opacity: 1;
    --secondary-color: currentColor;
    --secondary-opacity: 0.4;
    --rotate-angle: 0deg;

    box-sizing: content-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    vertical-align: -0.125em;
  }

  /* #region Canvas — the box the icon is centered within (mirrors Font Awesome's icon canvas). Orthogonal to font-size. */

  /* Fixed width (default): 1.25em × 1em (20 × 16px) */
  :host(:not([canvas])),
  :host([canvas='fixed']) {
    width: 1.25em;
    height: 1em;
    min-width: 1.25em; /* <-- this is what Safari respects for intrinsic */
    min-height: 1em;
  }

  /* Auto: hug the icon's width. \`auto-width\` is the deprecated alias for canvas="auto". */
  :host([canvas='auto']),
  :host([auto-width]:not([canvas])) {
    width: auto;
    height: 1em;
  }

  /* Square: 1.25em × 1.25em (20 × 20px) */
  :host([canvas='square']) {
    width: 1.25em;
    height: 1.25em;
    min-width: 1.25em;
    min-height: 1.25em;
  }

  /* Roomy: 1.5em × 1.5em (24 × 24px) */
  :host([canvas='roomy']) {
    width: 1.5em;
    height: 1.5em;
    min-width: 1.5em;
    min-height: 1.5em;
  }

  /* #endregion */

  svg {
    /* NOTE: Avoid setting fill here. A stylesheet rule beats SVG presentation attributes, breaking stroke-based
       libraries like Lucide (fill="none" stroke="currentColor") and attribute-based mutators (issue #1733). The default
       library applies fill="currentColor" in its mutator instead. */
    height: 1em;
    overflow: visible;
    width: auto;

    /* Duotone colors with path-specific opacity fallback */
    path[data-duotone-primary] {
      color: var(--primary-color);
      opacity: var(--path-opacity, var(--primary-opacity));
    }

    path[data-duotone-secondary] {
      color: var(--secondary-color);
      opacity: var(--path-opacity, var(--secondary-opacity));
    }
  }

  /* Rotation */
  :host([rotate]) {
    transform: rotate(var(--rotate-angle, 0deg));
  }

  /* Flipping */
  :host([flip='x']) {
    transform: scaleX(-1);
  }
  :host([flip='y']) {
    transform: scaleY(-1);
  }
  :host([flip='both']) {
    transform: scale(-1, -1);
  }

  /* Rotation and Flipping combined */
  :host([rotate][flip='x']) {
    transform: rotate(var(--rotate-angle, 0deg)) scaleX(-1);
  }
  :host([rotate][flip='y']) {
    transform: rotate(var(--rotate-angle, 0deg)) scaleY(-1);
  }
  :host([rotate][flip='both']) {
    transform: rotate(var(--rotate-angle, 0deg)) scale(-1, -1);
  }

  /* #region Animations — ported from Font Awesome 7.3 (--fa-* props mapped to wa-icon's --* names) */

  :host([animation='beat']) {
    animation-name: beat;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
  }

  :host([animation='bounce']) {
    animation-name: bounce;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, cubic-bezier(0.28, 0.84, 0.42, 1));
  }

  :host([animation='fade']) {
    animation-name: fade;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
  }

  :host([animation='beat-fade']) {
    animation-name: beat-fade;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
  }

  :host([animation='flip']) {
    animation-name: flip;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1.5s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
  }

  :host([animation='flip-360']) {
    animation-name: flip-360;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
  }

  :host([animation='shake']) {
    animation-name: shake;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 0.75s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
  }

  :host([animation='spin']) {
    animation-name: spin;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 2s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, linear);
  }

  :host([animation='spin-pulse']) {
    animation-name: spin;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, steps(8));
  }

  /* spin-reverse is FA's reverse modifier expressed as a standalone value; reverse any spin via --animation-direction: reverse */
  :host([animation='spin-reverse']) {
    animation-name: spin;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, reverse);
    animation-duration: var(--animation-duration, 2s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, linear);
  }

  :host([animation='spin-snap']) {
    animation-name: spin-snap;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 3s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, linear);
  }

  :host([animation='spin-snap-4']) {
    animation-name: spin-snap-4;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 2.4s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, linear);
  }

  :host([animation='spin-snap-8']) {
    animation-name: spin-snap-8;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 4s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, linear);
  }

  :host([animation='buzz']) {
    animation-name: buzz;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 0.6s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, linear);
  }

  :host([animation='wag']) {
    animation-name: wag;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 0.9s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-out);
    transform-origin: bottom center;
  }

  :host([animation='float']) {
    animation-name: float;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 3s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
    will-change: transform;
  }

  :host([animation='swing']) {
    animation-name: swing;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1.2s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-out);
    transform-origin: top center;
  }

  :host([animation='jello']) {
    animation-name: jello;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 0.9s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-out);
  }

  @media (prefers-reduced-motion: reduce) {
    :host([animation='beat']),
    :host([animation='bounce']),
    :host([animation='fade']),
    :host([animation='beat-fade']),
    :host([animation='flip']),
    :host([animation='flip-360']),
    :host([animation='shake']),
    :host([animation='spin']),
    :host([animation='spin-pulse']),
    :host([animation='spin-reverse']),
    :host([animation='spin-snap']),
    :host([animation='spin-snap-4']),
    :host([animation='spin-snap-8']),
    :host([animation='buzz']),
    :host([animation='wag']),
    :host([animation='float']),
    :host([animation='swing']),
    :host([animation='jello']) {
      animation: none !important;
      transition: none !important;
    }
  }

  /* #endregion */

  /* #region Keyframes — ported verbatim from Font Awesome 7.3 */

  @keyframes beat {
    0% {
      transform: scale(1);
    }
    25% {
      transform: scale(calc(1.25 * var(--beat-scale, 1.25)));
    }
    45% {
      transform: scale(calc(1.22 * var(--beat-scale, 1.22)));
    }
    65% {
      transform: scale(calc(1.25 * var(--beat-scale, 1.25)));
    }
    90% {
      transform: scale(1);
    }
  }

  @keyframes bounce {
    0% {
      transform: scale(1, 1) translateY(0);
      /* No fallback by design (ported from FA 7.3): the first segment uses the user's --animation-timing or the CSS
         initial ease, while the explicit cubic-beziers on later stops drive the bounce physics. */
      animation-timing-function: var(--animation-timing);
    }
    14% {
      transform: scale(var(--bounce-start-scale-x, 1.06), var(--bounce-start-scale-y, 0.94))
        translateY(var(--bounce-anticipation, 3px));
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
    }
    32% {
      transform: scale(var(--bounce-jump-scale-x, 0.94), var(--bounce-jump-scale-y, 1.12))
        translateY(calc(-1 * var(--bounce-height, 0.5em)));
      animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
    }
    52% {
      transform: scale(1, 1) translateY(calc(-1 * var(--bounce-height, 0.5em) * 1.1));
      animation-timing-function: cubic-bezier(0.5, 0, 1, 0.5);
    }
    70% {
      transform: scale(var(--bounce-land-scale-x, 1.06), var(--bounce-land-scale-y, 0.92)) translateY(0);
      animation-timing-function: cubic-bezier(0.33, 0.33, 0.66, 1);
    }
    85% {
      transform: scale(0.98, 1.04) translateY(calc(-2px * var(--bounce-rebound, 1)));
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 1);
    }
    100% {
      transform: scale(1, 1) translateY(0);
    }
  }

  @keyframes fade {
    0% {
      opacity: 1;
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.2, 0, 0.4, 1);
    }
    40% {
      opacity: var(--fade-opacity, 0.4);
      transform: scale(0.98);
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes beat-fade {
    0% {
      opacity: var(--beat-fade-opacity, 0.4);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.2, 0, 0.4, 1);
    }
    25% {
      opacity: calc(var(--beat-fade-opacity, 0.4) + 0.4);
      transform: scale(var(--beat-fade-scale, 1.28));
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    45% {
      opacity: 1;
      transform: scale(var(--beat-fade-scale, 1.25));
      animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }
    65% {
      opacity: calc(var(--beat-fade-opacity, 0.4) + 0.4);
      transform: scale(var(--beat-fade-scale, 1.28));
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    100% {
      opacity: var(--beat-fade-opacity, 0.4);
      transform: scale(1);
    }
  }

  @keyframes flip {
    0% {
      transform: perspective(2em) scale(1) rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), 0deg);
      animation-timing-function: cubic-bezier(0.2, 0, 0.4, 1);
    }
    8% {
      transform: perspective(2em) scale(var(--flip-anticipation-scale, 0.95))
        rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), 0deg);
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
    }
    35% {
      transform: perspective(2em) scale(1)
        rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), calc(var(--flip-angle, -360deg) * 0.6));
      animation-timing-function: linear;
    }
    65% {
      transform: perspective(2em) scale(1)
        rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), calc(var(--flip-angle, -360deg) * 0.5));
      animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
    }
    92% {
      transform: perspective(2em) scale(1)
        rotate3d(
          var(--flip-x, 0),
          var(--flip-y, 1),
          var(--flip-z, 0),
          calc(var(--flip-angle, -360deg) * var(--flip-overshoot, 1.04))
        );
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 1);
    }
    100% {
      transform: perspective(2em) scale(1)
        rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), var(--flip-angle, -360deg));
    }
  }

  @keyframes flip-360 {
    0% {
      transform: perspective(2em) scale(1) rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), 0deg);
      animation-timing-function: cubic-bezier(0.2, 0, 0.4, 1);
    }
    8% {
      transform: perspective(2em) scale(var(--flip-anticipation-scale, 0.95))
        rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), 0deg);
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
    }
    50% {
      transform: perspective(2em) scale(1)
        rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), calc(var(--flip-angle, -360deg) * 0.6));
      animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
    }
    80% {
      transform: perspective(2em) scale(1)
        rotate3d(
          var(--flip-x, 0),
          var(--flip-y, 1),
          var(--flip-z, 0),
          calc(var(--flip-angle, -360deg) * var(--flip-overshoot, 1.04))
        );
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 1);
    }
    100% {
      transform: perspective(2em) scale(1)
        rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), var(--flip-angle, -360deg));
    }
  }

  @keyframes shake {
    0% {
      transform: rotate(0deg);
      animation-timing-function: cubic-bezier(0.2, 0, 0.8, 1);
    }
    8% {
      transform: rotate(35deg) translateX(1px);
      animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
    }
    20% {
      transform: rotate(-22deg) translateX(-1px);
      animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
    }
    35% {
      transform: rotate(15deg) translateX(1px);
      animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
    }
    50% {
      transform: rotate(-9deg);
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    65% {
      transform: rotate(5deg);
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    78% {
      transform: rotate(-3deg);
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    90% {
      transform: rotate(1deg);
      animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }
    100% {
      transform: rotate(0deg);
    }
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes spin-snap {
    0% {
      transform: rotate(0deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    12% {
      transform: rotate(60deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    16.67% {
      transform: rotate(60deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    28.67% {
      transform: rotate(120deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    33.33% {
      transform: rotate(120deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    45.33% {
      transform: rotate(180deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    50% {
      transform: rotate(180deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    62% {
      transform: rotate(240deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    66.67% {
      transform: rotate(240deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    78.67% {
      transform: rotate(300deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    83.33% {
      transform: rotate(300deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    95.33% {
      transform: rotate(360deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes spin-snap-4 {
    0% {
      transform: rotate(0deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    15% {
      transform: rotate(90deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    25% {
      transform: rotate(90deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    40% {
      transform: rotate(180deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    50% {
      transform: rotate(180deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    65% {
      transform: rotate(270deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    75% {
      transform: rotate(270deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    90% {
      transform: rotate(360deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes spin-snap-8 {
    0% {
      transform: rotate(0deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    9% {
      transform: rotate(45deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    12.5% {
      transform: rotate(45deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    21.5% {
      transform: rotate(90deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    25% {
      transform: rotate(90deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    34% {
      transform: rotate(135deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    37.5% {
      transform: rotate(135deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    46.5% {
      transform: rotate(180deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    50% {
      transform: rotate(180deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    59% {
      transform: rotate(225deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    62.5% {
      transform: rotate(225deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    71.5% {
      transform: rotate(270deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    75% {
      transform: rotate(270deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    84% {
      transform: rotate(315deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    87.5% {
      transform: rotate(315deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    96.5% {
      transform: rotate(360deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes buzz {
    0% {
      transform: translateX(0) rotate(0deg);
      animation-timing-function: cubic-bezier(0.1, 0, 0.9, 1);
    }
    5% {
      transform: translateX(var(--buzz-distance, 4px)) rotate(0.5deg);
    }
    10% {
      transform: translateX(calc(-1 * var(--buzz-distance, 4px))) rotate(-0.5deg);
    }
    15% {
      transform: translateX(var(--buzz-distance, 4px)) rotate(0.3deg);
    }
    20% {
      transform: translateX(calc(-1 * var(--buzz-distance, 4px))) rotate(-0.3deg);
    }
    25% {
      transform: translateX(calc(var(--buzz-distance, 4px) * 0.7)) rotate(0.2deg);
    }
    30% {
      transform: translateX(calc(-1 * var(--buzz-distance, 4px) * 0.7)) rotate(-0.2deg);
    }
    35% {
      transform: translateX(calc(var(--buzz-distance, 4px) * 0.4)) rotate(0.1deg);
    }
    40% {
      transform: translateX(0) rotate(0deg);
    }
    100% {
      transform: translateX(0) rotate(0deg);
    }
  }

  @keyframes wag {
    0% {
      transform: rotate(0deg);
      animation-timing-function: cubic-bezier(0.2, 0, 0.6, 1);
    }
    12% {
      transform: rotate(var(--wag-angle, 12deg));
      animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }
    24% {
      transform: rotate(2deg);
      animation-timing-function: cubic-bezier(0.2, 0, 0.6, 1);
    }
    36% {
      transform: rotate(calc(var(--wag-angle, 12deg) * 0.85));
      animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }
    48% {
      transform: rotate(1deg);
      animation-timing-function: cubic-bezier(0.2, 0, 0.6, 1);
    }
    58% {
      transform: rotate(calc(var(--wag-angle, 12deg) * 0.6));
      animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }
    68% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(0deg);
    }
  }

  @keyframes float {
    0% {
      transform: translateY(0) translateX(0) rotate(0deg)
        scale(var(--float-squash-x, 1.02), var(--float-squash-y, 0.98));
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
    }
    15% {
      transform: translateY(calc(-0.4 * var(--float-height, 6px))) translateX(var(--float-drift, 1px))
        rotate(var(--float-tilt, 1deg)) scale(1, 1);
      animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
    }
    35% {
      transform: translateY(calc(-1 * var(--float-height, 6px))) translateX(0) rotate(0deg)
        scale(var(--float-stretch-x, 0.98), var(--float-stretch-y, 1.03));
      animation-timing-function: cubic-bezier(0.5, 0, 0.5, 0);
    }
    50% {
      transform: translateY(calc(-0.92 * var(--float-height, 6px))) translateX(calc(-0.5 * var(--float-drift, 1px)))
        rotate(calc(-0.5 * var(--float-tilt, 1deg))) scale(0.995, 1.01);
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
    }
    70% {
      transform: translateY(calc(-0.3 * var(--float-height, 6px))) translateX(calc(-1 * var(--float-drift, 1px)))
        rotate(calc(-1 * var(--float-tilt, 1deg))) scale(1, 1);
      animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
    }
    90% {
      transform: translateY(calc(0.05 * var(--float-height, 6px))) translateX(0) rotate(0deg)
        scale(var(--float-squash-x, 1.02), var(--float-squash-y, 0.98));
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 1);
    }
    100% {
      transform: translateY(0) translateX(0) rotate(0deg)
        scale(var(--float-squash-x, 1.02), var(--float-squash-y, 0.98));
    }
  }

  @keyframes swing {
    0% {
      transform: rotate(0deg);
      animation-timing-function: cubic-bezier(0.2, 0, 0.8, 1);
    }
    8% {
      transform: rotate(var(--swing-angle, 22deg));
      animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
    }
    18% {
      transform: rotate(calc(-1 * var(--swing-angle, 22deg) * 0.85));
      animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
    }
    28% {
      transform: rotate(calc(var(--swing-angle, 22deg) * 0.65));
      animation-timing-function: cubic-bezier(0.35, 0, 0.65, 1);
    }
    38% {
      transform: rotate(calc(-1 * var(--swing-angle, 22deg) * 0.45));
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    48% {
      transform: rotate(calc(var(--swing-angle, 22deg) * 0.25));
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    56% {
      transform: rotate(calc(-1 * var(--swing-angle, 22deg) * 0.1));
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    64% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(0deg);
    }
  }

  @keyframes jello {
    0% {
      transform: scale(1, 1);
      animation-timing-function: cubic-bezier(0.2, 0, 0.8, 1);
    }
    12% {
      transform: scale(var(--jello-scale-x, 1.15), calc(2 - var(--jello-scale-x, 1.15)));
      animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
    }
    24% {
      transform: scale(calc(2 - var(--jello-scale-y, 1.12)), var(--jello-scale-y, 1.12));
      animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
    }
    36% {
      transform: scale(
        calc(1 + (var(--jello-scale-x, 1.15) - 1) * 0.5),
        calc(2 - (1 + (var(--jello-scale-x, 1.15) - 1) * 0.5))
      );
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    48% {
      transform: scale(
        calc(2 - (1 + (var(--jello-scale-y, 1.12) - 1) * 0.3)),
        calc(1 + (var(--jello-scale-y, 1.12) - 1) * 0.3)
      );
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    58% {
      transform: scale(1.02, 0.98);
      animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }
    68% {
      transform: scale(1, 1);
    }
    100% {
      transform: scale(1, 1);
    }
  }

  /* #endregion */
`;

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.HGBRCPUS.js
  var iconPath = "";
  var kitCode = "";
  function getIconPath() {
    return iconPath.replace(/\/$/, "");
  }
  function setKitCode(code) {
    kitCode = code;
  }
  function getKitCode() {
    if (!kitCode) {
      const el = document.querySelector("[data-fa-kit-code]");
      if (el) {
        setKitCode(el.getAttribute("data-fa-kit-code") || "");
      }
    }
    return kitCode;
  }

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.KKI7M5DP.js
  var FA_VERSION = "7.3.0";
  function getIconFolder(_name, family, variant) {
    let folder = "solid";
    if (family === "chisel") {
      folder = "chisel-regular";
    }
    if (family === "etch") {
      folder = "etch-solid";
    }
    if (family === "graphite") {
      folder = "graphite-thin";
    }
    if (family === "jelly") {
      folder = "jelly-regular";
      if (variant === "duo-regular") folder = "jelly-duo-regular";
      if (variant === "fill-regular") folder = "jelly-fill-regular";
    }
    if (family === "jelly-duo") {
      folder = "jelly-duo-regular";
    }
    if (family === "jelly-fill") {
      folder = "jelly-fill-regular";
    }
    if (family === "notdog") {
      if (variant === "solid") folder = "notdog-solid";
      if (variant === "duo-solid") folder = "notdog-duo-solid";
    }
    if (family === "notdog-duo") {
      folder = "notdog-duo-solid";
    }
    if (family === "slab") {
      if (variant === "solid" || variant === "regular") folder = "slab-regular";
      if (variant === "press-regular") folder = "slab-press-regular";
    }
    if (family === "slab-press") {
      folder = "slab-press-regular";
    }
    if (family === "slab-duo") {
      folder = "slab-duo-regular";
    }
    if (family === "slab-press-duo") {
      folder = "slab-press-duo-regular";
    }
    if (family === "thumbprint") {
      folder = "thumbprint-light";
    }
    if (family === "utility") {
      folder = "utility-semibold";
    }
    if (family === "utility-duo") {
      folder = "utility-duo-semibold";
    }
    if (family === "utility-fill") {
      folder = "utility-fill-semibold";
    }
    if (family === "whiteboard") {
      folder = "whiteboard-semibold";
    }
    if (family === "mosaic") {
      folder = "mosaic-solid";
    }
    if (family === "pixel") {
      folder = "pixel-regular";
    }
    if (family === "vellum") {
      folder = "vellum-solid";
    }
    if (family === "classic") {
      if (variant === "thin") folder = "thin";
      if (variant === "light") folder = "light";
      if (variant === "regular") folder = "regular";
      if (variant === "solid") folder = "solid";
    }
    if (family === "duotone") {
      if (variant === "thin") folder = "duotone-thin";
      if (variant === "light") folder = "duotone-light";
      if (variant === "regular") folder = "duotone-regular";
      if (variant === "solid") folder = "duotone";
    }
    if (family === "sharp") {
      if (variant === "thin") folder = "sharp-thin";
      if (variant === "light") folder = "sharp-light";
      if (variant === "regular") folder = "sharp-regular";
      if (variant === "solid") folder = "sharp-solid";
    }
    if (family === "sharp-duotone") {
      if (variant === "thin") folder = "sharp-duotone-thin";
      if (variant === "light") folder = "sharp-duotone-light";
      if (variant === "regular") folder = "sharp-duotone-regular";
      if (variant === "solid") folder = "sharp-duotone-solid";
    }
    if (family === "brands") {
      folder = "brands";
    }
    return folder;
  }
  function getIconUrl(name, family, variant) {
    const folder = getIconFolder(name, family, variant);
    const iconBase = getIconPath();
    if (iconBase) {
      return `${iconBase}/${folder}/${name}.svg`;
    }
    const kitCode2 = getKitCode();
    const isPro = kitCode2.length > 0;
    return isPro ? `https://ka-p.fontawesome.com/releases/v${FA_VERSION}/svgs/${folder}/${name}.svg?token=${encodeURIComponent(kitCode2)}` : `https://ka-f.fontawesome.com/releases/v${FA_VERSION}/svgs/${folder}/${name}.svg`;
  }
  var library = {
    name: "default",
    resolver: (name, family = "classic", variant = "solid") => {
      return getIconUrl(name, family, variant);
    },
    mutator: (svg, hostEl) => {
      if (!svg.hasAttribute("fill")) {
        svg.setAttribute("fill", "currentColor");
      }
      if (hostEl?.family && !svg.hasAttribute("data-duotone-initialized")) {
        const { family, variant } = hostEl;
        if (
          // Duotone
          family === "duotone" || // Sharp duotone
          family === "sharp-duotone" || // Notdog duo (correct usage: family="notdog-duo")
          family === "notdog-duo" || // NOTE: family="notdog" variant="duo-solid" is deprecated
          family === "notdog" && variant === "duo-solid" || // Jelly duo (correct usage: family="jelly-duo")
          family === "jelly-duo" || // NOTE: family="jelly" variant="duo-regular" is deprecated
          family === "jelly" && variant === "duo-regular" || // Utility duo (correct usage: family="utility-duo")
          family === "utility-duo" || // Slab duo (new in 7.3)
          family === "slab-duo" || family === "slab-press-duo" || // Thumbprint
          family === "thumbprint"
        ) {
          const paths = [...svg.querySelectorAll("path")];
          const primaryPath = paths.find((p4) => !p4.hasAttribute("opacity"));
          const secondaryPath = paths.find((p4) => p4.hasAttribute("opacity"));
          if (!primaryPath || !secondaryPath) return;
          primaryPath.setAttribute("data-duotone-primary", "");
          secondaryPath.setAttribute("data-duotone-secondary", "");
          if (hostEl.swapOpacity && primaryPath && secondaryPath) {
            const originalOpacity = secondaryPath.getAttribute("opacity") || "0.4";
            primaryPath.style.setProperty("--path-opacity", originalOpacity);
            secondaryPath.style.setProperty("--path-opacity", "1");
          }
          svg.setAttribute("data-duotone-initialized", "");
        }
      }
    }
  };
  var library_default_default = library;

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.YPRC5XZF.js
  function dataUri(svg) {
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
  var icons = {
    //
    // Solid variant
    //
    solid: {
      "arrow-down": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M169.4 502.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 402.7 224 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 370.7-105.4-105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg>`,
      "arrow-up": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M214.6 9.4c-12.5-12.5-32.8-12.5-45.3 0l-160 160c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L160 109.3 160 480c0 17.7 14.3 32 32 32s32-14.3 32-32l0-370.7 105.4 105.4c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-160-160z"/></svg>`,
      backward: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M236.3 107.1C247.9 96 265 92.9 279.7 99.2C294.4 105.5 304 120 304 136L304 272.3L476.3 107.2C487.9 96 505 92.9 519.7 99.2C534.4 105.5 544 120 544 136L544 504C544 520 534.4 534.5 519.7 540.8C505 547.1 487.9 544 476.3 532.9L304 367.7L304 504C304 520 294.4 534.5 279.7 540.8C265 547.1 247.9 544 236.3 532.9L44.3 348.9C36.5 341.3 32 330.9 32 320C32 309.1 36.5 298.7 44.3 291.1L236.3 107.1z"/></svg>`,
      "backward-step": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M491 100.8C478.1 93.8 462.3 94.5 450 102.6L192 272.1L192 128C192 110.3 177.7 96 160 96C142.3 96 128 110.3 128 128L128 512C128 529.7 142.3 544 160 544C177.7 544 192 529.7 192 512L192 367.9L450 537.5C462.3 545.6 478 546.3 491 539.3C504 532.3 512 518.8 512 504.1L512 136.1C512 121.4 503.9 107.9 491 100.9z"/></svg>`,
      bars: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License) Copyright 2026 Fonticons, Inc. --><path d="M0 96C0 78.3 14.3 64 32 64l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 128C14.3 128 0 113.7 0 96zM0 256c0-17.7 14.3-32 32-32l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 288c-17.7 0-32-14.3-32-32zM448 416c0 17.7-14.3 32-32 32L32 448c-17.7 0-32-14.3-32-32s14.3-32 32-32l384 0c17.7 0 32 14.3 32 32z"/></svg>`,
      "angles-left": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M77.3 256 214.7 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L77.3 256zm192 0L406.7 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L269.3 256z"/></svg>`,
      "angles-right": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M434.7 256 297.3 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L434.7 256zm-192 0L105.3 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L242.7 256z"/></svg>`,
      check: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M434.8 70.1c14.3 10.4 17.5 30.4 7.1 44.7l-256 352c-5.5 7.6-14 12.3-23.4 13.1s-18.5-2.7-25.1-9.3l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l101.5 101.5 234-321.7c10.4-14.3 30.4-17.5 44.7-7.1z"/></svg>`,
      "chevron-down": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M201.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 338.7 54.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z"/></svg>`,
      "chevron-left": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l192 192c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L77.3 256 246.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-192 192z"/></svg>`,
      "chevron-right": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M311.1 233.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L243.2 256 73.9 86.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l192 192z"/></svg>`,
      circle: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0z"/></svg>`,
      "closed-captioning": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M64 192C64 156.7 92.7 128 128 128L512 128C547.3 128 576 156.7 576 192L576 448C576 483.3 547.3 512 512 512L128 512C92.7 512 64 483.3 64 448L64 192zM216 272L248 272C252.4 272 256 275.6 256 280C256 293.3 266.7 304 280 304C293.3 304 304 293.3 304 280C304 249.1 278.9 224 248 224L216 224C185.1 224 160 249.1 160 280L160 360C160 390.9 185.1 416 216 416L248 416C278.9 416 304 390.9 304 360C304 346.7 293.3 336 280 336C266.7 336 256 346.7 256 360C256 364.4 252.4 368 248 368L216 368C211.6 368 208 364.4 208 360L208 280C208 275.6 211.6 272 216 272zM384 280C384 275.6 387.6 272 392 272L424 272C428.4 272 432 275.6 432 280C432 293.3 442.7 304 456 304C469.3 304 480 293.3 480 280C480 249.1 454.9 224 424 224L392 224C361.1 224 336 249.1 336 280L336 360C336 390.9 361.1 416 392 416L424 416C454.9 416 480 390.9 480 360C480 346.7 469.3 336 456 336C442.7 336 432 346.7 432 360C432 364.4 428.4 368 424 368L392 368C387.6 368 384 364.4 384 360L384 280z"/></svg>`,
      "closed-captioning-slash": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M39 39.1C48.4 29.7 63.6 29.7 72.9 39.1L161.8 128L512 128C547.3 128 576 156.7 576 192L576 448C576 473.5 561.1 495.4 539.6 505.8L601 567.1C610.4 576.5 610.4 591.7 601 601C591.6 610.3 576.4 610.4 567.1 601L39 73.1C29.7 63.7 29.7 48.5 39 39.1zM384 350.1L384 279.9C384 275.5 387.6 271.9 392 271.9L424 271.9C428.4 271.9 432 275.5 432 279.9C432 293.2 442.7 303.9 456 303.9C469.3 303.9 480 293.2 480 279.9C480 249 454.9 223.9 424 223.9L392 223.9C361.1 223.9 336 249 336 279.9L336 302.1L384 350.1zM445.5 411.6C465.7 403.2 480 383.2 480 359.9C480 346.6 469.3 335.9 456 335.9C442.7 335.9 432 346.6 432 359.9C432 364.3 428.4 367.9 424 367.9L401.8 367.9L445.5 411.6zM162.3 264.1C160.8 269.1 160 274.5 160 280L160 360C160 390.9 185.1 416 216 416L248 416C266.1 416 282.1 407.5 292.4 394.2L410.2 512L128 512C92.7 512 64 483.3 64 448L64 192C64 184.2 65.4 176.7 68 169.8L162.3 264.1zM256.1 357.9C256 358.6 256 359.3 256 360C256 364.4 252.4 368 248 368L216 368C211.6 368 208 364.4 208 360L208 309.8L256.1 357.9z"/></svg>`,
      compress: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M160 64c0-17.7-14.3-32-32-32S96 46.3 96 64l0 64-64 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l96 0c17.7 0 32-14.3 32-32l0-96zM32 320c-17.7 0-32 14.3-32 32s14.3 32 32 32l64 0 0 64c0 17.7 14.3 32 32 32s32-14.3 32-32l0-96c0-17.7-14.3-32-32-32l-96 0zM352 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 96c0 17.7 14.3 32 32 32l96 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-64 0 0-64zM320 320c-17.7 0-32 14.3-32 32l0 96c0 17.7 14.3 32 32 32s32-14.3 32-32l0-64 64 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-96 0z"/></svg>`,
      ellipsis: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.3.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M96 320C96 289.1 121.1 264 152 264C182.9 264 208 289.1 208 320C208 350.9 182.9 376 152 376C121.1 376 96 350.9 96 320zM264 320C264 289.1 289.1 264 320 264C350.9 264 376 289.1 376 320C376 350.9 350.9 376 320 376C289.1 376 264 350.9 264 320zM488 264C518.9 264 544 289.1 544 320C544 350.9 518.9 376 488 376C457.1 376 432 350.9 432 320C432 289.1 457.1 264 488 264z"/></svg>`,
      "ellipsis-vertical": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M320 208C289.1 208 264 182.9 264 152C264 121.1 289.1 96 320 96C350.9 96 376 121.1 376 152C376 182.9 350.9 208 320 208zM320 432C350.9 432 376 457.1 376 488C376 518.9 350.9 544 320 544C289.1 544 264 518.9 264 488C264 457.1 289.1 432 320 432zM376 320C376 350.9 350.9 376 320 376C289.1 376 264 350.9 264 320C264 289.1 289.1 264 320 264C350.9 264 376 289.1 376 320z"/></svg>`,
      expand: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 96C110.3 96 96 110.3 96 128L96 224C96 241.7 110.3 256 128 256C145.7 256 160 241.7 160 224L160 160L224 160C241.7 160 256 145.7 256 128C256 110.3 241.7 96 224 96L128 96zM160 416C160 398.3 145.7 384 128 384C110.3 384 96 398.3 96 416L96 512C96 529.7 110.3 544 128 544L224 544C241.7 544 256 529.7 256 512C256 494.3 241.7 480 224 480L160 480L160 416zM416 96C398.3 96 384 110.3 384 128C384 145.7 398.3 160 416 160L480 160L480 224C480 241.7 494.3 256 512 256C529.7 256 544 241.7 544 224L544 128C544 110.3 529.7 96 512 96L416 96zM544 416C544 398.3 529.7 384 512 384C494.3 384 480 398.3 480 416L480 480L416 480C398.3 480 384 494.3 384 512C384 529.7 398.3 544 416 544L512 544C529.7 544 544 529.7 544 512L544 416z"/></svg>`,
      eyedropper: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M341.6 29.2l-101.6 101.6-9.4-9.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-9.4-9.4 101.6-101.6c39-39 39-102.2 0-141.1s-102.2-39-141.1 0zM55.4 323.3c-15 15-23.4 35.4-23.4 56.6l0 42.4-26.6 39.9c-8.5 12.7-6.8 29.6 4 40.4s27.7 12.5 40.4 4l39.9-26.6 42.4 0c21.2 0 41.6-8.4 56.6-23.4l109.4-109.4-45.3-45.3-109.4 109.4c-3 3-7.1 4.7-11.3 4.7l-36.1 0 0-36.1c0-4.2 1.7-8.3 4.7-11.3l109.4-109.4-45.3-45.3-109.4 109.4z"/></svg>`,
      filter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M32 64C19.1 64 7.4 71.8 2.4 83.8S.2 109.5 9.4 118.6L192 301.3 192 416c0 8.5 3.4 16.6 9.4 22.6l64 64c9.2 9.2 22.9 11.9 34.9 6.9S320 492.9 320 480l0-178.7 182.6-182.6c9.2-9.2 11.9-22.9 6.9-34.9S492.9 64 480 64L32 64z"/></svg>`,
      forward: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M403.7 107.1C392.1 96 375 92.9 360.3 99.2C345.6 105.5 336 120 336 136L336 272.3L163.7 107.2C152.1 96 135 92.9 120.3 99.2C105.6 105.5 96 120 96 136L96 504C96 520 105.6 534.5 120.3 540.8C135 547.1 152.1 544 163.7 532.9L336 367.7L336 504C336 520 345.6 534.5 360.3 540.8C375 547.1 392.1 544 403.7 532.9L595.7 348.9C603.6 341.4 608 330.9 608 320C608 309.1 603.5 298.7 595.7 291.1L403.7 107.1z"/></svg>`,
      file: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M192 64C156.7 64 128 92.7 128 128L128 512C128 547.3 156.7 576 192 576L448 576C483.3 576 512 547.3 512 512L512 234.5C512 217.5 505.3 201.2 493.3 189.2L386.7 82.7C374.7 70.7 358.5 64 341.5 64L192 64zM453.5 240L360 240C346.7 240 336 229.3 336 216L336 122.5L453.5 240z"/></svg>`,
      "file-audio": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM389.8 307.7C380.7 301.4 368.3 303.6 362 312.7C355.7 321.8 357.9 334.2 367 340.5C390.9 357.2 406.4 384.8 406.4 416C406.4 447.2 390.8 474.9 367 491.5C357.9 497.8 355.7 510.3 362 519.3C368.3 528.3 380.8 530.6 389.8 524.3C423.9 500.5 446.4 460.8 446.4 416C446.4 371.2 424 331.5 389.8 307.7zM208 376C199.2 376 192 383.2 192 392L192 440C192 448.8 199.2 456 208 456L232 456L259.2 490C262.2 493.8 266.8 496 271.7 496L272 496C280.8 496 288 488.8 288 480L288 352C288 343.2 280.8 336 272 336L271.7 336C266.8 336 262.2 338.2 259.2 342L232 376L208 376zM336 448.2C336 458.9 346.5 466.4 354.9 459.8C367.8 449.5 376 433.7 376 416C376 398.3 367.8 382.5 354.9 372.2C346.5 365.5 336 373.1 336 383.8L336 448.3z"/></svg>`,
      "file-code": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM282.2 359.6C290.8 349.5 289.7 334.4 279.6 325.8C269.5 317.2 254.4 318.3 245.8 328.4L197.8 384.4C190.1 393.4 190.1 406.6 197.8 415.6L245.8 471.6C254.4 481.7 269.6 482.8 279.6 474.2C289.6 465.6 290.8 450.4 282.2 440.4L247.6 400L282.2 359.6zM394.2 328.4C385.6 318.3 370.4 317.2 360.4 325.8C350.4 334.4 349.2 349.6 357.8 359.6L392.4 400L357.8 440.4C349.2 450.5 350.3 465.6 360.4 474.2C370.5 482.8 385.6 481.7 394.2 471.6L442.2 415.6C449.9 406.6 449.9 393.4 442.2 384.4L394.2 328.4z"/></svg>`,
      "file-excel": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM292 330.7C284.6 319.7 269.7 316.7 258.7 324C247.7 331.3 244.7 346.3 252 357.3L291.2 416L252 474.7C244.6 485.7 247.6 500.6 258.7 508C269.8 515.4 284.6 512.4 292 501.3L320 459.3L348 501.3C355.4 512.3 370.3 515.3 381.3 508C392.3 500.7 395.3 485.7 388 474.7L348.8 416L388 357.3C395.4 346.3 392.4 331.4 381.3 324C370.2 316.6 355.4 319.6 348 330.7L320 372.7L292 330.7z"/></svg>`,
      "file-image": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM256 320C256 302.3 241.7 288 224 288C206.3 288 192 302.3 192 320C192 337.7 206.3 352 224 352C241.7 352 256 337.7 256 320zM220.6 512L419.4 512C435.2 512 448 499.2 448 483.4C448 476.1 445.2 469 440.1 463.7L343.3 361.9C337.3 355.6 328.9 352 320.1 352L319.8 352C311 352 302.7 355.6 296.6 361.9L199.9 463.7C194.8 469 192 476.1 192 483.4C192 499.2 204.8 512 220.6 512z"/></svg>`,
      "file-pdf": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 64C92.7 64 64 92.7 64 128L64 512C64 547.3 92.7 576 128 576L208 576L208 464C208 428.7 236.7 400 272 400L448 400L448 234.5C448 217.5 441.3 201.2 429.3 189.2L322.7 82.7C310.7 70.7 294.5 64 277.5 64L128 64zM389.5 240L296 240C282.7 240 272 229.3 272 216L272 122.5L389.5 240zM272 444C261 444 252 453 252 464L252 592C252 603 261 612 272 612C283 612 292 603 292 592L292 564L304 564C337.1 564 364 537.1 364 504C364 470.9 337.1 444 304 444L272 444zM304 524L292 524L292 484L304 484C315 484 324 493 324 504C324 515 315 524 304 524zM400 444C389 444 380 453 380 464L380 592C380 603 389 612 400 612L432 612C460.7 612 484 588.7 484 560L484 496C484 467.3 460.7 444 432 444L400 444zM420 572L420 484L432 484C438.6 484 444 489.4 444 496L444 560C444 566.6 438.6 572 432 572L420 572zM508 464L508 592C508 603 517 612 528 612C539 612 548 603 548 592L548 548L576 548C587 548 596 539 596 528C596 517 587 508 576 508L548 508L548 484L576 484C587 484 596 475 596 464C596 453 587 444 576 444L528 444C517 444 508 453 508 464z"/></svg>`,
      "file-powerpoint": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM280 320C266.7 320 256 330.7 256 344L256 488C256 501.3 266.7 512 280 512C293.3 512 304 501.3 304 488L304 464L328 464C367.8 464 400 431.8 400 392C400 352.2 367.8 320 328 320L280 320zM328 416L304 416L304 368L328 368C341.3 368 352 378.7 352 392C352 405.3 341.3 416 328 416z"/></svg>`,
      "file-video": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM208 368L208 464C208 481.7 222.3 496 240 496L336 496C353.7 496 368 481.7 368 464L368 440L403 475C406.2 478.2 410.5 480 415 480C424.4 480 432 472.4 432 463L432 368.9C432 359.5 424.4 351.9 415 351.9C410.5 351.9 406.2 353.7 403 356.9L368 391.9L368 367.9C368 350.2 353.7 335.9 336 335.9L240 335.9C222.3 335.9 208 350.2 208 367.9z"/></svg>`,
      "file-word": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM263.4 338.8C260.5 325.9 247.7 317.7 234.8 320.6C221.9 323.5 213.7 336.3 216.6 349.2L248.6 493.2C250.9 503.7 260 511.4 270.8 512C281.6 512.6 291.4 505.9 294.8 495.6L320 419.9L345.2 495.6C348.6 505.8 358.4 512.5 369.2 512C380 511.5 389.1 503.8 391.4 493.2L423.4 349.2C426.3 336.3 418.1 323.4 405.2 320.6C392.3 317.8 379.4 325.9 376.6 338.8L363.4 398.2L342.8 336.4C339.5 326.6 330.4 320 320 320C309.6 320 300.5 326.6 297.2 336.4L276.6 398.2L263.4 338.8z"/></svg>`,
      "file-zipper": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM192 136C192 149.3 202.7 160 216 160L264 160C277.3 160 288 149.3 288 136C288 122.7 277.3 112 264 112L216 112C202.7 112 192 122.7 192 136zM192 232C192 245.3 202.7 256 216 256L264 256C277.3 256 288 245.3 288 232C288 218.7 277.3 208 264 208L216 208C202.7 208 192 218.7 192 232zM256 304L224 304C206.3 304 192 318.3 192 336L192 384C192 410.5 213.5 432 240 432C266.5 432 288 410.5 288 384L288 336C288 318.3 273.7 304 256 304zM240 368C248.8 368 256 375.2 256 384C256 392.8 248.8 400 240 400C231.2 400 224 392.8 224 384C224 375.2 231.2 368 240 368z"/></svg>`,
      "forward-step": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M21 36.8c12.9-7 28.7-6.3 41 1.8L320 208.1 320 64c0-17.7 14.3-32 32-32s32 14.3 32 32l0 384c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-144.1-258 169.6c-12.3 8.1-28 8.8-41 1.8S0 454.7 0 440L0 72C0 57.3 8.1 43.8 21 36.8z"/></svg>`,
      gauge: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0zm320 96c0-26.9-16.5-49.9-40-59.3L280 120c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 172.7c-23.5 9.5-40 32.5-40 59.3 0 35.3 28.7 64 64 64s64-28.7 64-64zM144 176a32 32 0 1 0 0-64 32 32 0 1 0 0 64zm-16 80a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zm288 32a32 32 0 1 0 0-64 32 32 0 1 0 0 64zM400 144a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg>`,
      gear: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M259.1 73.5C262.1 58.7 275.2 48 290.4 48L350.2 48C365.4 48 378.5 58.7 381.5 73.5L396 143.5C410.1 149.5 423.3 157.2 435.3 166.3L503.1 143.8C517.5 139 533.3 145 540.9 158.2L570.8 210C578.4 223.2 575.7 239.8 564.3 249.9L511 297.3C511.9 304.7 512.3 312.3 512.3 320C512.3 327.7 511.8 335.3 511 342.7L564.4 390.2C575.8 400.3 578.4 417 570.9 430.1L541 481.9C533.4 495 517.6 501.1 503.2 496.3L435.4 473.8C423.3 482.9 410.1 490.5 396.1 496.6L381.7 566.5C378.6 581.4 365.5 592 350.4 592L290.6 592C275.4 592 262.3 581.3 259.3 566.5L244.9 496.6C230.8 490.6 217.7 482.9 205.6 473.8L137.5 496.3C123.1 501.1 107.3 495.1 99.7 481.9L69.8 430.1C62.2 416.9 64.9 400.3 76.3 390.2L129.7 342.7C128.8 335.3 128.4 327.7 128.4 320C128.4 312.3 128.9 304.7 129.7 297.3L76.3 249.8C64.9 239.7 62.3 223 69.8 209.9L99.7 158.1C107.3 144.9 123.1 138.9 137.5 143.7L205.3 166.2C217.4 157.1 230.6 149.5 244.6 143.4L259.1 73.5zM320.3 400C364.5 399.8 400.2 363.9 400 319.7C399.8 275.5 363.9 239.8 319.7 240C275.5 240.2 239.8 276.1 240 320.3C240.2 364.5 276.1 400.2 320.3 400z"/></svg>`,
      "grip-vertical": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M128 40c0-22.1-17.9-40-40-40L40 0C17.9 0 0 17.9 0 40L0 88c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48zm0 192c0-22.1-17.9-40-40-40l-48 0c-22.1 0-40 17.9-40 40l0 48c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48zM0 424l0 48c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48c0-22.1-17.9-40-40-40l-48 0c-22.1 0-40 17.9-40 40zM320 40c0-22.1-17.9-40-40-40L232 0c-22.1 0-40 17.9-40 40l0 48c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48zM192 232l0 48c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48c0-22.1-17.9-40-40-40l-48 0c-22.1 0-40 17.9-40 40zM320 424c0-22.1-17.9-40-40-40l-48 0c-22.1 0-40 17.9-40 40l0 48c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48z"/></svg>`,
      indeterminate: `<svg part="indeterminate-icon" class="icon" viewBox="0 0 16 16"><g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd" stroke-linecap="round"><g stroke="currentColor" stroke-width="2"><g transform="translate(2.285714 6.857143)"><path d="M10.2857143,1.14285714 L1.14285714,1.14285714"/></g></g></g></svg>`,
      "magnifying-glass": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376C296.3 401.1 253.9 416 208 416 93.1 416 0 322.9 0 208S93.1 0 208 0 416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg>`,
      minus: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M0 256c0-17.7 14.3-32 32-32l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 288c-17.7 0-32-14.3-32-32z"/></svg>`,
      pause: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M48 32C21.5 32 0 53.5 0 80L0 432c0 26.5 21.5 48 48 48l64 0c26.5 0 48-21.5 48-48l0-352c0-26.5-21.5-48-48-48L48 32zm224 0c-26.5 0-48 21.5-48 48l0 352c0 26.5 21.5 48 48 48l64 0c26.5 0 48-21.5 48-48l0-352c0-26.5-21.5-48-48-48l-64 0z"/></svg>`,
      "picture-in-picture": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M448 32c35.3 0 64 28.7 64 64l0 112-64 0 0-112-384 0 0 320 144 0 0 64-144 0-6.5-.3c-30.1-3.1-54.1-27-57.1-57.1L0 416 0 96C0 62.9 25.2 35.6 57.5 32.3L64 32 448 32zm16 224c26.5 0 48 21.5 48 48l0 128c0 26.5-21.5 48-48 48l-160 0c-26.5 0-48-21.5-48-48l0-128c0-26.5 21.5-48 48-48l160 0z"/></svg>`,
      play: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M91.2 36.9c-12.4-6.8-27.4-6.5-39.6 .7S32 57.9 32 72l0 368c0 14.1 7.5 27.2 19.6 34.4s27.2 7.5 39.6 .7l336-184c12.8-7 20.8-20.5 20.8-35.1s-8-28.1-20.8-35.1l-336-184z"/></svg>`,
      "play-circle": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0zM188.3 147.1c-7.6 4.2-12.3 12.3-12.3 20.9l0 176c0 8.7 4.7 16.7 12.3 20.9s16.8 4.1 24.3-.5l144-88c7.1-4.4 11.5-12.1 11.5-20.5s-4.4-16.1-11.5-20.5l-144-88c-7.4-4.5-16.7-4.7-24.3-.5z"/></svg>`,
      plus: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M352 128C352 110.3 337.7 96 320 96C302.3 96 288 110.3 288 128L288 288L128 288C110.3 288 96 302.3 96 320C96 337.7 110.3 352 128 352L288 352L288 512C288 529.7 302.3 544 320 544C337.7 544 352 529.7 352 512L352 352L512 352C529.7 352 544 337.7 544 320C544 302.3 529.7 288 512 288L352 288L352 128z"/></svg>`,
      star: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M309.5-18.9c-4.1-8-12.4-13.1-21.4-13.1s-17.3 5.1-21.4 13.1L193.1 125.3 33.2 150.7c-8.9 1.4-16.3 7.7-19.1 16.3s-.5 18 5.8 24.4l114.4 114.5-25.2 159.9c-1.4 8.9 2.3 17.9 9.6 23.2s16.9 6.1 25 2L288.1 417.6 432.4 491c8 4.1 17.7 3.3 25-2s11-14.2 9.6-23.2L441.7 305.9 556.1 191.4c6.4-6.4 8.6-15.8 5.8-24.4s-10.1-14.9-19.1-16.3L383 125.3 309.5-18.9z"/></svg>`,
      "table-columns": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M0 96C0 60.7 28.7 32 64 32l320 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zm64 64l0 256 128 0 0-256-128 0zm320 0l-128 0 0 256 128 0 0-256z"/></svg>`,
      thumbtack: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M32 32C32 14.3 46.3 0 64 0L320 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-29.5 0 10.3 134.1c37.1 21.2 65.8 56.4 78.2 99.7l3.8 13.4c2.8 9.7 .8 20-5.2 28.1S362 352 352 352L32 352c-10 0-19.5-4.7-25.5-12.7s-8-18.4-5.2-28.1L5 297.8c12.4-43.3 41-78.5 78.2-99.7L93.5 64 64 64C46.3 64 32 49.7 32 32zM160 400l64 0 0 112c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-112z"/></svg>`,
      "up-down": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M406.6 502.6l96-96c9.2-9.2 11.9-22.9 6.9-34.9S492.9 352 480 352l-64 0 0-320c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 320-64 0c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9l96 96c12.5 12.5 32.8 12.5 45.3 0zM150.6 9.4c-12.5-12.5-32.8-12.5-45.3 0l-96 96c-9.2 9.2-11.9 22.9-6.9 34.9S19.1 160 32 160l64 0 0 320c0 17.7 14.3 32 32 32s32-14.3 32-32l0-320 64 0c12.9 0 24.6-7.8 29.6-19.8s2.2-25.7-6.9-34.9l-96-96z"/></svg>`,
      upload: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M352 173.3L352 384C352 401.7 337.7 416 320 416C302.3 416 288 401.7 288 384L288 173.3L246.6 214.7C234.1 227.2 213.8 227.2 201.3 214.7C188.8 202.2 188.8 181.9 201.3 169.4L297.3 73.4C309.8 60.9 330.1 60.9 342.6 73.4L438.6 169.4C451.1 181.9 451.1 202.2 438.6 214.7C426.1 227.2 405.8 227.2 393.3 214.7L352 173.3zM320 464C364.2 464 400 428.2 400 384L480 384C515.3 384 544 412.7 544 448L544 480C544 515.3 515.3 544 480 544L160 544C124.7 544 96 515.3 96 480L96 448C96 412.7 124.7 384 160 384L240 384C240 428.2 275.8 464 320 464zM464 488C477.3 488 488 477.3 488 464C488 450.7 477.3 440 464 440C450.7 440 440 450.7 440 464C440 477.3 450.7 488 464 488z"/></svg>`,
      user: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M224 248a120 120 0 1 0 0-240 120 120 0 1 0 0 240zm-29.7 56C95.8 304 16 383.8 16 482.3 16 498.7 29.3 512 45.7 512l356.6 0c16.4 0 29.7-13.3 29.7-29.7 0-98.5-79.8-178.3-178.3-178.3l-59.4 0z"/></svg>`,
      volume: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M48 352l48 0 134.1 119.2c6.4 5.7 14.6 8.8 23.1 8.8 19.2 0 34.8-15.6 34.8-34.8l0-378.4c0-19.2-15.6-34.8-34.8-34.8-8.5 0-16.7 3.1-23.1 8.8L96 160 48 160c-26.5 0-48 21.5-48 48l0 96c0 26.5 21.5 48 48 48zM441.1 107c-10.3-8.4-25.4-6.8-33.8 3.5s-6.8 25.4 3.5 33.8C443.3 170.7 464 210.9 464 256s-20.7 85.3-53.2 111.8c-10.3 8.4-11.8 23.5-3.5 33.8s23.5 11.8 33.8 3.5c43.2-35.2 70.9-88.9 70.9-149s-27.7-113.8-70.9-149zm-60.5 74.5c-10.3-8.4-25.4-6.8-33.8 3.5s-6.8 25.4 3.5 33.8C361.1 227.6 368 241 368 256s-6.9 28.4-17.7 37.3c-10.3 8.4-11.8 23.5-3.5 33.8s23.5 11.8 33.8 3.5C402.1 312.9 416 286.1 416 256s-13.9-56.9-35.5-74.5z"/></svg>`,
      "volume-low": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M48 352l48 0 134.1 119.2c6.4 5.7 14.6 8.8 23.1 8.8 19.2 0 34.8-15.6 34.8-34.8l0-378.4c0-19.2-15.6-34.8-34.8-34.8-8.5 0-16.7 3.1-23.1 8.8L96 160 48 160c-26.5 0-48 21.5-48 48l0 96c0 26.5 21.5 48 48 48zM380.6 181.5c-10.3-8.4-25.4-6.8-33.8 3.5s-6.8 25.4 3.5 33.8C361.1 227.6 368 241 368 256s-6.9 28.4-17.7 37.3c-10.3 8.4-11.8 23.5-3.5 33.8s23.5 11.8 33.8 3.5C402.1 312.9 416 286.1 416 256s-13.9-56.9-35.5-74.5z"/></svg>`,
      "volume-xmark": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M48 352l48 0 134.1 119.2c6.4 5.7 14.6 8.8 23.1 8.8 19.2 0 34.8-15.6 34.8-34.8l0-378.4c0-19.2-15.6-34.8-34.8-34.8-8.5 0-16.7 3.1-23.1 8.8L96 160 48 160c-26.5 0-48 21.5-48 48l0 96c0 26.5 21.5 48 48 48zM367 175c-9.4 9.4-9.4 24.6 0 33.9l47 47-47 47c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l47-47 47 47c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-47-47 47-47c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-47 47-47-47c-9.4-9.4-24.6-9.4-33.9 0z"/></svg>`,
      xmark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M55.1 73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L147.2 256 9.9 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192.5 301.3 329.9 438.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.8 256 375.1 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192.5 210.7 55.1 73.4z"/></svg>`
    },
    //
    // Regular variant
    //
    regular: {
      calendar: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M216 64C229.3 64 240 74.7 240 88L240 128L400 128L400 88C400 74.7 410.7 64 424 64C437.3 64 448 74.7 448 88L448 128L480 128C515.3 128 544 156.7 544 192L544 480C544 515.3 515.3 544 480 544L160 544C124.7 544 96 515.3 96 480L96 192C96 156.7 124.7 128 160 128L192 128L192 88C192 74.7 202.7 64 216 64zM216 176L160 176C151.2 176 144 183.2 144 192L144 240L496 240L496 192C496 183.2 488.8 176 480 176L216 176zM144 288L144 480C144 488.8 151.2 496 160 496L480 496C488.8 496 496 488.8 496 480L496 288L144 288z"/></svg>`,
      "circle-question": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M464 256a208 208 0 1 0 -416 0 208 208 0 1 0 416 0zM0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0zm256-80c-17.7 0-32 14.3-32 32 0 13.3-10.7 24-24 24s-24-10.7-24-24c0-44.2 35.8-80 80-80s80 35.8 80 80c0 47.2-36 67.2-56 74.5l0 3.8c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-8.1c0-20.5 14.8-35.2 30.1-40.2 6.4-2.1 13.2-5.5 18.2-10.3 4.3-4.2 7.7-10 7.7-19.6 0-17.7-14.3-32-32-32zM224 368a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg>`,
      "circle-xmark": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464a256 256 0 1 0 0-512 256 256 0 1 0 0 512zM167 167c-9.4 9.4-9.4 24.6 0 33.9l55 55-55 55c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l55-55 55 55c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-55-55 55-55c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-55 55-55-55c-9.4-9.4-24.6-9.4-33.9 0z"/></svg>`,
      clock: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M528 320C528 434.9 434.9 528 320 528C205.1 528 112 434.9 112 320C112 205.1 205.1 112 320 112C434.9 112 528 205.1 528 320zM64 320C64 461.4 178.6 576 320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320zM296 184L296 320C296 328 300 335.5 306.7 340L402.7 404C413.7 411.4 428.6 408.4 436 397.3C443.4 386.2 440.4 371.4 429.3 364L344 307.2L344 184C344 170.7 333.3 160 320 160C306.7 160 296 170.7 296 184z"/></svg>`,
      copy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M384 336l-192 0c-8.8 0-16-7.2-16-16l0-256c0-8.8 7.2-16 16-16l133.5 0c4.2 0 8.3 1.7 11.3 4.7l58.5 58.5c3 3 4.7 7.1 4.7 11.3L400 320c0 8.8-7.2 16-16 16zM192 384l192 0c35.3 0 64-28.7 64-64l0-197.5c0-17-6.7-33.3-18.7-45.3L370.7 18.7C358.7 6.7 342.5 0 325.5 0L192 0c-35.3 0-64 28.7-64 64l0 256c0 35.3 28.7 64 64 64zM64 128c-35.3 0-64 28.7-64 64L0 448c0 35.3 28.7 64 64 64l192 0c35.3 0 64-28.7 64-64l0-16-48 0 0 16c0 8.8-7.2 16-16 16L64 464c-8.8 0-16-7.2-16-16l0-256c0-8.8 7.2-16 16-16l16 0 0-48-16 0z"/></svg>`,
      eye: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M288 80C222.8 80 169.2 109.6 128.1 147.7 89.6 183.5 63 226 49.4 256 63 286 89.6 328.5 128.1 364.3 169.2 402.4 222.8 432 288 432s118.8-29.6 159.9-67.7C486.4 328.5 513 286 526.6 256 513 226 486.4 183.5 447.9 147.7 406.8 109.6 353.2 80 288 80zM95.4 112.6C142.5 68.8 207.2 32 288 32s145.5 36.8 192.6 80.6c46.8 43.5 78.1 95.4 93 131.1 3.3 7.9 3.3 16.7 0 24.6-14.9 35.7-46.2 87.7-93 131.1-47.1 43.7-111.8 80.6-192.6 80.6S142.5 443.2 95.4 399.4c-46.8-43.5-78.1-95.4-93-131.1-3.3-7.9-3.3-16.7 0-24.6 14.9-35.7 46.2-87.7 93-131.1zM288 336c44.2 0 80-35.8 80-80 0-29.6-16.1-55.5-40-69.3-1.4 59.7-49.6 107.9-109.3 109.3 13.8 23.9 39.7 40 69.3 40zm-79.6-88.4c2.5 .3 5 .4 7.6 .4 35.3 0 64-28.7 64-64 0-2.6-.2-5.1-.4-7.6-37.4 3.9-67.2 33.7-71.1 71.1zm45.6-115c10.8-3 22.2-4.5 33.9-4.5 8.8 0 17.5 .9 25.8 2.6 .3 .1 .5 .1 .8 .2 57.9 12.2 101.4 63.7 101.4 125.2 0 70.7-57.3 128-128 128-61.6 0-113-43.5-125.2-101.4-1.8-8.6-2.8-17.5-2.8-26.6 0-11 1.4-21.8 4-32 .2-.7 .3-1.3 .5-1.9 11.9-43.4 46.1-77.6 89.5-89.5z"/></svg>`,
      "eye-slash": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M41-24.9c-9.4-9.4-24.6-9.4-33.9 0S-2.3-.3 7 9.1l528 528c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-96.4-96.4c2.7-2.4 5.4-4.8 8-7.2 46.8-43.5 78.1-95.4 93-131.1 3.3-7.9 3.3-16.7 0-24.6-14.9-35.7-46.2-87.7-93-131.1-47.1-43.7-111.8-80.6-192.6-80.6-56.8 0-105.6 18.2-146 44.2L41-24.9zM176.9 111.1c32.1-18.9 69.2-31.1 111.1-31.1 65.2 0 118.8 29.6 159.9 67.7 38.5 35.7 65.1 78.3 78.6 108.3-13.6 30-40.2 72.5-78.6 108.3-3.1 2.8-6.2 5.6-9.4 8.4L393.8 328c14-20.5 22.2-45.3 22.2-72 0-70.7-57.3-128-128-128-26.7 0-51.5 8.2-72 22.2l-39.1-39.1zm182 182l-108-108c11.1-5.8 23.7-9.1 37.1-9.1 44.2 0 80 35.8 80 80 0 13.4-3.3 26-9.1 37.1zM103.4 173.2l-34-34c-32.6 36.8-55 75.8-66.9 104.5-3.3 7.9-3.3 16.7 0 24.6 14.9 35.7 46.2 87.7 93 131.1 47.1 43.7 111.8 80.6 192.6 80.6 37.3 0 71.2-7.9 101.5-20.6L352.2 422c-20 6.4-41.4 10-64.2 10-65.2 0-118.8-29.6-159.9-67.7-38.5-35.7-65.1-78.3-78.6-108.3 10.4-23.1 28.6-53.6 54-82.8z"/></svg>`,
      star: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M288.1-32c9 0 17.3 5.1 21.4 13.1L383 125.3 542.9 150.7c8.9 1.4 16.3 7.7 19.1 16.3s.5 18-5.8 24.4L441.7 305.9 467 465.8c1.4 8.9-2.3 17.9-9.6 23.2s-17 6.1-25 2L288.1 417.6 143.8 491c-8 4.1-17.7 3.3-25-2s-11-14.2-9.6-23.2L134.4 305.9 20 191.4c-6.4-6.4-8.6-15.8-5.8-24.4s10.1-14.9 19.1-16.3l159.9-25.4 73.6-144.2c4.1-8 12.4-13.1 21.4-13.1zm0 76.8L230.3 158c-3.5 6.8-10 11.6-17.6 12.8l-125.5 20 89.8 89.9c5.4 5.4 7.9 13.1 6.7 20.7l-19.8 125.5 113.3-57.6c6.8-3.5 14.9-3.5 21.8 0l113.3 57.6-19.8-125.5c-1.2-7.6 1.3-15.3 6.7-20.7l89.8-89.9-125.5-20c-7.6-1.2-14.1-6-17.6-12.8L288.1 44.8z"/></svg>`
    }
  };
  var systemLibrary = {
    name: "system",
    resolver: (name, _family = "classic", variant = "solid") => {
      let collection = icons[variant];
      let svg = collection[name] ?? icons.regular[name] ?? icons.regular["circle-question"];
      if (svg) {
        return dataUri(svg);
      }
      return "";
    },
    mutator: (svg) => {
      if (!svg.hasAttribute("fill")) {
        svg.setAttribute("fill", "currentColor");
      }
    }
  };
  var library_system_default = systemLibrary;

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.UDRJMWVZ.js
  var defaultIconFamily = "classic";
  var registry = [library_default_default, library_system_default];
  var watchedIcons = /* @__PURE__ */ new Set();
  function watchIcon(icon) {
    watchedIcons.add(icon);
  }
  function unwatchIcon(icon) {
    watchedIcons.delete(icon);
  }
  function getIconLibrary(name) {
    return registry.find((lib) => lib.name === name);
  }
  function getDefaultIconFamily() {
    return defaultIconFamily;
  }

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.JAAVYFGY.js
  var CACHEABLE_ERROR = Symbol();
  var RETRYABLE_ERROR = Symbol();
  var parser;
  var iconCache = /* @__PURE__ */ new Map();
  var WaIcon = class extends WebAwesomeElement {
    constructor() {
      super(...arguments);
      this.svg = null;
      this.autoWidth = false;
      this.swapOpacity = false;
      this.label = "";
      this.library = "default";
      this.rotate = 0;
      this.resolveIcon = async (url, library2) => {
        let fileData;
        if (library2?.spriteSheet) {
          if (!this.hasUpdated) {
            await this.updateComplete;
          }
          this.svg = b2`<svg part="svg">
        <use part="use" href="${url}"></use>
      </svg>`;
          await this.updateComplete;
          const svg = this.shadowRoot.querySelector("[part='svg']");
          if (typeof library2.mutator === "function") {
            library2.mutator(svg, this);
          }
          return this.svg;
        }
        try {
          fileData = await fetch(url, { mode: "cors" });
          if (!fileData.ok) return fileData.status === 410 ? CACHEABLE_ERROR : RETRYABLE_ERROR;
        } catch {
          return RETRYABLE_ERROR;
        }
        try {
          const div = document.createElement("div");
          div.innerHTML = await fileData.text();
          const svg = div.firstElementChild;
          if (svg?.tagName?.toLowerCase() !== "svg") return CACHEABLE_ERROR;
          if (!parser) parser = new DOMParser();
          const doc = parser.parseFromString(svg.outerHTML, "text/html");
          const svgEl = doc.body.querySelector("svg");
          if (!svgEl) return CACHEABLE_ERROR;
          svgEl.part.add("svg");
          return document.adoptNode(svgEl);
        } catch {
          return CACHEABLE_ERROR;
        }
      };
    }
    connectedCallback() {
      super.connectedCallback();
      watchIcon(this);
    }
    firstUpdated(changedProperties) {
      super.firstUpdated(changedProperties);
      if (this.hasAttribute("rotate")) {
        this.style.setProperty("--rotate-angle", `${this.rotate}deg`);
      }
      this.setIcon();
    }
    disconnectedCallback() {
      super.disconnectedCallback();
      unwatchIcon(this);
    }
    async getIconSource() {
      const library2 = getIconLibrary(this.library);
      const family = this.family || getDefaultIconFamily();
      if (this.name && library2) {
        const autoWidth = this.canvas === "auto" || this.autoWidth;
        let url;
        try {
          url = await library2.resolver(this.name, family, this.variant, autoWidth);
        } catch {
          url = void 0;
        }
        return { url, fromLibrary: true };
      }
      return {
        url: this.src,
        fromLibrary: false
      };
    }
    handleLabelChange() {
      const hasLabel = typeof this.label === "string" && this.label.length > 0;
      if (hasLabel) {
        this.setAttribute("role", "img");
        this.setAttribute("aria-label", this.label);
        this.removeAttribute("aria-hidden");
      } else {
        this.removeAttribute("role");
        this.removeAttribute("aria-label");
        this.setAttribute("aria-hidden", "true");
      }
    }
    async setIcon() {
      const { url, fromLibrary } = await this.getIconSource();
      const library2 = fromLibrary ? getIconLibrary(this.library) : void 0;
      if (!url) {
        this.svg = null;
        return;
      }
      let iconResolver = iconCache.get(url);
      if (!iconResolver) {
        iconResolver = this.resolveIcon(url, library2);
        iconCache.set(url, iconResolver);
      }
      const svg = await iconResolver;
      if (svg === RETRYABLE_ERROR) {
        iconCache.delete(url);
      }
      const sourceAfterFetch = await this.getIconSource();
      if (url !== sourceAfterFetch.url) {
        return;
      }
      if (l3(svg)) {
        this.svg = svg;
        return;
      }
      switch (svg) {
        case RETRYABLE_ERROR:
        case CACHEABLE_ERROR:
          this.svg = null;
          this.dispatchEvent(new WaErrorEvent());
          break;
        default:
          this.svg = svg.cloneNode(true);
          library2?.mutator?.(this.svg, this);
          this.dispatchEvent(new WaLoadEvent());
      }
    }
    willUpdate(changedProperties) {
      if (!this.style) {
        this.setStyleProperty("--rotate-angle", `${this.rotate}deg`);
      }
      return super.willUpdate(changedProperties);
    }
    updated(changedProperties) {
      super.updated(changedProperties);
      const library2 = getIconLibrary(this.library);
      if (this.hasAttribute("rotate")) {
        this.style.setProperty("--rotate-angle", `${this.rotate}deg`);
      }
      const svg = this.shadowRoot?.querySelector("svg");
      if (svg) {
        library2?.mutator?.(svg, this);
      }
    }
    render() {
      if (this.hasUpdated) {
        return this.svg;
      }
      return b2`<svg part="svg" width="16" height="16" viewBox="0 0 16 16"></svg>`;
    }
  };
  WaIcon.css = icon_styles_default;
  __decorateClass([
    r6()
  ], WaIcon.prototype, "svg", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaIcon.prototype, "name", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaIcon.prototype, "family", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaIcon.prototype, "variant", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaIcon.prototype, "canvas", 2);
  __decorateClass([
    n4({ attribute: "auto-width", type: Boolean, reflect: true })
  ], WaIcon.prototype, "autoWidth", 2);
  __decorateClass([
    n4({ attribute: "swap-opacity", type: Boolean, reflect: true })
  ], WaIcon.prototype, "swapOpacity", 2);
  __decorateClass([
    n4()
  ], WaIcon.prototype, "src", 2);
  __decorateClass([
    n4()
  ], WaIcon.prototype, "label", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaIcon.prototype, "library", 2);
  __decorateClass([
    n4({ type: Number, reflect: true })
  ], WaIcon.prototype, "rotate", 2);
  __decorateClass([
    n4({ type: String, reflect: true })
  ], WaIcon.prototype, "flip", 2);
  __decorateClass([
    n4({ type: String, reflect: true })
  ], WaIcon.prototype, "animation", 2);
  __decorateClass([
    watch("label")
  ], WaIcon.prototype, "handleLabelChange", 1);
  __decorateClass([
    watch(["family", "name", "library", "variant", "src", "autoWidth", "canvas", "swapOpacity"], {
      waitUntilFirstUpdate: true
    })
  ], WaIcon.prototype, "setIcon", 1);
  WaIcon = __decorateClass([
    t5("wa-icon")
  ], WaIcon);

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.IOB2JHMR.js
  var textarea_styles_default = i`
  :host {
    border-width: 0;
  }

  .textarea {
    display: grid;
    align-items: center;
    margin: 0;
    border: none;
    outline: none;
    cursor: inherit;
    font: inherit;
    background-color: var(--wa-form-control-background-color);
    border-color: var(--wa-form-control-border-color);
    border-radius: var(--wa-form-control-border-radius);
    border-style: var(--wa-form-control-border-style);
    border-width: var(--wa-form-control-border-width);
    -webkit-appearance: none;
    outline: var(--wa-focus-ring-style) var(--wa-focus-ring-width) transparent;
    outline-offset: var(--wa-focus-ring-offset);

    &:focus-within {
      outline-color: var(--wa-color-focus);
    }

    /* Style disabled textareas */
    &:has(:disabled) {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  /* Appearance modifiers */
  :host([appearance='outlined']) .textarea {
    background-color: var(--wa-form-control-background-color);
    border-color: var(--wa-form-control-border-color);
  }

  :host([appearance='filled']) .textarea {
    background-color: var(--wa-color-neutral-fill-quiet);
    border-color: var(--wa-color-neutral-fill-quiet);
  }

  :host([appearance='filled-outlined']) .textarea {
    background-color: var(--wa-color-neutral-fill-quiet);
    border-color: var(--wa-form-control-border-color);
  }

  textarea {
    display: block;
    width: 100%;
    border: none;
    background: transparent;
    font: inherit;
    color: inherit;
    cursor: inherit;
    scroll-padding-block: var(--wa-form-control-padding-block);
    padding: calc(var(--wa-form-control-padding-block) - ((1lh - 1em) / 2)) var(--wa-form-control-padding-inline); /* accounts for the larger line height of textarea content */
    min-height: calc(var(--wa-form-control-height) - var(--border-width) * 2);
    box-shadow: none;
    margin: 0;

    &::placeholder {
      color: var(--wa-form-control-placeholder-color);
      user-select: none;
      -webkit-user-select: none;
    }

    &:autofill {
      &,
      &:hover,
      &:focus,
      &:active {
        box-shadow: none;
        caret-color: var(--wa-form-control-value-color);
      }
    }

    &:focus {
      outline: none;
    }
  }

  /* Shared textarea and size-adjuster positioning */
  .control,
  .size-adjuster {
    grid-area: 1 / 1 / 2 / 2;
  }

  .size-adjuster {
    visibility: hidden;
    pointer-events: none;
    opacity: 0;
    padding: 0;
  }

  textarea::-webkit-search-decoration,
  textarea::-webkit-search-cancel-button,
  textarea::-webkit-search-results-button,
  textarea::-webkit-search-results-decoration {
    -webkit-appearance: none;
  }

  /*
   * Resize types
   */

  :host([resize='none']) textarea {
    resize: none;
  }

  textarea,
  :host([resize='vertical']) textarea {
    resize: vertical;
  }

  :host([resize='horizontal']) textarea {
    resize: horizontal;
  }

  :host([resize='both']) textarea {
    resize: both;
  }

  :host([resize='auto']) textarea {
    height: auto;
    resize: none;
    overflow-y: hidden;
  }

  /*
   * Footer (hint + character count)
   */

  /*
   * This element carries the hint part, so the shared form control styles apply to it. Those styles set display:block
   * and hide the element when it has no hint, both of which have to be undone when a character count is present.
   */
  .footer.has-slotted,
  .footer.has-count {
    display: flex;
    align-items: baseline;
    gap: 1em;
  }

  /* Slots default to display:contents, which would leave the hint unable to shrink below its content */
  .footer.has-count .hint {
    display: block;
    flex: 1 1 auto;
    min-width: 0;
  }

  .count {
    flex: 0 0 auto;
    color: var(--wa-form-control-hint-color);
    font-weight: var(--wa-form-control-hint-font-weight);
    line-height: var(--wa-form-control-hint-line-height);
    margin-block-start: 0.5em;
    font-size: var(--wa-font-size-smaller);
    margin-inline-start: auto;
  }
`;

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.HEEBTYY6.js
  var visually_hidden_styles_default = i`
  .wa-visually-hidden:not(:focus-within),
  .wa-visually-hidden-force,
  .wa-visually-hidden-hint::part(hint),
  .wa-visually-hidden-label::part(label),
  .wa-visually-hidden-label::part(form-control-label) {
    top: 0px !important;
    left: 0px !important;
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    clip: rect(0 0 0 0) !important;
    clip-path: inset(50%) !important;
    border: none !important;
    overflow: hidden !important;
    white-space: nowrap !important;
    padding: 0 !important;
  }
`;

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.GSQEF3SC.js
  var WaTextarea = class extends WebAwesomeFormAssociatedElement {
    constructor() {
      super(...arguments);
      this.assumeInteractionOn = ["blur", "input"];
      this.hasSlotController = new HasSlotController(this, "hint", "label");
      this.localize = new LocalizeController2(this);
      this.announcedCountText = "";
      this.title = "";
      this.name = null;
      this._value = null;
      this.defaultValue = this.getAttribute("value") ?? "";
      this.size = "m";
      this.appearance = "outlined";
      this.label = "";
      this.hint = "";
      this.placeholder = "";
      this.rows = 4;
      this.resize = "vertical";
      this.disabled = false;
      this.readonly = false;
      this.required = false;
      this.spellcheck = true;
      this.withLabel = false;
      this.withHint = false;
      this.withCount = false;
      this.lastObservedWidth = 0;
    }
    static get validators() {
      return [...super.validators, MirrorValidator()];
    }
    /** The current value of the input, submitted as a name/value pair with form data. */
    get value() {
      if (this.valueHasChanged) {
        return this._value;
      }
      return this._value ?? this.defaultValue;
    }
    set value(val) {
      if (this._value === val) {
        return;
      }
      this.valueHasChanged = true;
      this._value = val;
    }
    handleSizeChange() {
      warnDeprecatedSize(this.localName, this.size);
    }
    connectedCallback() {
      super.connectedCallback();
      this.updateComplete.then(() => {
        this.setTextareaDimensions();
        this.updateResizeObserver();
        if (this.didSSR && this.input && this.value !== this.input.value) {
          const value = this.input.value;
          this.value = value;
        }
      });
    }
    disconnectedCallback() {
      super.disconnectedCallback();
      clearTimeout(this.countAnnounceTimeout);
      this.resizeObserver?.disconnect();
      this.resizeObserver = void 0;
    }
    /**
     * @internal
     */
    updateFormValue(value) {
      if (value == null) {
        this.setValue("", null);
        return;
      }
      super.updateFormValue(value);
    }
    /** Creates or destroys the resize observer based on the current resize mode. */
    updateResizeObserver() {
      const needsObserver = this.resize !== "none";
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = void 0;
      }
      if (needsObserver && this.input) {
        if (this.resize === "auto") {
          this.resizeObserver = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width ?? 0;
            if (width !== this.lastObservedWidth) {
              this.lastObservedWidth = width;
              requestAnimationFrame(() => this.setTextareaDimensions());
            }
          });
          this.resizeObserver.observe(this);
        } else {
          this.resizeObserver = new ResizeObserver(() => this.setTextareaDimensions());
          this.resizeObserver.observe(this.input);
        }
      }
    }
    handleBlur() {
      this.checkValidity();
    }
    handleChange(event) {
      this.valueHasChanged = true;
      this.value = this.input.value;
      this.setTextareaDimensions();
      this.checkValidity();
      this.relayNativeEvent(event, { bubbles: true, composed: true });
    }
    handleInput(event) {
      this.valueHasChanged = true;
      this.value = this.input.value;
      this.relayNativeEvent(event, { bubbles: true, composed: true });
      this.scheduleCountAnnouncement();
    }
    scheduleCountAnnouncement() {
      clearTimeout(this.countAnnounceTimeout);
      this.countAnnounceTimeout = setTimeout(() => {
        const currentLength = (this.value ?? "").length;
        this.announcedCountText = this.maxlength != null ? this.localize.term("numCharactersRemaining", this.maxlength - currentLength) : this.localize.term("numCharacters", currentLength);
      }, 1e3);
    }
    setTextareaDimensions() {
      if (this.resize === "none") {
        this.base.style.width = ``;
        this.base.style.height = ``;
        return;
      }
      if (this.resize === "auto") {
        this.sizeAdjuster.style.height = `${this.input.clientHeight}px`;
        this.input.style.height = "auto";
        const newHeight = this.input.scrollHeight;
        this.input.style.height = `${newHeight}px`;
        this.sizeAdjuster.style.height = `${newHeight}px`;
        this.base.style.width = ``;
        this.base.style.height = ``;
        return;
      }
      if (this.input.style.width) {
        const width = Number(this.input.style.width.split(/px/)[0]) + 2;
        this.base.style.width = `${width}px`;
      }
      if (this.input.style.height) {
        const height = Number(this.input.style.height.split(/px/)[0]) + 2;
        this.base.style.height = `${height}px`;
      }
    }
    handleRowsChange() {
      this.setTextareaDimensions();
    }
    async handleValueChange() {
      await this.updateComplete;
      this.checkValidity();
      this.setTextareaDimensions();
    }
    updated(changedProperties) {
      if (changedProperties.has("resize")) {
        this.setTextareaDimensions();
        this.updateResizeObserver();
      }
      super.updated(changedProperties);
      if (changedProperties.has("value")) {
        this.customStates.set("blank", !this.value);
      }
    }
    /** Sets focus on the textarea. */
    focus(options) {
      this.input.focus(options);
    }
    /** Removes focus from the textarea. */
    blur() {
      this.input.blur();
    }
    /** Selects all the text in the textarea. */
    select() {
      this.input.select();
    }
    /** Gets or sets the textarea's scroll position. */
    scrollPosition(position) {
      if (position) {
        if (typeof position.top === "number") this.input.scrollTop = position.top;
        if (typeof position.left === "number") this.input.scrollLeft = position.left;
        return void 0;
      }
      return {
        top: this.input.scrollTop,
        left: this.input.scrollTop
      };
    }
    /** Sets the start and end positions of the text selection (0-based). */
    setSelectionRange(selectionStart, selectionEnd, selectionDirection = "none") {
      this.input.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
    }
    /** Replaces a range of text with a new string. */
    setRangeText(replacement, start, end, selectMode = "preserve") {
      const selectionStart = start ?? this.input.selectionStart;
      const selectionEnd = end ?? this.input.selectionEnd;
      this.input.setRangeText(replacement, selectionStart, selectionEnd, selectMode);
      if (this.value !== this.input.value) {
        this.value = this.input.value;
        this.setTextareaDimensions();
      }
    }
    formResetCallback() {
      this._value = null;
      if (this.input) {
        this.input.value = this.value || "";
      }
      super.formResetCallback();
    }
    render() {
      const hasLabelSlot = this.hasSlotController.test("label", "withLabel");
      const hasHintSlot = this.hasSlotController.test("hint", "withHint");
      const hasLabel = this.label ? true : !!hasLabelSlot;
      const hasHint = this.hint ? true : !!hasHintSlot;
      const currentLength = (this.value ?? "").length;
      const countText = this.maxlength != null ? this.localize.term("numCharactersRemaining", this.maxlength - currentLength) : this.localize.term("numCharacters", currentLength);
      return b2`
      <label
        part="form-control-label label"
        class=${e7({
        label: true,
        "has-label": hasLabel
      })}
        for="input"
        aria-hidden=${hasLabel ? "false" : "true"}
      >
        <slot name="label">${this.label}</slot>
      </label>

      <div part="base textarea-wrapper" class="textarea">
        <textarea
          part="textarea"
          id="input"
          class="control"
          title=${this.title}
          name=${o7(this.name)}
          .value=${l4(this.value)}
          ?disabled=${this.disabled}
          ?readonly=${this.readonly}
          ?required=${this.required}
          placeholder=${o7(this.placeholder)}
          rows=${o7(this.rows)}
          minlength=${o7(this.minlength)}
          maxlength=${o7(this.maxlength)}
          autocapitalize=${o7(this.autocapitalize)}
          autocorrect=${o7(this.autocorrect)}
          ?autofocus=${this.autofocus}
          spellcheck=${o7(this.spellcheck)}
          enterkeyhint=${o7(this.enterkeyhint)}
          inputmode=${o7(this.inputmode)}
          aria-describedby="hint"
          @change=${this.handleChange}
          @input=${this.handleInput}
          @blur=${this.handleBlur}
        ></textarea>

        <!-- This "adjuster" exists to prevent layout shifting. https://github.com/shoelace-style/shoelace/issues/2180 -->
        <div part="textarea-adjuster" class="size-adjuster" ?hidden=${this.resize !== "auto"}></div>
      </div>

      <div
        part="hint"
        class=${e7({
        footer: true,
        "has-count": this.withCount,
        "has-slotted": hasHint
      })}
      >
        <slot id="hint" name="hint" class="hint" aria-hidden=${hasHint ? "false" : "true"}>${this.hint}</slot>

        ${this.withCount ? b2`
              <div part="count" class="count" aria-hidden="true">${countText}</div>
              <div class="wa-visually-hidden-force" aria-live="polite">${this.announcedCountText}</div>
            ` : ""}
      </div>
    `;
    }
  };
  WaTextarea.css = [textarea_styles_default, form_control_styles_default, size_styles_default, visually_hidden_styles_default];
  __decorateClass([
    r6()
  ], WaTextarea.prototype, "announcedCountText", 2);
  __decorateClass([
    e6(".control")
  ], WaTextarea.prototype, "input", 2);
  __decorateClass([
    e6('[part~="base"]')
  ], WaTextarea.prototype, "base", 2);
  __decorateClass([
    e6(".size-adjuster")
  ], WaTextarea.prototype, "sizeAdjuster", 2);
  __decorateClass([
    n4()
  ], WaTextarea.prototype, "title", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaTextarea.prototype, "name", 2);
  __decorateClass([
    r6()
  ], WaTextarea.prototype, "value", 1);
  __decorateClass([
    n4({ attribute: "value", reflect: true })
  ], WaTextarea.prototype, "defaultValue", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaTextarea.prototype, "size", 2);
  __decorateClass([
    watch("size")
  ], WaTextarea.prototype, "handleSizeChange", 1);
  __decorateClass([
    n4({ reflect: true })
  ], WaTextarea.prototype, "appearance", 2);
  __decorateClass([
    n4()
  ], WaTextarea.prototype, "label", 2);
  __decorateClass([
    n4({ attribute: "hint" })
  ], WaTextarea.prototype, "hint", 2);
  __decorateClass([
    n4()
  ], WaTextarea.prototype, "placeholder", 2);
  __decorateClass([
    n4({ type: Number })
  ], WaTextarea.prototype, "rows", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaTextarea.prototype, "resize", 2);
  __decorateClass([
    n4({ type: Boolean })
  ], WaTextarea.prototype, "disabled", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaTextarea.prototype, "readonly", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaTextarea.prototype, "required", 2);
  __decorateClass([
    n4({ type: Number })
  ], WaTextarea.prototype, "minlength", 2);
  __decorateClass([
    n4({ type: Number })
  ], WaTextarea.prototype, "maxlength", 2);
  __decorateClass([
    n4()
  ], WaTextarea.prototype, "autocapitalize", 2);
  __decorateClass([
    n4({
      type: Boolean,
      converter: {
        fromAttribute: (value) => !value || value === "off" ? false : true,
        toAttribute: (value) => value ? "on" : "off"
      }
    })
  ], WaTextarea.prototype, "autocorrect", 2);
  __decorateClass([
    n4()
  ], WaTextarea.prototype, "autocomplete", 2);
  __decorateClass([
    n4({ type: Boolean })
  ], WaTextarea.prototype, "autofocus", 2);
  __decorateClass([
    n4()
  ], WaTextarea.prototype, "enterkeyhint", 2);
  __decorateClass([
    n4({
      type: Boolean,
      converter: {
        // Allow "true|false" attribute values but keep the property boolean
        fromAttribute: (value) => !value || value === "false" ? false : true,
        toAttribute: (value) => value ? "true" : "false"
      }
    })
  ], WaTextarea.prototype, "spellcheck", 2);
  __decorateClass([
    n4()
  ], WaTextarea.prototype, "inputmode", 2);
  __decorateClass([
    n4({ attribute: "with-label", type: Boolean })
  ], WaTextarea.prototype, "withLabel", 2);
  __decorateClass([
    n4({ attribute: "with-hint", type: Boolean })
  ], WaTextarea.prototype, "withHint", 2);
  __decorateClass([
    n4({ attribute: "with-count", type: Boolean, reflect: true })
  ], WaTextarea.prototype, "withCount", 2);
  __decorateClass([
    watch("rows", { waitUntilFirstUpdate: true })
  ], WaTextarea.prototype, "handleRowsChange", 1);
  __decorateClass([
    watch("value", { waitUntilFirstUpdate: true })
  ], WaTextarea.prototype, "handleValueChange", 1);
  WaTextarea = __decorateClass([
    t5("wa-textarea")
  ], WaTextarea);
  WaTextarea.disableWarning?.("change-in-update");

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.YB6263IP.js
  var checkbox_styles_default = i`
  :host {
    --checked-icon-color: var(--wa-color-brand-on-loud);
    --checked-icon-scale: 0.8;

    display: inline-flex;
    color: var(--wa-form-control-value-color);
    font-family: inherit;
    font-weight: var(--wa-form-control-value-font-weight);
    line-height: var(--wa-form-control-value-line-height);
    user-select: none;
    -webkit-user-select: none;
  }

  [part~='control'] {
    display: inline-flex;
    flex: 0 0 auto;
    position: relative;
    align-items: center;
    justify-content: center;
    width: var(--wa-form-control-toggle-size);
    height: var(--wa-form-control-toggle-size);
    border-color: var(--wa-form-control-border-color);
    border-radius: min(
      calc(var(--wa-form-control-toggle-size) * 0.375),
      var(--wa-border-radius-s)
    ); /* min prevents entirely circular checkbox */
    border-style: var(--wa-border-style);
    border-width: var(--wa-form-control-border-width);
    background-color: var(--wa-form-control-background-color);
    transition:
      background var(--wa-transition-normal),
      border-color var(--wa-transition-fast),
      box-shadow var(--wa-transition-fast),
      color var(--wa-transition-fast);
    transition-timing-function: var(--wa-transition-easing);

    margin-inline-end: 0.5em;
  }

  [part~='base'] {
    display: flex;
    align-items: flex-start;
    position: relative;
    color: currentColor;
    vertical-align: middle;
    cursor: pointer;
  }

  [part~='label'] {
    display: inline;
  }

  /* Checked */
  [part~='control']:has(:checked, :indeterminate) {
    color: var(--checked-icon-color);
    border-color: var(--wa-form-control-activated-color);
    background-color: var(--wa-form-control-activated-color);
  }

  /* Focus */
  [part~='control']:has(> input:focus-visible:not(:disabled)) {
    outline: var(--wa-focus-ring);
    outline-offset: var(--wa-focus-ring-offset);
  }

  /* Disabled */
  :host [part~='base']:has(input:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  input {
    position: absolute;
    padding: 0;
    margin: 0;
    height: 100%;
    width: 100%;
    opacity: 0;
    pointer-events: none;
  }

  [part~='icon'] {
    display: flex;
    scale: var(--checked-icon-scale);

    /* Without this, Safari renders the icon slightly to the left */
    &::part(svg) {
      translate: 0.0009765625em;
    }

    input:not(:checked, :indeterminate) + & {
      visibility: hidden;
    }
  }

  :host([required]) [part~='label']::after {
    content: var(--wa-form-control-required-content);
    color: var(--wa-form-control-required-content-color);
    margin-inline-start: var(--wa-form-control-required-content-offset);
  }
`;

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.GWSUX3V5.js
  var RequiredValidator = (options = {}) => {
    let { validationElement, validationProperty } = options;
    if (!validationElement) {
      if (typeof document !== "undefined" && "createElement" in document) {
        validationElement = Object.assign(document.createElement("input"), { required: true });
      }
    }
    if (!validationProperty) {
      validationProperty = "value";
    }
    const obj = {
      observedAttributes: ["required"],
      message: validationElement?.validationMessage,
      // @TODO: Add a translation.
      checkValidity(element) {
        const validity = {
          message: "",
          isValid: true,
          invalidKeys: []
        };
        const isRequired = element.required ?? element.hasAttribute("required");
        if (!isRequired) {
          return validity;
        }
        const value = element[validationProperty];
        const isEmpty = !value;
        if (isEmpty) {
          validity.message = typeof obj.message === "function" ? obj.message(element) : obj.message || "";
          validity.isValid = false;
          validity.invalidKeys.push("valueMissing");
        }
        return validity;
      }
    };
    return obj;
  };

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.PFQEHEIR.js
  var WaCheckbox = class extends WebAwesomeFormAssociatedElement {
    constructor() {
      super(...arguments);
      this.hasSlotController = new HasSlotController(this, "hint");
      this.title = "";
      this._value = this.getAttribute("value") ?? null;
      this.size = "m";
      this.disabled = false;
      this.indeterminate = false;
      this._checked = null;
      this.defaultChecked = this.hasAttribute("checked");
      this.required = false;
      this.hint = "";
    }
    static get validators() {
      const validators = o5 ? [] : [
        RequiredValidator({
          validationProperty: "checked",
          // Use a checkbox so we get "free" translation strings.
          validationElement: Object.assign(document.createElement("input"), {
            type: "checkbox",
            required: true
          })
        })
      ];
      return [...super.validators, ...validators];
    }
    /** The value of the checkbox, submitted as a name/value pair with form data. */
    get value() {
      return this._value ?? "on";
    }
    set value(val) {
      this._value = val;
    }
    handleSizeChange() {
      warnDeprecatedSize(this.localName, this.size);
    }
    get checked() {
      if (this.valueHasChanged) {
        return Boolean(this._checked);
      }
      return this._checked ?? this.defaultChecked;
    }
    set checked(val) {
      this._checked = Boolean(val);
      this.valueHasChanged = true;
    }
    handleClick() {
      this.hasInteracted = true;
      this.checked = !this.checked;
      this.indeterminate = false;
      this.updateComplete.then(() => {
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      });
    }
    connectedCallback() {
      super.connectedCallback();
      if (this.didSSR && !this.hasUpdated) {
        this.updateComplete.then(() => {
          this.handleDefaultCheckedChange();
        });
        return;
      }
      this.handleDefaultCheckedChange();
    }
    handleDefaultCheckedChange() {
      this.handleValueOrCheckedChange();
    }
    handleValueOrCheckedChange() {
      if (this.didSSR && !this.hasUpdated) {
        this.updateComplete.then(() => {
          this.handleValueOrCheckedChange();
        });
        return;
      }
      this.setValue(this.checked ? this.value : null, this._value);
      this.updateValidity();
    }
    handleStateChange() {
      if (this.hasUpdated) {
        this.input.checked = this.checked;
        this.input.indeterminate = this.indeterminate;
      }
      this.customStates.set("checked", this.checked);
      this.customStates.set("indeterminate", this.indeterminate);
      this.updateValidity();
    }
    handleDisabledChange() {
      this.customStates.set("disabled", this.disabled);
    }
    willUpdate(changedProperties) {
      super.willUpdate(changedProperties);
      if (changedProperties.has("value") || changedProperties.has("checked") || changedProperties.has("defaultChecked") || changedProperties.has("disabled")) {
        this.handleValueOrCheckedChange();
      }
    }
    formResetCallback() {
      this._checked = null;
      super.formResetCallback();
      this.handleValueOrCheckedChange();
    }
    /** Simulates a click on the checkbox. */
    click() {
      this.input.click();
    }
    /** Sets focus on the checkbox. */
    focus(options) {
      this.input.focus(options);
    }
    /** Removes focus from the checkbox. */
    blur() {
      this.input.blur();
    }
    render() {
      const hasHintSlot = o5 ? true : this.hasSlotController.test("hint");
      const hasHint = this.hint ? true : !!hasHintSlot;
      const isIndeterminate = !this.checked && this.indeterminate;
      const iconName = isIndeterminate ? "indeterminate" : "check";
      const iconState = isIndeterminate ? "indeterminate" : "checked";
      const checkedAttribute = this.didSSR && !this.hasUpdated ? this.checked : this.defaultChecked;
      const checkedProperty = this.didSSR && !this.hasUpdated ? null : l4(this.checked);
      return b2`
      <label part="base checkbox">
        <span part="control">
          <input
            class="input"
            type="checkbox"
            title=${this.title}
            name=${o7(this.name)}
            value=${o7(this.value)}
            .indeterminate=${l4(this.indeterminate)}
            .checked=${o7(checkedProperty)}
            ?checked=${checkedAttribute}
            ?disabled=${this.disabled}
            ?required=${this.required}
            aria-checked=${this.indeterminate ? "mixed" : this.checked ? "true" : "false"}
            aria-describedby="hint"
            @click=${this.handleClick}
          />

          <wa-icon part="${iconState}-icon icon" library="system" name=${iconName}></wa-icon>
        </span>

        <slot part="label"></slot>
      </label>

      <slot
        id="hint"
        part="hint"
        name="hint"
        aria-hidden=${hasHint ? "false" : "true"}
        class="${e7({ "has-slotted": hasHint })}"
      >
        ${this.hint}
      </slot>
    `;
    }
  };
  WaCheckbox.css = [form_control_styles_default, size_styles_default, checkbox_styles_default];
  WaCheckbox.shadowRootOptions = { ...WebAwesomeFormAssociatedElement.shadowRootOptions, delegatesFocus: true };
  __decorateClass([
    e6('input[type="checkbox"]')
  ], WaCheckbox.prototype, "input", 2);
  __decorateClass([
    n4()
  ], WaCheckbox.prototype, "title", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaCheckbox.prototype, "value", 1);
  __decorateClass([
    n4({ reflect: true })
  ], WaCheckbox.prototype, "size", 2);
  __decorateClass([
    watch("size")
  ], WaCheckbox.prototype, "handleSizeChange", 1);
  __decorateClass([
    n4({ type: Boolean })
  ], WaCheckbox.prototype, "disabled", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaCheckbox.prototype, "indeterminate", 2);
  __decorateClass([
    n4({ type: Boolean, attribute: false })
  ], WaCheckbox.prototype, "checked", 1);
  __decorateClass([
    n4({ type: Boolean, reflect: true, attribute: "checked" })
  ], WaCheckbox.prototype, "defaultChecked", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaCheckbox.prototype, "required", 2);
  __decorateClass([
    n4()
  ], WaCheckbox.prototype, "hint", 2);
  __decorateClass([
    watch(["checked", "defaultChecked"])
  ], WaCheckbox.prototype, "handleDefaultCheckedChange", 1);
  __decorateClass([
    watch(["checked", "indeterminate"])
  ], WaCheckbox.prototype, "handleStateChange", 1);
  __decorateClass([
    watch("disabled")
  ], WaCheckbox.prototype, "handleDisabledChange", 1);
  WaCheckbox = __decorateClass([
    t5("wa-checkbox")
  ], WaCheckbox);
  WaCheckbox.disableWarning?.("change-in-update");

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.UZWY5NQM.js
  var select_styles_default = i`
  :host {
    --tag-max-size: 10ch;
    --show-duration: var(--wa-transition-fast);
    --hide-duration: var(--wa-transition-fast);
  }

  /* Add ellipses to multi select options */
  :host wa-tag::part(content) {
    display: initial;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    max-width: var(--tag-max-size);
  }

  :host .disabled [part~='combobox'] {
    opacity: 0.5;
    cursor: not-allowed;
    outline: none;
  }

  :host .enabled:is(.open, :focus-within) [part~='combobox'] {
    outline-color: var(--wa-color-focus);
  }

  /** The popup */
  .select {
    flex: 1 1 auto;
    display: inline-flex;
    width: 100%;
    position: relative;
    vertical-align: middle;

    /* Pass through from select to the popup */
    --show-duration: inherit;
    --hide-duration: inherit;

    &::part(popup) {
      z-index: 900;
    }

    &[data-current-placement^='top']::part(popup) {
      transform-origin: bottom;
    }

    &[data-current-placement^='bottom']::part(popup) {
      transform-origin: top;
    }
  }

  /* Combobox */
  .combobox {
    flex: 1;
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    justify-content: start;

    min-height: var(--wa-form-control-height);

    background-color: var(--wa-form-control-background-color);
    border-color: var(--wa-form-control-border-color);
    border-radius: var(--wa-form-control-border-radius);
    border-style: var(--wa-form-control-border-style);
    border-width: var(--wa-form-control-border-width);
    color: var(--wa-form-control-value-color);
    cursor: pointer;
    font-family: inherit;
    font-weight: var(--wa-form-control-value-font-weight);
    line-height: var(--wa-form-control-value-line-height);
    overflow: hidden;
    padding: 0 var(--wa-form-control-padding-inline);
    position: relative;
    vertical-align: middle;
    transition:
      background-color var(--wa-transition-normal),
      border-color var(--wa-transition-normal),
      outline-color var(--wa-transition-fast);
    transition-timing-function: var(--wa-transition-easing);
    outline: var(--wa-focus-ring-style) var(--wa-focus-ring-width) transparent;
    outline-offset: var(--wa-focus-ring-offset);

    /* Pills */
    :host([pill]) & {
      border-radius: var(--wa-border-radius-pill);
    }
  }

  /* Appearance modifiers */
  :host([appearance='outlined']) .combobox {
    background-color: var(--wa-form-control-background-color);
    border-color: var(--wa-form-control-border-color);
  }

  :host([appearance='filled']) .combobox {
    background-color: var(--wa-color-neutral-fill-quiet);
    border-color: var(--wa-color-neutral-fill-quiet);
  }

  :host([appearance='filled-outlined']) .combobox {
    background-color: var(--wa-color-neutral-fill-quiet);
    border-color: var(--wa-form-control-border-color);
  }

  .display-input {
    position: relative;
    width: 100%;
    font: inherit;
    border: none;
    background: none;
    line-height: var(--wa-form-control-value-line-height);
    color: var(--wa-form-control-value-color);
    cursor: inherit;
    overflow: hidden;
    padding: 0;
    margin: 0;
    -webkit-appearance: none;

    &:focus {
      outline: none;
    }

    &::placeholder {
      color: var(--wa-form-control-placeholder-color);
    }
  }

  /* Manage spacing when tags are present */
  :host([multiple]) {
    --_padding-with-tags: calc(var(--wa-form-control-height) * 0.1 - var(--wa-form-control-border-width));

    & .combobox:has(.tags wa-tag) {
      padding-block: var(--_padding-with-tags);
      padding-inline-start: var(--_padding-with-tags);
    }
  }

  /* Visually hide the display input when multiple is enabled */
  :host([multiple]) .combobox:has(.tags wa-tag) .display-input {
    position: absolute;
    z-index: -1;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
  }

  .value-input {
    position: absolute;
    z-index: -1;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    padding: 0;
    margin: 0;
  }

  .tags {
    display: flex;
    flex: 1;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25em;

    /* Nested inside the box, so a step down from the box's radius */
    & wa-tag:not([pill]) {
      border-radius: var(--wa-border-radius-s);
    }

    .disabled & {
      cursor: not-allowed !important;
    }
  }

  /* Start and End */

  .start,
  .end {
    flex: 0;
    display: inline-flex;
    align-items: center;
    color: var(--wa-color-neutral-on-quiet);
  }

  .end::slotted(*) {
    margin-inline-start: var(--wa-form-control-padding-inline);
  }

  .start::slotted(*) {
    margin-inline-end: var(--wa-form-control-padding-inline);
  }

  :host([multiple]) .combobox:has(.tags wa-tag) .start::slotted(*) {
    margin-inline-start: calc(var(--wa-form-control-padding-inline) - var(--_padding-with-tags));
  }

  /* Clear button */
  [part~='clear-button'] {
    flex: 0 0 auto;
    display: inline-flex;
    align-self: stretch;
    align-items: center;
    justify-content: center;
    inline-size: 1.5em;
    font-size: inherit;
    color: var(--wa-color-neutral-on-quiet);
    border: none;
    background: none;
    padding: 0;
    transition: color var(--wa-transition-normal);
    cursor: pointer;
    /* The box is wider than the glyph, so overhang half that growth on each side. Keeps the glyph
       on the same trailing axis as the segmented-field pickers' clear buttons. */
    margin-inline-start: calc(var(--wa-form-control-padding-inline) - 0.125em);
    margin-inline-end: -0.125em;

    &:focus {
      outline: none;
    }

    @media (hover: hover) {
      &:hover {
        color: color-mix(in oklab, currentColor, var(--wa-color-mix-hover));
      }
    }

    &:active {
      color: color-mix(in oklab, currentColor, var(--wa-color-mix-active));
    }
  }

  /* Expand icon */
  .expand-icon {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    color: var(--wa-color-neutral-on-quiet);
    transition: rotate var(--wa-transition-slow) var(--wa-transition-easing);
    rotate: 0deg;
    margin-inline-start: var(--wa-form-control-padding-inline);

    .open & {
      rotate: -180deg;
    }
  }

  /* Listbox */
  .listbox {
    display: block;
    position: relative;
    font: inherit;
    box-shadow: var(--wa-shadow-m);
    background: var(--wa-color-surface-raised);
    border-color: var(--wa-color-surface-border);
    border-radius: var(--wa-border-radius-m);
    border-style: var(--wa-border-style);
    border-width: var(--wa-border-width-s);
    padding: 0.25em;
    overflow: auto;
    overscroll-behavior: none;

    /* Make sure it adheres to the popup's auto size */
    max-width: var(--auto-size-available-width);
    max-height: var(--auto-size-available-height);

    &::slotted(wa-divider) {
      --spacing: 0.5em;
    }
  }

  /* Space options with half the listbox's padding */
  .listbox slot:not([name]) {
    display: flex;
    flex-direction: column;
    gap: 0.125em;
  }

  slot:not([name])::slotted(small) {
    display: block;
    font-size: var(--wa-font-size-smaller);
    font-weight: var(--wa-font-weight-semibold);
    color: var(--wa-color-text-quiet);
    padding-block: 0.5em;
    padding-inline: 2.25em;
  }
`;

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.DITA2S5A.js
  function getOffset(element, parent) {
    return {
      top: Math.round(element.getBoundingClientRect().top - parent.getBoundingClientRect().top),
      left: Math.round(element.getBoundingClientRect().left - parent.getBoundingClientRect().left)
    };
  }
  function isEventInsideRect(event, el) {
    const rect = el.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  }
  var locks = /* @__PURE__ */ new Set();
  function getScrollbarWidth() {
    const documentWidth = document.documentElement.clientWidth;
    return Math.abs(window.innerWidth - documentWidth);
  }
  function getExistingBodyPadding() {
    const padding = Number(getComputedStyle(document.body).paddingRight.replace(/px/, ""));
    if (isNaN(padding) || !padding) {
      return 0;
    }
    return padding;
  }
  function lockBodyScrolling(lockingEl) {
    locks.add(lockingEl);
    if (!document.documentElement.classList.contains("wa-scroll-lock")) {
      const scrollbarWidth = getScrollbarWidth() + getExistingBodyPadding();
      let scrollbarGutterProperty = getComputedStyle(document.documentElement).scrollbarGutter;
      if (!scrollbarGutterProperty || scrollbarGutterProperty === "auto") {
        scrollbarGutterProperty = "stable";
      }
      if (scrollbarWidth < 2) {
        scrollbarGutterProperty = "";
      }
      document.documentElement.style.setProperty("--wa-scroll-lock-gutter", scrollbarGutterProperty);
      document.documentElement.classList.add("wa-scroll-lock");
      document.documentElement.style.setProperty("--wa-scroll-lock-size", `${scrollbarWidth}px`);
    }
  }
  function unlockBodyScrolling(lockingEl) {
    locks.delete(lockingEl);
    if (locks.size === 0) {
      document.documentElement.classList.remove("wa-scroll-lock");
      document.documentElement.style.removeProperty("--wa-scroll-lock-size");
    }
  }
  function scrollIntoView(element, container, direction = "vertical", behavior = "smooth") {
    const offset3 = getOffset(element, container);
    const offsetTop = offset3.top + container.scrollTop;
    const offsetLeft = offset3.left + container.scrollLeft;
    const minX = container.scrollLeft;
    const maxX = container.scrollLeft + container.offsetWidth;
    const minY = container.scrollTop;
    const maxY = container.scrollTop + container.offsetHeight;
    if (direction === "horizontal" || direction === "both") {
      if (offsetLeft < minX) {
        container.scrollTo({ left: offsetLeft, behavior });
      } else if (offsetLeft + element.clientWidth > maxX) {
        container.scrollTo({ left: offsetLeft - container.offsetWidth + element.clientWidth, behavior });
      }
    }
    if (direction === "vertical" || direction === "both") {
      if (offsetTop < minY) {
        container.scrollTo({ top: offsetTop, behavior });
      } else if (offsetTop + element.clientHeight > maxY) {
        container.scrollTo({ top: offsetTop - container.offsetHeight + element.clientHeight, behavior });
      }
    }
  }

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.4ZAKP7NY.js
  var WaShowEvent = class extends Event {
    constructor() {
      super("wa-show", { bubbles: true, cancelable: true, composed: true });
    }
  };

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.MQODJ75V.js
  var WaHideEvent = class extends Event {
    constructor(detail) {
      super("wa-hide", { bubbles: true, cancelable: true, composed: true });
      this.detail = detail;
    }
  };

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.3NKIHICW.js
  var WaAfterHideEvent = class extends Event {
    constructor() {
      super("wa-after-hide", { bubbles: true, cancelable: false, composed: true });
    }
  };

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.PX3HMKF7.js
  var WaAfterShowEvent = class extends Event {
    constructor() {
      super("wa-after-show", { bubbles: true, cancelable: false, composed: true });
    }
  };

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.3H2FQERJ.js
  var dismissibleStack = [];
  function registerDismissible(key) {
    unregisterDismissible(key);
    dismissibleStack.push(key);
  }
  function unregisterDismissible(key) {
    for (let i8 = dismissibleStack.length - 1; i8 >= 0; i8--) {
      if (dismissibleStack[i8] === key) {
        dismissibleStack.splice(i8, 1);
        break;
      }
    }
  }
  function isTopDismissible(key) {
    return dismissibleStack.length > 0 && dismissibleStack[dismissibleStack.length - 1] === key;
  }

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.F25QOBDY.js
  function waitForEvent(el, eventName) {
    return new Promise((resolve) => {
      function done(event) {
        if (event.target === el) {
          el.removeEventListener(eventName, done);
          resolve();
        }
      }
      el.addEventListener(eventName, done);
    });
  }

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.L6CIKOFQ.js
  function animateWithClass(el, className) {
    return new Promise((resolve) => {
      const controller = new AbortController();
      const { signal } = controller;
      if (el.classList.contains(className)) {
        return;
      }
      el.classList.add(className);
      let resolved = false;
      let onEnd = () => {
        if (resolved) {
          return;
        }
        resolved = true;
        el.classList.remove(className);
        resolve();
        controller.abort();
      };
      el.addEventListener("animationend", onEnd, { once: true, signal });
      el.addEventListener("animationcancel", onEnd, { once: true, signal });
      requestAnimationFrame(() => {
        if (!resolved && el.getAnimations().length === 0) {
          onEnd();
        }
      });
    });
  }

  // ../../node_modules/lit-html/directives/unsafe-html.js
  var e8 = class extends i5 {
    constructor(i8) {
      if (super(i8), this.it = A, i8.type !== t3.CHILD) throw Error(this.constructor.directiveName + "() can only be used in child bindings");
    }
    render(r8) {
      if (r8 === A || null == r8) return this._t = void 0, this.it = r8;
      if (r8 === E) return r8;
      if ("string" != typeof r8) throw Error(this.constructor.directiveName + "() called with a non-string value");
      if (r8 === this.it) return this._t;
      this.it = r8;
      const s4 = [r8];
      return s4.raw = s4, this._t = { _$litType$: this.constructor.resultType, strings: s4, values: [] };
    }
  };
  e8.directiveName = "unsafeHTML", e8.resultType = 1;
  var o8 = e4(e8);

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.ZAVDMBWV.js
  var WaSelect = class extends WebAwesomeFormAssociatedElement {
    constructor() {
      super(...arguments);
      this.assumeInteractionOn = ["blur", "input"];
      this.cachedOptions = null;
      this.hasSlotController = new HasSlotController(this, "hint", "label");
      this.localize = new LocalizeController2(this);
      this.selectionOrder = /* @__PURE__ */ new Map();
      this.typeToSelectString = "";
      this.slotChangePending = false;
      this.displayLabel = "";
      this.selectedOptions = [];
      this.name = "";
      this._defaultValue = null;
      this.size = "m";
      this.placeholder = "";
      this.multiple = false;
      this.maxOptionsVisible = 3;
      this.disabled = false;
      this.withClear = false;
      this.open = false;
      this.appearance = "outlined";
      this.pill = false;
      this.label = "";
      this.placement = "bottom";
      this.hint = "";
      this.withLabel = false;
      this.withHint = false;
      this.required = false;
      this.getTag = (option) => {
        return b2`
        <wa-tag
          part="tag"
          exportparts="
            base:tag__base,
            content:tag__content,
            remove-button:tag__remove-button,
            remove-button__base:tag__remove-button__base
          "
          ?pill=${this.pill}
          size=${this.size}
          with-remove
          data-value=${option.value}
          @wa-remove=${(event) => this.handleTagRemove(event, option)}
        >
          ${option.label}
        </wa-tag>
      `;
      };
      this.handleDocumentFocusIn = (event) => {
        const path = event.composedPath();
        if (this && !path.includes(this)) {
          this.hide();
        }
      };
      this.handleDocumentKeyDown = (event) => {
        const target = event.target;
        const isClearButton = target.closest('[part~="clear-button"]') !== null;
        const isButton = target.closest("wa-button") !== null;
        if (isClearButton || isButton) {
          return;
        }
        if (event.key === "Escape" && this.open && isTopDismissible(this)) {
          event.preventDefault();
          event.stopPropagation();
          this.hide();
          this.displayInput.focus({ preventScroll: true });
        }
        if (event.key === "Enter" || event.key === " " && this.typeToSelectString === "") {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!this.open) {
            this.show();
            return;
          }
          if (this.currentOption && !this.currentOption.disabled) {
            this.valueHasChanged = true;
            this.hasInteracted = true;
            if (this.multiple) {
              this.toggleOptionSelection(this.currentOption);
            } else {
              this.setSelectedOptions(this.currentOption);
            }
            this.updateComplete.then(() => {
              this.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
              this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
            });
            if (!this.multiple) {
              this.hide();
              this.displayInput.focus({ preventScroll: true });
            }
          }
          return;
        }
        if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
          const allOptions = this.getAllOptions();
          const currentIndex = allOptions.indexOf(this.currentOption);
          let newIndex = Math.max(0, currentIndex);
          event.preventDefault();
          if (!this.open) {
            this.show();
            if (this.currentOption) {
              return;
            }
          }
          if (event.key === "ArrowDown") {
            newIndex = currentIndex + 1;
            if (newIndex > allOptions.length - 1) newIndex = 0;
          } else if (event.key === "ArrowUp") {
            newIndex = currentIndex - 1;
            if (newIndex < 0) newIndex = allOptions.length - 1;
          } else if (event.key === "Home") {
            newIndex = 0;
          } else if (event.key === "End") {
            newIndex = allOptions.length - 1;
          }
          this.setCurrentOption(allOptions[newIndex]);
        }
        if (event.key?.length === 1 || event.key === "Backspace") {
          const allOptions = this.getAllOptions();
          if (event.metaKey || event.ctrlKey || event.altKey) {
            return;
          }
          if (!this.open) {
            if (event.key === "Backspace") {
              return;
            }
            this.show();
          }
          event.stopPropagation();
          event.preventDefault();
          clearTimeout(this.typeToSelectTimeout);
          this.typeToSelectTimeout = window.setTimeout(() => this.typeToSelectString = "", 1e3);
          if (event.key === "Backspace") {
            this.typeToSelectString = this.typeToSelectString.slice(0, -1);
          } else {
            this.typeToSelectString += event.key.toLowerCase();
          }
          for (const option of allOptions) {
            const label = option.label.toLowerCase();
            if (label.startsWith(this.typeToSelectString)) {
              this.setCurrentOption(option);
              break;
            }
          }
        }
      };
      this.handleDocumentMouseDown = (event) => {
        const path = event.composedPath();
        if (this && !path.includes(this)) {
          this.hide();
        }
      };
    }
    static get validators() {
      const validators = o5 ? [] : [
        RequiredValidator({
          validationElement: Object.assign(document.createElement("select"), { required: true })
        })
      ];
      return [...super.validators, ...validators];
    }
    /** Where to anchor native constraint validation */
    get validationTarget() {
      return this.valueInput;
    }
    set defaultValue(val) {
      this._defaultValue = this.convertDefaultValue(val);
    }
    get defaultValue() {
      return this.convertDefaultValue(this._defaultValue);
    }
    rawValuesEqual(a4, b3) {
      if (a4 == null && b3 == null) return true;
      if (a4 == null || b3 == null) return false;
      if (a4.length !== b3.length) return false;
      return a4.every((v2, i8) => v2 === b3[i8]);
    }
    /**
     * @private
     * A converter for defaultValue from array to string if its multiple. Also fixes some hydration issues.
     */
    convertDefaultValue(val) {
      const isMultiple = this.multiple || this.hasAttribute("multiple");
      if (!isMultiple && Array.isArray(val)) {
        val = val[0];
      }
      return val;
    }
    set value(val) {
      let oldValue = this.value;
      if (val instanceof FormData) {
        val = val.getAll(this.name);
      }
      if (val != null && !Array.isArray(val)) {
        val = [val];
      }
      const oldRawValue = this._value;
      this._value = val ?? null;
      if (!this.rawValuesEqual(oldRawValue, this._value)) {
        this.valueHasChanged = true;
        this.requestUpdate("value", oldValue);
      }
    }
    get value() {
      let value = this._value ?? this.defaultValue ?? null;
      if (value != null) {
        value = Array.isArray(value) ? value : [value];
      }
      this.optionValues = new Set(
        this.getAllOptions().filter((option) => !option.disabled).map((option) => option.value)
      );
      let ret = value;
      if (value != null) {
        ret = value.filter((v2) => this.optionValues.has(v2));
        ret = this.multiple ? ret : ret[0];
        ret = ret ?? null;
      }
      return ret;
    }
    handleSizeChange() {
      warnDeprecatedSize(this.localName, this.size);
    }
    connectedCallback() {
      super.connectedCallback();
      this.processSlotChange();
      this.open = false;
    }
    disconnectedCallback() {
      super.disconnectedCallback();
      this.removeOpenListeners();
      this.cachedOptions = null;
    }
    updateDefaultValue() {
      const allOptions = this.getAllOptions();
      const defaultSelectedOptions = allOptions.filter((el) => el.hasAttribute("selected") || el.defaultSelected);
      if (defaultSelectedOptions.length > 0) {
        const selectedValues = defaultSelectedOptions.map((el) => el.value);
        this._defaultValue = this.multiple ? selectedValues : selectedValues[0];
      }
      if (this.hasAttribute("value")) {
        this._defaultValue = this.getAttribute("value") || null;
      }
    }
    addOpenListeners() {
      document.addEventListener("focusin", this.handleDocumentFocusIn);
      document.addEventListener("keydown", this.handleDocumentKeyDown);
      document.addEventListener("mousedown", this.handleDocumentMouseDown);
      registerDismissible(this);
      if (this.getRootNode() !== document) {
        this.getRootNode().addEventListener("focusin", this.handleDocumentFocusIn);
      }
    }
    removeOpenListeners() {
      document.removeEventListener("focusin", this.handleDocumentFocusIn);
      document.removeEventListener("keydown", this.handleDocumentKeyDown);
      document.removeEventListener("mousedown", this.handleDocumentMouseDown);
      unregisterDismissible(this);
      if (this.getRootNode() !== document) {
        this.getRootNode().removeEventListener("focusin", this.handleDocumentFocusIn);
      }
    }
    handleFocus() {
      this.displayInput.setSelectionRange(0, 0);
    }
    handleLabelClick() {
      this.displayInput.focus();
    }
    handleComboboxClick(event) {
      event.preventDefault();
    }
    handleComboboxMouseDown(event) {
      const path = event.composedPath();
      const isButton = path.some((el) => el instanceof Element && el.tagName.toLowerCase() === "wa-button");
      if (this.disabled || isButton) {
        return;
      }
      event.preventDefault();
      this.displayInput.focus({ preventScroll: true });
      this.open = !this.open;
    }
    handleComboboxKeyDown(event) {
      event.stopPropagation();
      this.handleDocumentKeyDown(event);
    }
    handleClearClick(event) {
      event.stopPropagation();
      this.hasInteracted = true;
      this.valueHasChanged = true;
      if (this.value !== null) {
        this.displayLabel = "";
        this.selectionOrder.clear();
        this.setSelectedOptions([]);
        this.displayInput.focus({ preventScroll: true });
        this.updateComplete.then(() => {
          this.dispatchEvent(new WaClearEvent());
          this.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
          this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        });
      }
    }
    handleClearMouseDown(event) {
      event.stopPropagation();
      event.preventDefault();
    }
    handleOptionClick(event) {
      const target = event.target;
      const option = target.closest("wa-option");
      if (option && !option.disabled) {
        this.hasInteracted = true;
        this.valueHasChanged = true;
        if (this.multiple) {
          this.toggleOptionSelection(option);
        } else {
          this.setSelectedOptions(option);
        }
        this.updateComplete.then(() => this.displayInput.focus({ preventScroll: true }));
        this.requestUpdate("value");
        this.updateComplete.then(() => {
          this.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
          this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        });
        if (!this.multiple) {
          this.hide();
          this.displayInput.focus({ preventScroll: true });
        }
      }
    }
    /* @internal - used by options to update labels */
    handleDefaultSlotChange() {
      if (this.slotChangePending) return;
      this.slotChangePending = true;
      queueMicrotask(() => {
        this.slotChangePending = false;
        this.processSlotChange();
      });
    }
    processSlotChange() {
      if (!customElements.get("wa-option")) {
        customElements.whenDefined("wa-option").then(() => this.handleDefaultSlotChange());
      }
      if (this.didSSR && !this.hasUpdated) {
        this.updateComplete.then(() => {
          this.handleDefaultSlotChange();
        });
        return;
      }
      this.cachedOptions = null;
      const allOptions = this.getAllOptions();
      this.updateDefaultValue();
      let value = this.value;
      if (value == null || !this.valueHasChanged && !this.hasInteracted) {
        this.selectionChanged();
        return;
      }
      if (!Array.isArray(value)) {
        value = [value];
      }
      const selectedOptions = allOptions.filter((el) => value.includes(el.value));
      this.setSelectedOptions(selectedOptions);
    }
    handleTagRemove(event, directOption) {
      event.stopPropagation();
      if (this.disabled) return;
      this.hasInteracted = true;
      this.valueHasChanged = true;
      let option = directOption;
      if (!option) {
        const tagElement = event.target.closest("wa-tag[data-value]");
        if (tagElement) {
          const value = tagElement.dataset.value;
          option = this.selectedOptions.find((opt) => opt.value === value);
        }
      }
      if (option) {
        this.toggleOptionSelection(option, false);
        this.updateComplete.then(() => {
          this.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
          this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        });
      }
    }
    // Gets an array of all `<wa-option>` elements
    getAllOptions() {
      if (this.cachedOptions) return this.cachedOptions;
      if (!this?.querySelectorAll) {
        return [];
      }
      this.cachedOptions = [...this.querySelectorAll("wa-option")];
      return this.cachedOptions;
    }
    // Gets the first `<wa-option>` element
    getFirstOption() {
      return this.querySelector("wa-option");
    }
    // Sets the current option, which is the option the user is currently interacting with (e.g. via keyboard). Only one
    // option may be "current" at a time.
    setCurrentOption(option) {
      const allOptions = this.getAllOptions();
      allOptions.forEach((el) => {
        el.current = false;
        el.tabIndex = -1;
      });
      if (option) {
        this.currentOption = option;
        option.current = true;
        option.tabIndex = 0;
        option.focus({ preventScroll: true });
        if (this.open && !this.listbox.hidden) {
          scrollIntoView(option, this.listbox, "vertical", "auto");
        }
      }
    }
    // Sets the selected option(s)
    setSelectedOptions(option) {
      const allOptions = this.getAllOptions();
      const newSelectedOptions = Array.isArray(option) ? option : [option];
      allOptions.forEach((el) => {
        if (newSelectedOptions.includes(el)) {
          return;
        }
        el.selected = false;
      });
      if (newSelectedOptions.length) {
        newSelectedOptions.forEach((el) => el.selected = true);
      }
      this.selectionChanged();
    }
    // Toggles an option's selected state
    toggleOptionSelection(option, force) {
      if (force === true || force === false) {
        option.selected = force;
      } else {
        option.selected = !option.selected;
      }
      this.selectionChanged();
    }
    // @internal This method must be called whenever the selection changes. It will update the selected options cache, the
    // current value, and the display value. The option component uses it internally to update labels as they change.
    selectionChanged() {
      const options = this.getAllOptions();
      const newSelectedOptions = options.filter((el) => {
        if (!this.hasInteracted && !this.valueHasChanged) {
          const defaultValue = this.defaultValue;
          const defaultValues = Array.isArray(defaultValue) ? defaultValue : [defaultValue];
          return el.hasAttribute("selected") || el.defaultSelected || el.selected || defaultValues?.includes(el.value);
        }
        return el.selected;
      });
      const newSelectedValues = new Set(newSelectedOptions.map((el) => el.value));
      for (const value of this.selectionOrder.keys()) {
        if (!newSelectedValues.has(value)) {
          this.selectionOrder.delete(value);
        }
      }
      const maxOrder = this.selectionOrder.size > 0 ? Math.max(...this.selectionOrder.values()) : -1;
      let nextOrder = maxOrder + 1;
      for (const option of newSelectedOptions) {
        if (!this.selectionOrder.has(option.value)) {
          this.selectionOrder.set(option.value, nextOrder++);
        }
      }
      this.selectedOptions = newSelectedOptions.sort((a4, b3) => {
        const orderA = this.selectionOrder.get(a4.value) ?? 0;
        const orderB = this.selectionOrder.get(b3.value) ?? 0;
        return orderA - orderB;
      });
      let selectedValues = new Set(this.selectedOptions.map((el) => el.value));
      if (selectedValues.size > 0 || this._value) {
        const oldValue = this._value;
        if (this._value == null) {
          let value = this.defaultValue ?? [];
          this._value = Array.isArray(value) ? value : [value];
        }
        this._value = this._value?.filter((value) => !this.optionValues?.has(value)) ?? null;
        this._value?.unshift(...selectedValues);
        this.requestUpdate("value", oldValue);
      }
      if (this.multiple) {
        if (this.placeholder && !this.value?.length) {
          this.displayLabel = "";
        } else {
          this.displayLabel = this.localize.term("numOptionsSelected", this.selectedOptions.length);
        }
      } else {
        const selectedOption = this.selectedOptions[0];
        this.displayLabel = selectedOption?.label ?? "";
      }
      this.updateComplete.then(() => {
        this.updateValidity();
      });
    }
    get tags() {
      return this.selectedOptions.map((option, index) => {
        if (index < this.maxOptionsVisible || this.maxOptionsVisible <= 0) {
          const tag = this.getTag(option, index);
          if (!tag) return null;
          return typeof tag === "string" ? o8(tag) : tag;
        } else if (index === this.maxOptionsVisible) {
          return b2`
          <wa-tag
            part="tag"
            exportparts="
              base:tag__base,
              content:tag__content,
              remove-button:tag__remove-button,
              remove-button__base:tag__remove-button__base
            "
            ?pill=${this.pill}
            size=${this.size}
            >+${this.selectedOptions.length - index}</wa-tag
          >
        `;
        }
        return null;
      });
    }
    updated(changedProperties) {
      super.updated(changedProperties);
      if (changedProperties.has("value") || changedProperties.has("displayLabel")) {
        this.customStates.set("blank", !this.value && !this.displayLabel);
      }
    }
    handleDisabledChange() {
      if (this.disabled && this.open) {
        this.open = false;
      }
    }
    handleValueChange() {
      const allOptions = this.getAllOptions();
      const value = Array.isArray(this.value) ? this.value : [this.value];
      const selectedOptions = allOptions.filter((el) => value.includes(el.value));
      this.setSelectedOptions(selectedOptions);
      this.updateValidity();
    }
    async handleOpenChange() {
      if (this.open && !this.disabled) {
        this.setCurrentOption(this.selectedOptions[0] || this.getFirstOption());
        const waShowEvent = new WaShowEvent();
        this.dispatchEvent(waShowEvent);
        if (waShowEvent.defaultPrevented) {
          this.open = false;
          return;
        }
        this.addOpenListeners();
        this.listbox.hidden = false;
        this.popup.active = true;
        requestAnimationFrame(() => {
          this.setCurrentOption(this.currentOption);
        });
        await animateWithClass(this.popup.popup, "show");
        if (this.currentOption) {
          scrollIntoView(this.currentOption, this.listbox, "vertical", "auto");
        }
        this.dispatchEvent(new WaAfterShowEvent());
      } else {
        const waHideEvent = new WaHideEvent();
        this.dispatchEvent(waHideEvent);
        if (waHideEvent.defaultPrevented) {
          this.open = false;
          return;
        }
        this.removeOpenListeners();
        await animateWithClass(this.popup.popup, "hide");
        this.listbox.hidden = true;
        this.popup.active = false;
        this.dispatchEvent(new WaAfterHideEvent());
      }
    }
    /** Shows the listbox. */
    async show() {
      if (this.open || this.disabled) {
        this.open = false;
        return void 0;
      }
      this.open = true;
      return waitForEvent(this, "wa-after-show");
    }
    /** Hides the listbox. */
    async hide() {
      if (!this.open || this.disabled) {
        this.open = false;
        return void 0;
      }
      this.open = false;
      return waitForEvent(this, "wa-after-hide");
    }
    /** Sets focus on the control. */
    focus(options) {
      this.displayInput.focus(options);
    }
    /** Removes focus from the control. */
    blur() {
      this.displayInput.blur();
    }
    formResetCallback() {
      this.selectionOrder.clear();
      this.value = this.defaultValue;
      super.formResetCallback();
      this.handleValueChange();
      this.updateComplete.then(() => {
        this.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      });
    }
    render() {
      const hasLabelSlot = this.hasSlotController.test("label", "withLabel");
      const hasHintSlot = this.hasSlotController.test("hint", "withHint");
      const hasLabel = this.label ? true : !!hasLabelSlot;
      const hasHint = this.hint ? true : !!hasHintSlot;
      const hasClearIcon = (this.hasUpdated || o5) && this.withClear && !this.disabled && (this.displayLabel || this.value && this.value.length > 0);
      return b2`
      <div
        part="form-control"
        class=${e7({
        "form-control": true,
        "form-control-has-label": hasLabel
      })}
      >
        <label
          id="label"
          part="form-control-label label"
          class=${e7({
        label: true,
        "has-label": hasLabel
      })}
          aria-hidden=${hasLabel ? "false" : "true"}
          @click=${this.handleLabelClick}
        >
          <slot name="label">${this.label}</slot>
        </label>

        <div part="form-control-input" class="form-control-input">
          <wa-popup
            class=${e7({
        select: true,
        open: this.open,
        disabled: this.disabled,
        enabled: !this.disabled,
        multiple: this.multiple
      })}
            placement=${this.placement}
            flip
            shift
            sync="width"
            auto-size="vertical"
            auto-size-padding="10"
          >
            <div
              part="combobox"
              class="combobox"
              slot="anchor"
              @keydown=${this.handleComboboxKeyDown}
              @mousedown=${this.handleComboboxMouseDown}
              @click=${this.handleComboboxClick}
            >
              <slot part="start" name="start" class="start"></slot>

              <input
                part="display-input"
                class="display-input"
                type="text"
                placeholder=${this.placeholder}
                .disabled=${this.disabled}
                .value=${this.displayLabel}
                ?required=${this.required}
                autocomplete="off"
                spellcheck="false"
                autocapitalize="off"
                readonly
                aria-invalid=${!this.validity.valid}
                aria-controls="listbox"
                aria-expanded=${this.open ? "true" : "false"}
                aria-haspopup="listbox"
                aria-labelledby="label"
                aria-disabled=${this.disabled ? "true" : "false"}
                aria-describedby="hint"
                role="combobox"
                tabindex="0"
                @focus=${this.handleFocus}
              />

              <!-- Tags need to wait for first hydration before populating otherwise it will create a hydration mismatch. -->
              ${this.multiple && this.hasUpdated ? b2`<div part="tags" class="tags" @wa-remove=${this.handleTagRemove}>${this.tags}</div>` : ""}

              <input
                class="value-input"
                type="text"
                ?disabled=${this.disabled}
                ?required=${this.required}
                .value=${Array.isArray(this.value) ? this.value.join(", ") : this.value}
                tabindex="-1"
                aria-hidden="true"
                @focus=${() => this.focus()}
              />

              ${hasClearIcon ? b2`
                    <button
                      part="clear-button"
                      type="button"
                      aria-label=${this.localize.term("clearEntry")}
                      @mousedown=${this.handleClearMouseDown}
                      @click=${this.handleClearClick}
                      tabindex="-1"
                    >
                      <slot name="clear-icon">
                        <wa-icon name="circle-xmark" library="system" variant="regular"></wa-icon>
                      </slot>
                    </button>
                  ` : ""}

              <slot name="end" part="end" class="end"></slot>

              <slot name="expand-icon" part="expand-icon" class="expand-icon">
                <wa-icon library="system" name="chevron-down" variant="solid"></wa-icon>
              </slot>
            </div>

            <div
              id="listbox"
              role="listbox"
              aria-expanded=${this.open ? "true" : "false"}
              aria-multiselectable=${this.multiple ? "true" : "false"}
              aria-labelledby="label"
              part="listbox"
              class="listbox"
              tabindex="-1"
              @mouseup=${this.handleOptionClick}
            >
              <slot @slotchange=${this.handleDefaultSlotChange}></slot>
            </div>
          </wa-popup>
        </div>

        <slot
          id="hint"
          name="hint"
          part="hint"
          class=${e7({
        "has-slotted": hasHint
      })}
          aria-hidden=${hasHint ? "false" : "true"}
          >${this.hint}</slot
        >
      </div>
    `;
    }
  };
  WaSelect.css = [select_styles_default, form_control_styles_default, size_styles_default];
  __decorateClass([
    e6(".select")
  ], WaSelect.prototype, "popup", 2);
  __decorateClass([
    e6(".combobox")
  ], WaSelect.prototype, "combobox", 2);
  __decorateClass([
    e6(".display-input")
  ], WaSelect.prototype, "displayInput", 2);
  __decorateClass([
    e6(".value-input")
  ], WaSelect.prototype, "valueInput", 2);
  __decorateClass([
    e6(".listbox")
  ], WaSelect.prototype, "listbox", 2);
  __decorateClass([
    r6()
  ], WaSelect.prototype, "displayLabel", 2);
  __decorateClass([
    r6()
  ], WaSelect.prototype, "currentOption", 2);
  __decorateClass([
    r6()
  ], WaSelect.prototype, "selectedOptions", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaSelect.prototype, "name", 2);
  __decorateClass([
    n4({
      attribute: false
    })
  ], WaSelect.prototype, "defaultValue", 1);
  __decorateClass([
    n4({ attribute: "value", reflect: false })
  ], WaSelect.prototype, "value", 1);
  __decorateClass([
    n4({ reflect: true })
  ], WaSelect.prototype, "size", 2);
  __decorateClass([
    watch("size")
  ], WaSelect.prototype, "handleSizeChange", 1);
  __decorateClass([
    n4()
  ], WaSelect.prototype, "placeholder", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaSelect.prototype, "multiple", 2);
  __decorateClass([
    n4({ attribute: "max-options-visible", type: Number })
  ], WaSelect.prototype, "maxOptionsVisible", 2);
  __decorateClass([
    n4({ type: Boolean })
  ], WaSelect.prototype, "disabled", 2);
  __decorateClass([
    n4({ attribute: "with-clear", type: Boolean })
  ], WaSelect.prototype, "withClear", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaSelect.prototype, "open", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaSelect.prototype, "appearance", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaSelect.prototype, "pill", 2);
  __decorateClass([
    n4()
  ], WaSelect.prototype, "label", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaSelect.prototype, "placement", 2);
  __decorateClass([
    n4({ attribute: "hint" })
  ], WaSelect.prototype, "hint", 2);
  __decorateClass([
    n4({ attribute: "with-label", type: Boolean })
  ], WaSelect.prototype, "withLabel", 2);
  __decorateClass([
    n4({ attribute: "with-hint", type: Boolean })
  ], WaSelect.prototype, "withHint", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaSelect.prototype, "required", 2);
  __decorateClass([
    n4({ attribute: false })
  ], WaSelect.prototype, "getTag", 2);
  __decorateClass([
    watch("disabled", { waitUntilFirstUpdate: true })
  ], WaSelect.prototype, "handleDisabledChange", 1);
  __decorateClass([
    watch("value", { waitUntilFirstUpdate: true })
  ], WaSelect.prototype, "handleValueChange", 1);
  __decorateClass([
    watch("open", { waitUntilFirstUpdate: true })
  ], WaSelect.prototype, "handleOpenChange", 1);
  WaSelect = __decorateClass([
    t5("wa-select")
  ], WaSelect);
  WaSelect.disableWarning?.("change-in-update");

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.HPULLNVR.js
  var WaRemoveEvent = class extends Event {
    constructor() {
      super("wa-remove", { bubbles: true, cancelable: false, composed: true });
    }
  };

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.4AHPL3WP.js
  var tag_styles_default = i`
  @layer wa-component {
    :host {
      display: inline-flex;
      gap: 0.5em;
      border-radius: var(--wa-border-radius-m);
      align-items: center;
      background-color: var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet));
      border-color: var(--wa-color-border-normal, var(--wa-color-neutral-border-normal));
      border-style: var(--wa-border-style);
      border-width: var(--wa-border-width-s);
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      font-size: inherit;
      line-height: 1;
      white-space: nowrap;
      user-select: none;
      -webkit-user-select: none;
      height: calc(var(--wa-form-control-height) * 0.8);
      line-height: calc(var(--wa-form-control-height) - var(--wa-form-control-border-width) * 2);
      padding: 0 0.75em;
    }

    /* Appearance modifiers */
    :host([appearance='outlined']) {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: transparent;
      border-color: var(--wa-color-border-loud, var(--wa-color-neutral-border-loud));
    }

    :host([appearance='filled']) {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet));
      border-color: transparent;
    }

    :host([appearance='filled-outlined']) {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet));
      border-color: var(--wa-color-border-normal, var(--wa-color-neutral-border-normal));
    }

    :host([appearance='accent']) {
      color: var(--wa-color-on-loud, var(--wa-color-neutral-on-loud));
      background-color: var(--wa-color-fill-loud, var(--wa-color-neutral-fill-loud));
      border-color: transparent;
    }
  }

  .content {
    font-size: var(--wa-font-size-smaller);
  }

  [part='remove-button'] {
    line-height: 1;
  }

  [part='remove-button']::part(base) {
    padding: 0;
    height: 1em;
    width: 1em;
    color: currentColor;
  }

  @media (hover: hover) {
    :host(:hover) > [part='remove-button']::part(base) {
      background-color: transparent;
      color: color-mix(in oklab, currentColor, var(--wa-color-mix-hover));
    }
  }

  :host(:active) > [part='remove-button']::part(base) {
    background-color: transparent;
    color: color-mix(in oklab, currentColor, var(--wa-color-mix-active));
  }

  /*
   * Pill modifier
   */
  :host([pill]) {
    border-radius: var(--wa-border-radius-pill);
  }
`;

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.XNTP7DEQ.js
  var variants_styles_default = i`
  :where(:root),
  .wa-neutral,
  :host([variant='neutral']) {
    --wa-color-fill-loud: var(--wa-color-neutral-fill-loud);
    --wa-color-fill-normal: var(--wa-color-neutral-fill-normal);
    --wa-color-fill-quiet: var(--wa-color-neutral-fill-quiet);
    --wa-color-border-loud: var(--wa-color-neutral-border-loud);
    --wa-color-border-normal: var(--wa-color-neutral-border-normal);
    --wa-color-border-quiet: var(--wa-color-neutral-border-quiet);
    --wa-color-on-loud: var(--wa-color-neutral-on-loud);
    --wa-color-on-normal: var(--wa-color-neutral-on-normal);
    --wa-color-on-quiet: var(--wa-color-neutral-on-quiet);
  }

  .wa-brand,
  :host([variant='brand']) {
    --wa-color-fill-loud: var(--wa-color-brand-fill-loud);
    --wa-color-fill-normal: var(--wa-color-brand-fill-normal);
    --wa-color-fill-quiet: var(--wa-color-brand-fill-quiet);
    --wa-color-border-loud: var(--wa-color-brand-border-loud);
    --wa-color-border-normal: var(--wa-color-brand-border-normal);
    --wa-color-border-quiet: var(--wa-color-brand-border-quiet);
    --wa-color-on-loud: var(--wa-color-brand-on-loud);
    --wa-color-on-normal: var(--wa-color-brand-on-normal);
    --wa-color-on-quiet: var(--wa-color-brand-on-quiet);
  }

  .wa-success,
  :host([variant='success']) {
    --wa-color-fill-loud: var(--wa-color-success-fill-loud);
    --wa-color-fill-normal: var(--wa-color-success-fill-normal);
    --wa-color-fill-quiet: var(--wa-color-success-fill-quiet);
    --wa-color-border-loud: var(--wa-color-success-border-loud);
    --wa-color-border-normal: var(--wa-color-success-border-normal);
    --wa-color-border-quiet: var(--wa-color-success-border-quiet);
    --wa-color-on-loud: var(--wa-color-success-on-loud);
    --wa-color-on-normal: var(--wa-color-success-on-normal);
    --wa-color-on-quiet: var(--wa-color-success-on-quiet);
  }

  .wa-warning,
  :host([variant='warning']) {
    --wa-color-fill-loud: var(--wa-color-warning-fill-loud);
    --wa-color-fill-normal: var(--wa-color-warning-fill-normal);
    --wa-color-fill-quiet: var(--wa-color-warning-fill-quiet);
    --wa-color-border-loud: var(--wa-color-warning-border-loud);
    --wa-color-border-normal: var(--wa-color-warning-border-normal);
    --wa-color-border-quiet: var(--wa-color-warning-border-quiet);
    --wa-color-on-loud: var(--wa-color-warning-on-loud);
    --wa-color-on-normal: var(--wa-color-warning-on-normal);
    --wa-color-on-quiet: var(--wa-color-warning-on-quiet);
  }

  .wa-danger,
  :host([variant='danger']) {
    --wa-color-fill-loud: var(--wa-color-danger-fill-loud);
    --wa-color-fill-normal: var(--wa-color-danger-fill-normal);
    --wa-color-fill-quiet: var(--wa-color-danger-fill-quiet);
    --wa-color-border-loud: var(--wa-color-danger-border-loud);
    --wa-color-border-normal: var(--wa-color-danger-border-normal);
    --wa-color-border-quiet: var(--wa-color-danger-border-quiet);
    --wa-color-on-loud: var(--wa-color-danger-on-loud);
    --wa-color-on-normal: var(--wa-color-danger-on-normal);
    --wa-color-on-quiet: var(--wa-color-danger-on-quiet);
  }
`;

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.JS5OA4M6.js
  var WaTag = class extends WebAwesomeElement {
    constructor() {
      super(...arguments);
      this.localize = new LocalizeController2(this);
      this.variant = "neutral";
      this.appearance = "filled-outlined";
      this.size = "m";
      this.pill = false;
      this.withRemove = false;
    }
    handleSizeChange() {
      warnDeprecatedSize(this.localName, this.size);
    }
    handleRemoveClick() {
      this.dispatchEvent(new WaRemoveEvent());
    }
    render() {
      return b2`
      <slot part="content" class="content"></slot>

      ${this.withRemove ? b2`
            <wa-button
              part="remove-button"
              exportparts="base:remove-button__base"
              class="remove"
              appearance="plain"
              size=${this.size}
              @click=${this.handleRemoveClick}
              tabindex="-1"
            >
              <wa-icon name="xmark" library="system" variant="solid" label=${this.localize.term("remove")}></wa-icon>
            </wa-button>
          ` : ""}
    `;
    }
  };
  WaTag.css = [tag_styles_default, variants_styles_default, size_styles_default];
  __decorateClass([
    n4({ reflect: true })
  ], WaTag.prototype, "variant", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaTag.prototype, "appearance", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaTag.prototype, "size", 2);
  __decorateClass([
    watch("size")
  ], WaTag.prototype, "handleSizeChange", 1);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaTag.prototype, "pill", 2);
  __decorateClass([
    n4({ attribute: "with-remove", type: Boolean })
  ], WaTag.prototype, "withRemove", 2);
  WaTag = __decorateClass([
    t5("wa-tag")
  ], WaTag);

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.C3KOHXUM.js
  var option_styles_default = i`
  :host {
    --current-text-color: var(--wa-color-brand-on-loud);

    display: block;
    color: var(--wa-color-text-normal);
    -webkit-user-select: none;
    user-select: none;

    position: relative;
    display: flex;
    align-items: center;
    font: inherit;
    padding: 0.5em 1em 0.5em 0.25em;
    border-radius: var(--wa-border-radius-s);
    line-height: var(--wa-line-height-condensed);
    transition: var(--wa-transition-fast) background-color var(--wa-transition-easing);
    cursor: pointer;
  }

  :host(:focus) {
    outline: none;
  }

  @media (hover: hover) {
    :host(:not(:state(disabled), :state(current)):is(:state(hover), :hover)) {
      background-color: var(--wa-color-neutral-fill-normal);
      color: var(--wa-color-neutral-on-normal);
    }
  }

  :host(:state(current)),
  :host(:state(disabled):state(current)) {
    background-color: var(--wa-form-control-activated-color);
    color: var(--current-text-color);
    opacity: 1;
  }

  :host(:state(disabled)) {
    outline: none;
    opacity: 0.5;
    cursor: not-allowed;
  }

  .label {
    flex: 1 1 auto;
    display: inline-block;
  }

  .check {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--wa-font-size-smaller);
    visibility: hidden;
    width: 2em;
  }

  :host(:state(selected)) .check {
    visibility: visible;
  }

  .start,
  .end {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
  }

  .start::slotted(*) {
    margin-inline-end: 0.5em;
  }

  .end::slotted(*) {
    margin-inline-start: 0.5em;
  }

  @media (forced-colors: active) {
    :host(:hover:not([aria-disabled='true'])) {
      outline: dashed 1px SelectedItem;
      outline-offset: -1px;
    }
  }
`;

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.5WATURH2.js
  function getText(root, depth = 0) {
    if (!root || !globalThis.Node) {
      return "";
    }
    if (typeof root[Symbol.iterator] === "function") {
      let nodes = Array.isArray(root) ? root : [...root];
      return nodes.map((node2) => getText(node2, --depth)).join("");
    }
    let node = root;
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? "";
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      let element = node;
      if (element.hasAttribute("slot") || element.matches("style, script")) {
        return "";
      }
      if (element instanceof HTMLSlotElement) {
        let assignedNodes = element.assignedNodes({ flatten: true });
        if (assignedNodes.length > 0) {
          return getText(assignedNodes, --depth);
        }
      }
      return depth > -1 ? getText(element, --depth) : element.textContent ?? "";
    }
    return node.hasChildNodes() ? getText(node.childNodes, --depth) : "";
  }
  var WaOption = class extends WebAwesomeElement {
    constructor() {
      super(...arguments);
      this.localize = new LocalizeController2(this);
      this.cachedDefaultLabel = "";
      this.isInitialized = false;
      this.isDefaultLabelDirty = true;
      this.current = false;
      this.value = "";
      this.disabled = false;
      this.selected = false;
      this.defaultSelected = false;
      this._label = "";
      this.handleHover = (event) => {
        if (event.type === "mouseenter") {
          this.customStates.set("hover", true);
        } else if (event.type === "mouseleave") {
          this.customStates.set("hover", false);
        }
      };
    }
    set label(value) {
      const oldValue = this._label;
      this._label = value || "";
      if (this._label !== oldValue) {
        this.requestUpdate("label", oldValue);
      }
    }
    get label() {
      if (this._label) {
        return this._label;
      }
      return this.defaultLabel;
    }
    /** The default label, generated from the element contents. Will be equal to `label` in most cases. */
    get defaultLabel() {
      if (this.isDefaultLabelDirty || !this.cachedDefaultLabel) {
        this.updateDefaultLabel();
      }
      return this.cachedDefaultLabel;
    }
    connectedCallback() {
      super.connectedCallback();
      this.setAttribute("role", "option");
      this.setAttribute("aria-selected", "false");
      this.addEventListener("mouseenter", this.handleHover);
      this.addEventListener("mouseleave", this.handleHover);
    }
    disconnectedCallback() {
      super.disconnectedCallback();
      this.removeEventListener("mouseenter", this.handleHover);
      this.removeEventListener("mouseleave", this.handleHover);
    }
    handleDefaultSlotChange() {
      this.isDefaultLabelDirty = true;
      if (!this.isInitialized) {
        this.isInitialized = true;
        return;
      }
      const controller = this.closest("wa-select, wa-combobox");
      if (controller) {
        customElements.whenDefined(controller.localName).then(() => controller.handleDefaultSlotChange?.());
      }
    }
    willUpdate(changedProperties) {
      if (changedProperties.has("defaultSelected")) {
        if (this.didSSR && this.hasUpdated || !this.didSSR) {
          this.syncDefaultSelected();
        }
      }
      super.willUpdate(changedProperties);
    }
    syncDefaultSelected() {
      if ("closest" in this) {
        if (!this.closest("wa-combobox, wa-select")?.hasInteracted) {
          if (this.defaultSelected) {
            const oldVal = this.selected;
            this.selected = this.defaultSelected;
            this.requestUpdate("selected", oldVal);
          }
        }
      }
    }
    updated(changedProperties) {
      if (changedProperties.has("disabled")) {
        this.setAttribute("aria-disabled", this.disabled ? "true" : "false");
        this.customStates.set("disabled", this.disabled);
      }
      if (changedProperties.has("selected")) {
        this.setAttribute("aria-selected", this.selected ? "true" : "false");
        this.customStates.set("selected", this.selected);
      }
      if (changedProperties.has("value")) {
        if (typeof this.value !== "string") {
          this.value = String(this.value);
        }
        this.handleDefaultSlotChange();
      }
      if (changedProperties.has("current")) {
        this.customStates.set("current", this.current);
      }
      super.updated(changedProperties);
    }
    async firstUpdated(changedProperties) {
      super.firstUpdated(changedProperties);
      if (this.didSSR && !this.hasUpdated) {
        await this.updateComplete;
        this.syncDefaultSelected();
      } else {
        this.syncDefaultSelected();
      }
      if (this.selected && !this.defaultSelected) {
        const parent = this.closest("wa-select, wa-combobox");
        if (parent && !parent.hasInteracted) {
          await customElements.whenDefined(parent?.localName);
          await parent.updateComplete;
          parent.selectionChanged?.();
        }
      }
    }
    updateDefaultLabel() {
      let oldValue = this.cachedDefaultLabel;
      this.cachedDefaultLabel = getText(this).trim();
      this.isDefaultLabelDirty = false;
      let changed = this.cachedDefaultLabel !== oldValue;
      if (!this._label && changed) {
        this.requestUpdate("label", oldValue);
      }
      return changed;
    }
    render() {
      let selected = this.selected;
      if (this.didSSR && !this.hasUpdated) {
        this.updateComplete.then(() => {
          this.requestUpdate();
        });
        return A;
      }
      return b2`
      ${selected ? b2`<wa-icon
            part="checked-icon"
            class="check"
            name="check"
            library="system"
            variant="solid"
            aria-hidden="true"
          ></wa-icon>` : b2`<span part="checked-icon" class="check" aria-hidden="true"></span>`}
      <slot part="start" name="start" class="start"></slot>
      <slot part="label" class="label" @slotchange=${this.handleDefaultSlotChange}></slot>
      <slot part="end" name="end" class="end"></slot>
    `;
    }
  };
  WaOption.css = option_styles_default;
  __decorateClass([
    e6(".label")
  ], WaOption.prototype, "defaultSlot", 2);
  __decorateClass([
    r6()
  ], WaOption.prototype, "current", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaOption.prototype, "value", 2);
  __decorateClass([
    n4({ type: Boolean })
  ], WaOption.prototype, "disabled", 2);
  __decorateClass([
    n4({ type: Boolean, attribute: false })
  ], WaOption.prototype, "selected", 2);
  __decorateClass([
    n4({ type: Boolean, attribute: "selected" })
  ], WaOption.prototype, "defaultSelected", 2);
  __decorateClass([
    n4()
  ], WaOption.prototype, "label", 1);
  WaOption = __decorateClass([
    t5("wa-option")
  ], WaOption);

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.ZWQCGLB5.js
  var WaRepositionEvent = class extends Event {
    constructor() {
      super("wa-reposition", { bubbles: true, cancelable: false, composed: true });
    }
  };

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.HS5AYC6E.js
  var popup_styles_default = i`
  :host {
    --arrow-color: black;
    --arrow-size: var(--wa-tooltip-arrow-size);
    --popup-border-width: 0px;
    --show-duration: var(--wa-transition-fast);
    --hide-duration: var(--wa-transition-fast);

    /*
     * These properties are computed to account for the arrow's dimensions after being rotated 45º. The constant
     * 0.7071 is derived from sin(45) to calculate the length of the arrow after rotation.
     *
     * The diamond will be translated inward by --arrow-base-offset, the border thickness, to centralise it on
     * the inner edge of the popup border. This also means we need to increase the size of the arrow by the
     * same amount to compensate.
     *
     * A diamond shaped clipping mask is used to avoid overlap of popup content. This extends slightly inward so
     * the popup border is covered with no sub-pixel rounding artifacts. The diamond corners are mitred at 22.5º
     * to properly merge any arrow border with the popup border. The constant 1.4142 is derived from 1 + tan(22.5).
     *
     */
    --arrow-base-offset: var(--popup-border-width);
    --arrow-size-diagonal: calc((var(--arrow-size) + var(--arrow-base-offset)) * 0.7071);
    --arrow-padding-offset: calc(var(--arrow-size-diagonal) - var(--arrow-size));
    --arrow-size-div: calc(var(--arrow-size-diagonal) * 2);
    --arrow-clipping-corner: calc(var(--arrow-base-offset) * 1.4142);

    display: contents;
  }

  .popup {
    position: absolute;
    isolation: isolate;
    max-width: var(--auto-size-available-width, none);
    max-height: var(--auto-size-available-height, none);

    /* Clear UA styles for [popover] */
    :where(&) {
      inset: unset;
      padding: unset;
      margin: unset;
      width: unset;
      height: unset;
      color: unset;
      background: unset;
      border: unset;
      overflow: unset;
    }
  }

  .popup-fixed {
    position: fixed;
  }

  .popup:not(.popup-active) {
    display: none;
  }

  .arrow {
    position: absolute;
    width: var(--arrow-size-div);
    height: var(--arrow-size-div);
    background: var(--arrow-color);
    z-index: 3;
    clip-path: polygon(
      var(--arrow-clipping-corner) 100%,
      var(--arrow-base-offset) calc(100% - var(--arrow-base-offset)),
      calc(var(--arrow-base-offset) - 2px) calc(100% - var(--arrow-base-offset)),
      calc(100% - var(--arrow-base-offset)) calc(var(--arrow-base-offset) - 2px),
      calc(100% - var(--arrow-base-offset)) var(--arrow-base-offset),
      100% var(--arrow-clipping-corner),
      100% 100%
    );
    rotate: 45deg;
  }

  :host([data-current-placement|='left']) .arrow {
    rotate: -45deg;
  }

  :host([data-current-placement|='right']) .arrow {
    rotate: 135deg;
  }

  :host([data-current-placement|='bottom']) .arrow {
    rotate: 225deg;
  }

  /* Hover bridge */
  .popup-hover-bridge:not(.popup-hover-bridge-visible) {
    display: none;
  }

  .popup-hover-bridge {
    position: fixed;
    z-index: 899;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    clip-path: polygon(
      var(--hover-bridge-top-left-x, 0) var(--hover-bridge-top-left-y, 0),
      var(--hover-bridge-top-right-x, 0) var(--hover-bridge-top-right-y, 0),
      var(--hover-bridge-bottom-right-x, 0) var(--hover-bridge-bottom-right-y, 0),
      var(--hover-bridge-bottom-left-x, 0) var(--hover-bridge-bottom-left-y, 0)
    );
  }

  /* Built-in animations */
  .show {
    animation: show var(--show-duration) ease;
  }

  .hide {
    animation: show var(--hide-duration) ease reverse;
  }

  @keyframes show {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .show-with-scale {
    animation: show-with-scale var(--show-duration) ease;
  }

  .hide-with-scale {
    animation: show-with-scale var(--hide-duration) ease reverse;
  }

  @keyframes show-with-scale {
    from {
      opacity: 0;
      scale: 0.8;
    }
    to {
      opacity: 1;
      scale: 1;
    }
  }
`;

  // ../../node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs
  var min = Math.min;
  var max = Math.max;
  var round = Math.round;
  var floor = Math.floor;
  var createCoords = (v2) => ({
    x: v2,
    y: v2
  });
  var oppositeSideMap = {
    left: "right",
    right: "left",
    bottom: "top",
    top: "bottom"
  };
  function clamp(start, value, end) {
    return max(start, min(value, end));
  }
  function evaluate(value, param) {
    return typeof value === "function" ? value(param) : value;
  }
  function getSide(placement) {
    return placement.split("-")[0];
  }
  function getAlignment(placement) {
    return placement.split("-")[1];
  }
  function getOppositeAxis(axis) {
    return axis === "x" ? "y" : "x";
  }
  function getAxisLength(axis) {
    return axis === "y" ? "height" : "width";
  }
  function getSideAxis(placement) {
    const firstChar = placement[0];
    return firstChar === "t" || firstChar === "b" ? "y" : "x";
  }
  function getAlignmentAxis(placement) {
    return getOppositeAxis(getSideAxis(placement));
  }
  function getAlignmentSides(placement, rects, rtl) {
    if (rtl === void 0) {
      rtl = false;
    }
    const alignment = getAlignment(placement);
    const alignmentAxis = getAlignmentAxis(placement);
    const length = getAxisLength(alignmentAxis);
    let mainAlignmentSide = alignmentAxis === "x" ? alignment === (rtl ? "end" : "start") ? "right" : "left" : alignment === "start" ? "bottom" : "top";
    if (rects.reference[length] > rects.floating[length]) {
      mainAlignmentSide = getOppositePlacement(mainAlignmentSide);
    }
    return [mainAlignmentSide, getOppositePlacement(mainAlignmentSide)];
  }
  function getExpandedPlacements(placement) {
    const oppositePlacement = getOppositePlacement(placement);
    return [getOppositeAlignmentPlacement(placement), oppositePlacement, getOppositeAlignmentPlacement(oppositePlacement)];
  }
  function getOppositeAlignmentPlacement(placement) {
    return placement.includes("start") ? placement.replace("start", "end") : placement.replace("end", "start");
  }
  var lrPlacement = ["left", "right"];
  var rlPlacement = ["right", "left"];
  var tbPlacement = ["top", "bottom"];
  var btPlacement = ["bottom", "top"];
  function getSideList(side, isStart, rtl) {
    switch (side) {
      case "top":
      case "bottom":
        if (rtl) return isStart ? rlPlacement : lrPlacement;
        return isStart ? lrPlacement : rlPlacement;
      case "left":
      case "right":
        return isStart ? tbPlacement : btPlacement;
      default:
        return [];
    }
  }
  function getOppositeAxisPlacements(placement, flipAlignment, direction, rtl) {
    const alignment = getAlignment(placement);
    let list = getSideList(getSide(placement), direction === "start", rtl);
    if (alignment) {
      list = list.map((side) => side + "-" + alignment);
      if (flipAlignment) {
        list = list.concat(list.map(getOppositeAlignmentPlacement));
      }
    }
    return list;
  }
  function getOppositePlacement(placement) {
    const side = getSide(placement);
    return oppositeSideMap[side] + placement.slice(side.length);
  }
  function expandPaddingObject(padding) {
    var _padding$top, _padding$right, _padding$bottom, _padding$left;
    return {
      top: (_padding$top = padding.top) != null ? _padding$top : 0,
      right: (_padding$right = padding.right) != null ? _padding$right : 0,
      bottom: (_padding$bottom = padding.bottom) != null ? _padding$bottom : 0,
      left: (_padding$left = padding.left) != null ? _padding$left : 0
    };
  }
  function getPaddingObject(padding) {
    return typeof padding !== "number" ? expandPaddingObject(padding) : {
      top: padding,
      right: padding,
      bottom: padding,
      left: padding
    };
  }
  function rectToClientRect(rect) {
    const {
      x: x2,
      y: y3,
      width,
      height
    } = rect;
    return {
      width,
      height,
      top: y3,
      left: x2,
      right: x2 + width,
      bottom: y3 + height,
      x: x2,
      y: y3
    };
  }

  // ../../node_modules/@floating-ui/core/dist/floating-ui.core.mjs
  function computeCoordsFromPlacement(_ref, placement, rtl) {
    let {
      reference,
      floating
    } = _ref;
    const sideAxis = getSideAxis(placement);
    const alignmentAxis = getAlignmentAxis(placement);
    const alignLength = getAxisLength(alignmentAxis);
    const side = getSide(placement);
    const isVertical = sideAxis === "y";
    const commonX = reference.x + reference.width / 2 - floating.width / 2;
    const commonY = reference.y + reference.height / 2 - floating.height / 2;
    const commonAlign = reference[alignLength] / 2 - floating[alignLength] / 2;
    let coords;
    switch (side) {
      case "top":
        coords = {
          x: commonX,
          y: reference.y - floating.height
        };
        break;
      case "bottom":
        coords = {
          x: commonX,
          y: reference.y + reference.height
        };
        break;
      case "right":
        coords = {
          x: reference.x + reference.width,
          y: commonY
        };
        break;
      case "left":
        coords = {
          x: reference.x - floating.width,
          y: commonY
        };
        break;
      default:
        coords = {
          x: reference.x,
          y: reference.y
        };
    }
    const alignment = getAlignment(placement);
    if (alignment) {
      coords[alignmentAxis] += commonAlign * (alignment === "end" ? 1 : -1) * (rtl && isVertical ? -1 : 1);
    }
    return coords;
  }
  async function detectOverflow(state, options) {
    var _await$platform$isEle;
    if (options === void 0) {
      options = {};
    }
    const {
      x: x2,
      y: y3,
      platform: platform2,
      rects,
      elements,
      strategy
    } = state;
    const {
      boundary = "clippingAncestors",
      rootBoundary = "viewport",
      elementContext = "floating",
      altBoundary = false,
      padding = 0
    } = evaluate(options, state);
    const paddingObject = getPaddingObject(padding);
    const altContext = elementContext === "floating" ? "reference" : "floating";
    const element = elements[altBoundary ? altContext : elementContext];
    const clippingClientRect = rectToClientRect(await platform2.getClippingRect({
      element: ((_await$platform$isEle = await (platform2.isElement == null ? void 0 : platform2.isElement(element))) != null ? _await$platform$isEle : true) ? element : element.contextElement || await (platform2.getDocumentElement == null ? void 0 : platform2.getDocumentElement(elements.floating)),
      boundary,
      rootBoundary,
      strategy
    }));
    const rect = elementContext === "floating" ? {
      x: x2,
      y: y3,
      width: rects.floating.width,
      height: rects.floating.height
    } : rects.reference;
    const offsetParent = await (platform2.getOffsetParent == null ? void 0 : platform2.getOffsetParent(elements.floating));
    const offsetScale = await (platform2.isElement == null ? void 0 : platform2.isElement(offsetParent)) && await (platform2.getScale == null ? void 0 : platform2.getScale(offsetParent)) || {
      x: 1,
      y: 1
    };
    const elementClientRect = rectToClientRect(platform2.convertOffsetParentRelativeRectToViewportRelativeRect ? await platform2.convertOffsetParentRelativeRectToViewportRelativeRect({
      elements,
      rect,
      offsetParent,
      strategy
    }) : rect);
    return {
      top: (clippingClientRect.top - elementClientRect.top + paddingObject.top) / offsetScale.y,
      bottom: (elementClientRect.bottom - clippingClientRect.bottom + paddingObject.bottom) / offsetScale.y,
      left: (clippingClientRect.left - elementClientRect.left + paddingObject.left) / offsetScale.x,
      right: (elementClientRect.right - clippingClientRect.right + paddingObject.right) / offsetScale.x
    };
  }
  var MAX_RESET_COUNT = 50;
  var computePosition = async (reference, floating, config) => {
    const {
      placement = "bottom",
      strategy = "absolute",
      middleware = [],
      platform: platform2
    } = config;
    const platformWithDetectOverflow = platform2.detectOverflow ? platform2 : {
      ...platform2,
      detectOverflow
    };
    const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(floating));
    let rects = await platform2.getElementRects({
      reference,
      floating,
      strategy
    });
    let {
      x: x2,
      y: y3
    } = computeCoordsFromPlacement(rects, placement, rtl);
    let statefulPlacement = placement;
    let resetCount = 0;
    const middlewareData = {};
    for (let i8 = 0; i8 < middleware.length; i8++) {
      const currentMiddleware = middleware[i8];
      if (!currentMiddleware) {
        continue;
      }
      const {
        name,
        fn
      } = currentMiddleware;
      const {
        x: nextX,
        y: nextY,
        data,
        reset
      } = await fn({
        x: x2,
        y: y3,
        initialPlacement: placement,
        placement: statefulPlacement,
        strategy,
        middlewareData,
        rects,
        platform: platformWithDetectOverflow,
        elements: {
          reference,
          floating
        }
      });
      x2 = nextX != null ? nextX : x2;
      y3 = nextY != null ? nextY : y3;
      middlewareData[name] = {
        ...middlewareData[name],
        ...data
      };
      if (reset && resetCount < MAX_RESET_COUNT) {
        resetCount++;
        if (typeof reset === "object") {
          if (reset.placement) {
            statefulPlacement = reset.placement;
          }
          if (reset.rects) {
            rects = reset.rects === true ? await platform2.getElementRects({
              reference,
              floating,
              strategy
            }) : reset.rects;
          }
          ({
            x: x2,
            y: y3
          } = computeCoordsFromPlacement(rects, statefulPlacement, rtl));
        }
        i8 = -1;
      }
    }
    return {
      x: x2,
      y: y3,
      placement: statefulPlacement,
      strategy,
      middlewareData
    };
  };
  var arrow = (options) => ({
    name: "arrow",
    options,
    async fn(state) {
      const {
        x: x2,
        y: y3,
        placement,
        rects,
        platform: platform2,
        elements,
        middlewareData
      } = state;
      const {
        element,
        padding = 0
      } = evaluate(options, state) || {};
      if (element == null) {
        return {};
      }
      const paddingObject = getPaddingObject(padding);
      const coords = {
        x: x2,
        y: y3
      };
      const axis = getAlignmentAxis(placement);
      const length = getAxisLength(axis);
      const arrowDimensions = await platform2.getDimensions(element);
      const isYAxis = axis === "y";
      const minProp = isYAxis ? "top" : "left";
      const maxProp = isYAxis ? "bottom" : "right";
      const clientProp = isYAxis ? "clientHeight" : "clientWidth";
      const endDiff = rects.reference[length] + rects.reference[axis] - coords[axis] - rects.floating[length];
      const startDiff = coords[axis] - rects.reference[axis];
      const arrowOffsetParent = await (platform2.getOffsetParent == null ? void 0 : platform2.getOffsetParent(element));
      let clientSize = arrowOffsetParent ? arrowOffsetParent[clientProp] : 0;
      if (!clientSize || !await (platform2.isElement == null ? void 0 : platform2.isElement(arrowOffsetParent))) {
        clientSize = elements.floating[clientProp] || rects.floating[length];
      }
      const centerToReference = endDiff / 2 - startDiff / 2;
      const largestPossiblePadding = clientSize / 2 - arrowDimensions[length] / 2 - 1;
      const minPadding = min(paddingObject[minProp], largestPossiblePadding);
      const maxPadding = min(paddingObject[maxProp], largestPossiblePadding);
      const max2 = clientSize - arrowDimensions[length] - maxPadding;
      const center = clientSize / 2 - arrowDimensions[length] / 2 + centerToReference;
      const offset3 = clamp(minPadding, center, max2);
      const shouldAddOffset = !middlewareData.arrow && getAlignment(placement) != null && center !== offset3 && rects.reference[length] / 2 - (center < minPadding ? minPadding : maxPadding) - arrowDimensions[length] / 2 < 0;
      const alignmentOffset = shouldAddOffset ? center < minPadding ? center - minPadding : center - max2 : 0;
      return {
        [axis]: coords[axis] + alignmentOffset,
        data: {
          [axis]: offset3,
          centerOffset: center - offset3 - alignmentOffset,
          ...shouldAddOffset && {
            alignmentOffset
          }
        },
        reset: shouldAddOffset
      };
    }
  });
  var flip = function(options) {
    if (options === void 0) {
      options = {};
    }
    return {
      name: "flip",
      options,
      async fn(state) {
        var _middlewareData$arrow, _middlewareData$flip;
        const {
          placement,
          middlewareData,
          rects,
          initialPlacement,
          platform: platform2,
          elements
        } = state;
        const {
          mainAxis: checkMainAxis = true,
          crossAxis: checkCrossAxis = true,
          fallbackPlacements: specifiedFallbackPlacements,
          fallbackStrategy = "bestFit",
          fallbackAxisSideDirection = "none",
          flipAlignment = true,
          ...detectOverflowOptions
        } = evaluate(options, state);
        if ((_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) {
          return {};
        }
        const side = getSide(placement);
        const initialSideAxis = getSideAxis(initialPlacement);
        const isBasePlacement = getSide(initialPlacement) === initialPlacement;
        const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating));
        const fallbackPlacements = specifiedFallbackPlacements || (isBasePlacement || !flipAlignment ? [getOppositePlacement(initialPlacement)] : getExpandedPlacements(initialPlacement));
        const hasFallbackAxisSideDirection = fallbackAxisSideDirection !== "none";
        if (!specifiedFallbackPlacements && hasFallbackAxisSideDirection) {
          fallbackPlacements.push(...getOppositeAxisPlacements(initialPlacement, flipAlignment, fallbackAxisSideDirection, rtl));
        }
        const placements2 = [initialPlacement, ...fallbackPlacements];
        const overflow = await platform2.detectOverflow(state, detectOverflowOptions);
        const overflows = [];
        let overflowsData = ((_middlewareData$flip = middlewareData.flip) == null ? void 0 : _middlewareData$flip.overflows) || [];
        if (checkMainAxis) {
          overflows.push(overflow[side]);
        }
        if (checkCrossAxis) {
          const sides2 = getAlignmentSides(placement, rects, rtl);
          overflows.push(overflow[sides2[0]], overflow[sides2[1]]);
        }
        overflowsData = [...overflowsData, {
          placement,
          overflows
        }];
        if (!overflows.every((side2) => side2 <= 0)) {
          var _middlewareData$flip2, _overflowsData$filter;
          const nextIndex = (((_middlewareData$flip2 = middlewareData.flip) == null ? void 0 : _middlewareData$flip2.index) || 0) + 1;
          const nextPlacement = placements2[nextIndex];
          if (nextPlacement) {
            const ignoreCrossAxisOverflow = checkCrossAxis === "alignment" ? initialSideAxis !== getSideAxis(nextPlacement) : false;
            if (!ignoreCrossAxisOverflow || // We leave the current main axis only if every placement on that axis
            // overflows the main axis.
            overflowsData.every((d3) => getSideAxis(d3.placement) === initialSideAxis ? d3.overflows[0] > 0 : true)) {
              return {
                data: {
                  index: nextIndex,
                  overflows: overflowsData
                },
                reset: {
                  placement: nextPlacement
                }
              };
            }
          }
          let resetPlacement = (_overflowsData$filter = overflowsData.filter((d3) => d3.overflows[0] <= 0).sort((a4, b3) => a4.overflows[1] - b3.overflows[1])[0]) == null ? void 0 : _overflowsData$filter.placement;
          if (!resetPlacement) {
            switch (fallbackStrategy) {
              case "bestFit": {
                var _overflowsData$filter2;
                const placement2 = (_overflowsData$filter2 = overflowsData.filter((d3) => {
                  if (hasFallbackAxisSideDirection) {
                    const currentSideAxis = getSideAxis(d3.placement);
                    return currentSideAxis === initialSideAxis || // Create a bias to the `y` side axis due to horizontal
                    // reading directions favoring greater width.
                    currentSideAxis === "y";
                  }
                  return true;
                }).map((d3) => [d3.placement, d3.overflows.filter((overflow2) => overflow2 > 0).reduce((acc, overflow2) => acc + overflow2, 0)]).sort((a4, b3) => a4[1] - b3[1])[0]) == null ? void 0 : _overflowsData$filter2[0];
                if (placement2) {
                  resetPlacement = placement2;
                }
                break;
              }
              case "initialPlacement":
                resetPlacement = initialPlacement;
                break;
            }
          }
          if (placement !== resetPlacement) {
            return {
              reset: {
                placement: resetPlacement
              }
            };
          }
        }
        return {};
      }
    };
  };
  var originSides = /* @__PURE__ */ new Set(["left", "top"]);
  async function convertValueToCoords(state, options) {
    const {
      placement,
      platform: platform2,
      elements
    } = state;
    const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating));
    const side = getSide(placement);
    const alignment = getAlignment(placement);
    const isVertical = getSideAxis(placement) === "y";
    const mainAxisMulti = originSides.has(side) ? -1 : 1;
    const crossAxisMulti = rtl && isVertical ? -1 : 1;
    const rawValue = evaluate(options, state);
    let {
      mainAxis,
      crossAxis,
      alignmentAxis
    } = typeof rawValue === "number" ? {
      mainAxis: rawValue,
      crossAxis: 0,
      alignmentAxis: null
    } : {
      mainAxis: rawValue.mainAxis || 0,
      crossAxis: rawValue.crossAxis || 0,
      alignmentAxis: rawValue.alignmentAxis
    };
    if (alignment && typeof alignmentAxis === "number") {
      crossAxis = alignment === "end" ? alignmentAxis * -1 : alignmentAxis;
    }
    return isVertical ? {
      x: crossAxis * crossAxisMulti,
      y: mainAxis * mainAxisMulti
    } : {
      x: mainAxis * mainAxisMulti,
      y: crossAxis * crossAxisMulti
    };
  }
  var offset = function(options) {
    if (options === void 0) {
      options = 0;
    }
    return {
      name: "offset",
      options,
      async fn(state) {
        var _middlewareData$offse, _middlewareData$arrow;
        const {
          x: x2,
          y: y3,
          placement,
          middlewareData
        } = state;
        const diffCoords = await convertValueToCoords(state, options);
        if (placement === ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse.placement) && (_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) {
          return {};
        }
        return {
          x: x2 + diffCoords.x,
          y: y3 + diffCoords.y,
          data: {
            ...diffCoords,
            placement
          }
        };
      }
    };
  };
  var shift = function(options) {
    if (options === void 0) {
      options = {};
    }
    return {
      name: "shift",
      options,
      async fn(state) {
        const {
          x: x2,
          y: y3,
          placement,
          platform: platform2
        } = state;
        const {
          mainAxis: checkMainAxis = true,
          crossAxis: checkCrossAxis = false,
          limiter = {
            fn: (_ref) => {
              let {
                x: x3,
                y: y4
              } = _ref;
              return {
                x: x3,
                y: y4
              };
            }
          },
          ...detectOverflowOptions
        } = evaluate(options, state);
        const coords = {
          x: x2,
          y: y3
        };
        const overflow = await platform2.detectOverflow(state, detectOverflowOptions);
        const crossAxis = getSideAxis(placement);
        const mainAxis = getOppositeAxis(crossAxis);
        let mainAxisCoord = coords[mainAxis];
        let crossAxisCoord = coords[crossAxis];
        const clampCoord = (axis, coord) => clamp(coord + overflow[axis === "y" ? "top" : "left"], coord, coord - overflow[axis === "y" ? "bottom" : "right"]);
        if (checkMainAxis) {
          mainAxisCoord = clampCoord(mainAxis, mainAxisCoord);
        }
        if (checkCrossAxis) {
          crossAxisCoord = clampCoord(crossAxis, crossAxisCoord);
        }
        const limitedCoords = limiter.fn({
          ...state,
          [mainAxis]: mainAxisCoord,
          [crossAxis]: crossAxisCoord
        });
        return {
          ...limitedCoords,
          data: {
            x: limitedCoords.x - x2,
            y: limitedCoords.y - y3,
            enabled: {
              [mainAxis]: checkMainAxis,
              [crossAxis]: checkCrossAxis
            }
          }
        };
      }
    };
  };
  var size = function(options) {
    if (options === void 0) {
      options = {};
    }
    return {
      name: "size",
      options,
      async fn(state) {
        const {
          placement,
          rects,
          platform: platform2,
          elements
        } = state;
        const {
          apply = () => {
          },
          ...detectOverflowOptions
        } = evaluate(options, state);
        const overflow = await platform2.detectOverflow(state, detectOverflowOptions);
        const side = getSide(placement);
        const alignment = getAlignment(placement);
        const isYAxis = getSideAxis(placement) === "y";
        const {
          width,
          height
        } = rects.floating;
        let heightSide;
        let widthSide;
        if (side === "top" || side === "bottom") {
          heightSide = side;
          widthSide = alignment === (await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating)) ? "start" : "end") ? "left" : "right";
        } else {
          widthSide = side;
          heightSide = alignment === "end" ? "top" : "bottom";
        }
        const maximumClippingHeight = height - overflow.top - overflow.bottom;
        const maximumClippingWidth = width - overflow.left - overflow.right;
        const overflowAvailableHeight = min(height - overflow[heightSide], maximumClippingHeight);
        const overflowAvailableWidth = min(width - overflow[widthSide], maximumClippingWidth);
        const shiftData = state.middlewareData.shift;
        const noShift = !shiftData;
        let availableHeight = overflowAvailableHeight;
        let availableWidth = overflowAvailableWidth;
        if (shiftData != null && shiftData.enabled.x) {
          availableWidth = maximumClippingWidth;
        }
        if (shiftData != null && shiftData.enabled.y) {
          availableHeight = maximumClippingHeight;
        }
        if (noShift && !alignment) {
          if (isYAxis) {
            availableWidth = width - 2 * max(overflow.left, overflow.right);
          } else {
            availableHeight = height - 2 * max(overflow.top, overflow.bottom);
          }
        }
        await apply({
          ...state,
          availableWidth,
          availableHeight
        });
        const nextDimensions = await platform2.getDimensions(elements.floating);
        if (width !== nextDimensions.width || height !== nextDimensions.height) {
          return {
            reset: {
              rects: true
            }
          };
        }
        return {};
      }
    };
  };

  // ../../node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs
  function hasWindow() {
    return typeof window !== "undefined";
  }
  function getNodeName(node) {
    if (isNode(node)) {
      return (node.nodeName || "").toLowerCase();
    }
    return "#document";
  }
  function getWindow(node) {
    var _node$ownerDocument;
    return (node == null || (_node$ownerDocument = node.ownerDocument) == null ? void 0 : _node$ownerDocument.defaultView) || window;
  }
  function getDocumentElement(node) {
    var _ref;
    return (_ref = (isNode(node) ? node.ownerDocument : node.document) || window.document) == null ? void 0 : _ref.documentElement;
  }
  function isNode(value) {
    if (!hasWindow()) {
      return false;
    }
    return value instanceof Node || value instanceof getWindow(value).Node;
  }
  function isElement(value) {
    if (!hasWindow()) {
      return false;
    }
    return value instanceof Element || value instanceof getWindow(value).Element;
  }
  function isHTMLElement(value) {
    if (!hasWindow()) {
      return false;
    }
    return value instanceof HTMLElement || value instanceof getWindow(value).HTMLElement;
  }
  function isShadowRoot(value) {
    if (!hasWindow() || typeof ShadowRoot === "undefined") {
      return false;
    }
    return value instanceof ShadowRoot || value instanceof getWindow(value).ShadowRoot;
  }
  function isOverflowElement(element) {
    const {
      overflow,
      overflowX,
      overflowY,
      display
    } = getComputedStyle2(element);
    return /auto|scroll|overlay|hidden|clip/.test(overflow + overflowY + overflowX) && display !== "inline" && display !== "contents";
  }
  function isTableElement(element) {
    return /^(table|td|th)$/.test(getNodeName(element));
  }
  function isTopLayer(element) {
    try {
      if (element.matches(":popover-open")) {
        return true;
      }
    } catch (_e) {
    }
    try {
      return element.matches(":modal");
    } catch (_e) {
      return false;
    }
  }
  var willChangeRe = /transform|translate|scale|rotate|perspective|filter/;
  var containRe = /paint|layout|strict|content/;
  var isNotNone = (value) => !!value && value !== "none";
  var isWebKitValue;
  function isContainingBlock(elementOrCss) {
    const css = isElement(elementOrCss) ? getComputedStyle2(elementOrCss) : elementOrCss;
    return isNotNone(css.transform) || isNotNone(css.translate) || isNotNone(css.scale) || isNotNone(css.rotate) || isNotNone(css.perspective) || !isWebKit() && (isNotNone(css.backdropFilter) || isNotNone(css.filter)) || willChangeRe.test(css.willChange || "") || containRe.test(css.contain || "");
  }
  function getContainingBlock(element) {
    let currentNode = getParentNode(element);
    while (isHTMLElement(currentNode) && !isLastTraversableNode(currentNode)) {
      if (isContainingBlock(currentNode)) {
        return currentNode;
      } else if (isTopLayer(currentNode)) {
        return null;
      }
      currentNode = getParentNode(currentNode);
    }
    return null;
  }
  function isWebKit() {
    if (isWebKitValue == null) {
      isWebKitValue = typeof CSS !== "undefined" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none");
    }
    return isWebKitValue;
  }
  function isLastTraversableNode(node) {
    return /^(html|body|#document)$/.test(getNodeName(node));
  }
  function getComputedStyle2(element) {
    return getWindow(element).getComputedStyle(element);
  }
  function getNodeScroll(element) {
    if (isElement(element)) {
      return {
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop
      };
    }
    return {
      scrollLeft: element.scrollX,
      scrollTop: element.scrollY
    };
  }
  function getParentNode(node) {
    if (getNodeName(node) === "html") {
      return node;
    }
    const result = (
      // Step into the shadow DOM of the parent of a slotted node.
      node.assignedSlot || // DOM Element detected.
      node.parentNode || // ShadowRoot detected.
      isShadowRoot(node) && node.host || // Fallback.
      getDocumentElement(node)
    );
    return isShadowRoot(result) ? result.host : result;
  }
  function getNearestOverflowAncestor(node) {
    const parentNode = getParentNode(node);
    if (isLastTraversableNode(parentNode)) {
      return (node.ownerDocument || node).body;
    }
    if (isHTMLElement(parentNode) && isOverflowElement(parentNode)) {
      return parentNode;
    }
    return getNearestOverflowAncestor(parentNode);
  }
  function getOverflowAncestors(node, list, traverseIframes) {
    var _node$ownerDocument2;
    if (list === void 0) {
      list = [];
    }
    if (traverseIframes === void 0) {
      traverseIframes = true;
    }
    const scrollableAncestor = getNearestOverflowAncestor(node);
    const isBody = scrollableAncestor === ((_node$ownerDocument2 = node.ownerDocument) == null ? void 0 : _node$ownerDocument2.body);
    const win = getWindow(scrollableAncestor);
    if (isBody) {
      const frameElement = getFrameElement(win);
      return list.concat(win, win.visualViewport || [], isOverflowElement(scrollableAncestor) ? scrollableAncestor : [], frameElement && traverseIframes ? getOverflowAncestors(frameElement) : []);
    } else {
      return list.concat(scrollableAncestor, getOverflowAncestors(scrollableAncestor, [], traverseIframes));
    }
  }
  function getFrameElement(win) {
    return win.parent && Object.getPrototypeOf(win.parent) ? win.frameElement : null;
  }

  // ../../node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs
  function getCssDimensions(element) {
    const css = getComputedStyle2(element);
    let width = parseFloat(css.width) || 0;
    let height = parseFloat(css.height) || 0;
    const hasOffset = isHTMLElement(element);
    const offsetWidth = hasOffset ? element.offsetWidth : width;
    const offsetHeight = hasOffset ? element.offsetHeight : height;
    const shouldFallback = round(width) !== offsetWidth || round(height) !== offsetHeight;
    if (shouldFallback) {
      width = offsetWidth;
      height = offsetHeight;
    }
    return {
      width,
      height,
      $: shouldFallback
    };
  }
  function unwrapElement(element) {
    return !isElement(element) ? element.contextElement : element;
  }
  function getScale(element) {
    const domElement = unwrapElement(element);
    if (!isHTMLElement(domElement)) {
      return createCoords(1);
    }
    const rect = domElement.getBoundingClientRect();
    const {
      width,
      height,
      $: $3
    } = getCssDimensions(domElement);
    let x2 = ($3 ? round(rect.width) : rect.width) / width;
    let y3 = ($3 ? round(rect.height) : rect.height) / height;
    if (!x2 || !Number.isFinite(x2)) {
      x2 = 1;
    }
    if (!y3 || !Number.isFinite(y3)) {
      y3 = 1;
    }
    return {
      x: x2,
      y: y3
    };
  }
  var noOffsets = /* @__PURE__ */ createCoords(0);
  function getVisualOffsets(element) {
    const win = getWindow(element);
    if (!isWebKit() || !win.visualViewport) {
      return noOffsets;
    }
    return {
      x: win.visualViewport.offsetLeft,
      y: win.visualViewport.offsetTop
    };
  }
  function shouldAddVisualOffsets(element, isFixed, floatingOffsetParent) {
    if (isFixed === void 0) {
      isFixed = false;
    }
    return !!floatingOffsetParent && isFixed && floatingOffsetParent === getWindow(element);
  }
  function getBoundingClientRect(element, includeScale, isFixedStrategy, offsetParent) {
    if (includeScale === void 0) {
      includeScale = false;
    }
    if (isFixedStrategy === void 0) {
      isFixedStrategy = false;
    }
    const clientRect = element.getBoundingClientRect();
    const domElement = unwrapElement(element);
    let scale = createCoords(1);
    if (includeScale) {
      if (offsetParent) {
        if (isElement(offsetParent)) {
          scale = getScale(offsetParent);
        }
      } else {
        scale = getScale(element);
      }
    }
    const visualOffsets = shouldAddVisualOffsets(domElement, isFixedStrategy, offsetParent) ? getVisualOffsets(domElement) : createCoords(0);
    let x2 = (clientRect.left + visualOffsets.x) / scale.x;
    let y3 = (clientRect.top + visualOffsets.y) / scale.y;
    let width = clientRect.width / scale.x;
    let height = clientRect.height / scale.y;
    if (domElement && offsetParent) {
      const win = getWindow(domElement);
      const offsetWin = isElement(offsetParent) ? getWindow(offsetParent) : offsetParent;
      let currentWin = win;
      let currentIFrame = getFrameElement(currentWin);
      while (currentIFrame && offsetWin !== currentWin) {
        const iframeScale = getScale(currentIFrame);
        const iframeRect = currentIFrame.getBoundingClientRect();
        const css = getComputedStyle2(currentIFrame);
        const left = iframeRect.left + (currentIFrame.clientLeft + parseFloat(css.paddingLeft)) * iframeScale.x;
        const top = iframeRect.top + (currentIFrame.clientTop + parseFloat(css.paddingTop)) * iframeScale.y;
        x2 *= iframeScale.x;
        y3 *= iframeScale.y;
        width *= iframeScale.x;
        height *= iframeScale.y;
        x2 += left;
        y3 += top;
        currentWin = getWindow(currentIFrame);
        currentIFrame = getFrameElement(currentWin);
      }
    }
    return rectToClientRect({
      width,
      height,
      x: x2,
      y: y3
    });
  }
  function getWindowScrollBarX(element, rect) {
    const leftScroll = getNodeScroll(element).scrollLeft;
    if (!rect) {
      return getBoundingClientRect(getDocumentElement(element)).left + leftScroll;
    }
    return rect.left + leftScroll;
  }
  function getHTMLOffset(documentElement, scroll) {
    const htmlRect = documentElement.getBoundingClientRect();
    const x2 = htmlRect.left + scroll.scrollLeft - getWindowScrollBarX(documentElement, htmlRect);
    const y3 = htmlRect.top + scroll.scrollTop;
    return {
      x: x2,
      y: y3
    };
  }
  function convertOffsetParentRelativeRectToViewportRelativeRect(_ref) {
    let {
      elements,
      rect,
      offsetParent,
      strategy
    } = _ref;
    const isFixed = strategy === "fixed";
    const documentElement = getDocumentElement(offsetParent);
    const topLayer = elements ? isTopLayer(elements.floating) : false;
    if (offsetParent === documentElement || topLayer && isFixed) {
      return rect;
    }
    let scroll = {
      scrollLeft: 0,
      scrollTop: 0
    };
    let scale = createCoords(1);
    const offsets = createCoords(0);
    const isOffsetParentAnElement = isHTMLElement(offsetParent);
    if (isOffsetParentAnElement || !isFixed) {
      if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) {
        scroll = getNodeScroll(offsetParent);
      }
      if (isOffsetParentAnElement) {
        const offsetRect = getBoundingClientRect(offsetParent);
        scale = getScale(offsetParent);
        offsets.x = offsetRect.x + offsetParent.clientLeft;
        offsets.y = offsetRect.y + offsetParent.clientTop;
      }
    }
    const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
    return {
      width: rect.width * scale.x,
      height: rect.height * scale.y,
      x: rect.x * scale.x - scroll.scrollLeft * scale.x + offsets.x + htmlOffset.x,
      y: rect.y * scale.y - scroll.scrollTop * scale.y + offsets.y + htmlOffset.y
    };
  }
  function getClientRects(element) {
    return element.getClientRects ? Array.from(element.getClientRects()) : [];
  }
  function getDocumentRect(html) {
    const scroll = getNodeScroll(html);
    const body = html.ownerDocument.body;
    const width = max(html.scrollWidth, html.clientWidth, body.scrollWidth, body.clientWidth);
    const height = max(html.scrollHeight, html.clientHeight, body.scrollHeight, body.clientHeight);
    let x2 = -scroll.scrollLeft + getWindowScrollBarX(html);
    const y3 = -scroll.scrollTop;
    if (getComputedStyle2(body).direction === "rtl") {
      x2 += max(html.clientWidth, body.clientWidth) - width;
    }
    return {
      width,
      height,
      x: x2,
      y: y3
    };
  }
  var SCROLLBAR_MAX = 25;
  function getViewportRect(element, strategy, rootBoundary) {
    if (rootBoundary === void 0) {
      rootBoundary = "viewport";
    }
    const isLayoutViewport = rootBoundary === "layoutViewport";
    const win = getWindow(element);
    const html = getDocumentElement(element);
    const visualViewport = win.visualViewport;
    let width = html.clientWidth;
    let height = html.clientHeight;
    let x2 = 0;
    let y3 = 0;
    if (visualViewport) {
      const layoutRelativeClientCoords = !isWebKit() || strategy === "fixed";
      if (isLayoutViewport) {
        if (!layoutRelativeClientCoords) {
          x2 = -visualViewport.offsetLeft;
          y3 = -visualViewport.offsetTop;
        }
      } else {
        width = visualViewport.width;
        height = visualViewport.height;
        if (layoutRelativeClientCoords) {
          x2 = visualViewport.offsetLeft;
          y3 = visualViewport.offsetTop;
        }
      }
    }
    const windowScrollbarX = getWindowScrollBarX(html);
    if (windowScrollbarX <= 0) {
      const doc = html.ownerDocument;
      const body = doc.body;
      const bodyStyles = getComputedStyle(body);
      const bodyMarginInline = doc.compatMode === "CSS1Compat" ? parseFloat(bodyStyles.marginLeft) + parseFloat(bodyStyles.marginRight) || 0 : 0;
      const reservedWidth = Math.abs(html.clientWidth - body.clientWidth - bodyMarginInline);
      const gutter = getComputedStyle(html).scrollbarGutter === "stable both-edges" ? reservedWidth / 2 : reservedWidth;
      if (gutter <= SCROLLBAR_MAX) {
        width -= gutter;
      }
    }
    return {
      width,
      height,
      x: x2,
      y: y3
    };
  }
  function getInnerBoundingClientRect(element, strategy) {
    const clientRect = getBoundingClientRect(element, true, strategy === "fixed");
    const top = clientRect.top + element.clientTop;
    const left = clientRect.left + element.clientLeft;
    const scale = getScale(element);
    const width = element.clientWidth * scale.x;
    const height = element.clientHeight * scale.y;
    const x2 = left * scale.x;
    const y3 = top * scale.y;
    return {
      width,
      height,
      x: x2,
      y: y3
    };
  }
  function getClientRectFromClippingAncestor(element, clippingAncestor, strategy) {
    let rect;
    if (clippingAncestor === "viewport" || clippingAncestor === "layoutViewport") {
      rect = getViewportRect(element, strategy, clippingAncestor);
    } else if (clippingAncestor === "document") {
      rect = getDocumentRect(getDocumentElement(element));
    } else if (isElement(clippingAncestor)) {
      rect = getInnerBoundingClientRect(clippingAncestor, strategy);
    } else {
      const visualOffsets = getVisualOffsets(element);
      rect = {
        x: clippingAncestor.x - visualOffsets.x,
        y: clippingAncestor.y - visualOffsets.y,
        width: clippingAncestor.width,
        height: clippingAncestor.height
      };
    }
    return rectToClientRect(rect);
  }
  function getClippingElementAncestors(element, cache) {
    const cachedResult = cache.get(element);
    if (cachedResult) {
      return cachedResult;
    }
    let result = getOverflowAncestors(element, [], false).filter((el) => isElement(el) && getNodeName(el) !== "body");
    let lastKeptComputedStyle = null;
    const elementIsFixed = getComputedStyle2(element).position === "fixed";
    let currentNode = elementIsFixed ? getParentNode(element) : element;
    while (isElement(currentNode) && !isLastTraversableNode(currentNode)) {
      const computedStyle = getComputedStyle2(currentNode);
      const currentNodeIsContaining = isContainingBlock(currentNode);
      const lastPosition = lastKeptComputedStyle ? lastKeptComputedStyle.position : elementIsFixed ? "fixed" : "";
      const shouldDropCurrentNode = !currentNodeIsContaining && (lastPosition === "fixed" || lastPosition === "absolute" && computedStyle.position === "static");
      if (shouldDropCurrentNode) {
        result = result.filter((ancestor) => ancestor !== currentNode);
      } else {
        lastKeptComputedStyle = computedStyle;
      }
      currentNode = getParentNode(currentNode);
    }
    cache.set(element, result);
    return result;
  }
  function getClippingRect(_ref) {
    let {
      element,
      boundary,
      rootBoundary,
      strategy
    } = _ref;
    const elementClippingAncestors = boundary === "clippingAncestors" ? isTopLayer(element) ? [] : getClippingElementAncestors(element, this._c) : [].concat(boundary);
    const clippingAncestors = [...elementClippingAncestors, rootBoundary];
    const firstRect = getClientRectFromClippingAncestor(element, clippingAncestors[0], strategy);
    let top = firstRect.top;
    let right = firstRect.right;
    let bottom = firstRect.bottom;
    let left = firstRect.left;
    for (let i8 = 1; i8 < clippingAncestors.length; i8++) {
      const rect = getClientRectFromClippingAncestor(element, clippingAncestors[i8], strategy);
      top = max(rect.top, top);
      right = min(rect.right, right);
      bottom = min(rect.bottom, bottom);
      left = max(rect.left, left);
    }
    return {
      width: right - left,
      height: bottom - top,
      x: left,
      y: top
    };
  }
  function getDimensions(element) {
    const {
      width,
      height
    } = getCssDimensions(element);
    return {
      width,
      height
    };
  }
  function getRectRelativeToOffsetParent(element, offsetParent, strategy) {
    const isOffsetParentAnElement = isHTMLElement(offsetParent);
    const documentElement = getDocumentElement(offsetParent);
    const isFixed = strategy === "fixed";
    const rect = getBoundingClientRect(element, true, isFixed, offsetParent);
    let scroll = {
      scrollLeft: 0,
      scrollTop: 0
    };
    const offsets = createCoords(0);
    if (isOffsetParentAnElement || !isFixed) {
      if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) {
        scroll = getNodeScroll(offsetParent);
      }
      if (isOffsetParentAnElement) {
        const offsetRect = getBoundingClientRect(offsetParent, true, isFixed, offsetParent);
        offsets.x = offsetRect.x + offsetParent.clientLeft;
        offsets.y = offsetRect.y + offsetParent.clientTop;
      }
    }
    if (!isOffsetParentAnElement && documentElement) {
      offsets.x = getWindowScrollBarX(documentElement);
    }
    const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
    const x2 = rect.left + scroll.scrollLeft - offsets.x - htmlOffset.x;
    const y3 = rect.top + scroll.scrollTop - offsets.y - htmlOffset.y;
    return {
      x: x2,
      y: y3,
      width: rect.width,
      height: rect.height
    };
  }
  function isStaticPositioned(element) {
    return getComputedStyle2(element).position === "static";
  }
  function getTrueOffsetParent(element, polyfill) {
    if (!isHTMLElement(element) || getComputedStyle2(element).position === "fixed") {
      return null;
    }
    if (polyfill) {
      return polyfill(element);
    }
    let rawOffsetParent = element.offsetParent;
    if (getDocumentElement(element) === rawOffsetParent) {
      rawOffsetParent = rawOffsetParent.ownerDocument.body;
    }
    return rawOffsetParent;
  }
  function getOffsetParent(element, polyfill) {
    const win = getWindow(element);
    if (isTopLayer(element)) {
      return win;
    }
    if (!isHTMLElement(element)) {
      let svgOffsetParent = getParentNode(element);
      while (svgOffsetParent && !isLastTraversableNode(svgOffsetParent)) {
        if (isElement(svgOffsetParent) && !isStaticPositioned(svgOffsetParent)) {
          return svgOffsetParent;
        }
        svgOffsetParent = getParentNode(svgOffsetParent);
      }
      return win;
    }
    let offsetParent = getTrueOffsetParent(element, polyfill);
    while (offsetParent && isTableElement(offsetParent) && isStaticPositioned(offsetParent)) {
      offsetParent = getTrueOffsetParent(offsetParent, polyfill);
    }
    if (offsetParent && isLastTraversableNode(offsetParent) && isStaticPositioned(offsetParent) && !isContainingBlock(offsetParent)) {
      return win;
    }
    return offsetParent || getContainingBlock(element) || win;
  }
  var getElementRects = async function(data) {
    const getOffsetParentFn = this.getOffsetParent || getOffsetParent;
    const getDimensionsFn = this.getDimensions;
    const floatingDimensions = await getDimensionsFn(data.floating);
    return {
      reference: getRectRelativeToOffsetParent(data.reference, await getOffsetParentFn(data.floating), data.strategy),
      floating: {
        x: 0,
        y: 0,
        width: floatingDimensions.width,
        height: floatingDimensions.height
      }
    };
  };
  function isRTL(element) {
    return getComputedStyle2(element).direction === "rtl";
  }
  var platform = {
    convertOffsetParentRelativeRectToViewportRelativeRect,
    getDocumentElement,
    getClippingRect,
    getOffsetParent,
    getElementRects,
    getClientRects,
    getDimensions,
    getScale,
    isElement,
    isRTL
  };
  function rectsAreEqual(a4, b3) {
    return a4.x === b3.x && a4.y === b3.y && a4.width === b3.width && a4.height === b3.height;
  }
  function observeMove(element, onMove, ancestorResize) {
    let io = null;
    let timeoutId;
    const root = getDocumentElement(element);
    function cleanup() {
      var _io;
      clearTimeout(timeoutId);
      (_io = io) == null || _io.disconnect();
      io = null;
    }
    function refresh(skip, threshold) {
      if (skip === void 0) {
        skip = false;
      }
      if (threshold === void 0) {
        threshold = 1;
      }
      cleanup();
      const elementRectForRootMargin = element.getBoundingClientRect();
      const {
        left,
        top,
        width,
        height
      } = elementRectForRootMargin;
      if (!skip) {
        onMove();
      }
      if (!width || !height) {
        return;
      }
      const insetTop = floor(top);
      const insetRight = floor(root.clientWidth - (left + width));
      const insetBottom = floor(root.clientHeight - (top + height));
      const insetLeft = floor(left);
      const rootMargin = -insetTop + "px " + -insetRight + "px " + -insetBottom + "px " + -insetLeft + "px";
      const options = {
        rootMargin,
        threshold: max(0, min(1, threshold)) || 1
      };
      let isFirstUpdate = true;
      function handleObserve(entries) {
        const ratio = entries[0].intersectionRatio;
        if (!rectsAreEqual(elementRectForRootMargin, element.getBoundingClientRect())) {
          return refresh();
        }
        if (ratio !== threshold) {
          if (!isFirstUpdate) {
            return refresh();
          }
          if (!ratio) {
            timeoutId = setTimeout(() => {
              refresh(false, 1e-7);
            }, 1e3);
          } else {
            refresh(false, ratio);
          }
        }
        isFirstUpdate = false;
      }
      try {
        io = new IntersectionObserver(handleObserve, {
          ...options,
          // Handle <iframe>s
          root: root.ownerDocument
        });
      } catch (_e) {
        io = new IntersectionObserver(handleObserve, options);
      }
      io.observe(element);
    }
    const win = getWindow(element);
    const handleResize = () => refresh(ancestorResize);
    win.addEventListener("resize", handleResize);
    refresh(true);
    return () => {
      win.removeEventListener("resize", handleResize);
      cleanup();
    };
  }
  function autoUpdate(reference, floating, update2, options) {
    if (options === void 0) {
      options = {};
    }
    const {
      ancestorScroll = true,
      ancestorResize = true,
      elementResize = typeof ResizeObserver === "function",
      layoutShift = typeof IntersectionObserver === "function",
      animationFrame = false
    } = options;
    const referenceEl = unwrapElement(reference);
    const ancestors = ancestorScroll || ancestorResize ? [...referenceEl ? getOverflowAncestors(referenceEl) : [], ...floating ? getOverflowAncestors(floating) : []] : [];
    ancestors.forEach((ancestor) => {
      ancestorScroll && ancestor.addEventListener("scroll", update2);
      ancestorResize && ancestor.addEventListener("resize", update2);
    });
    const cleanupIo = referenceEl && layoutShift ? observeMove(referenceEl, update2, ancestorResize) : null;
    let reobserveFrame = -1;
    let resizeObserver = null;
    if (elementResize) {
      resizeObserver = new ResizeObserver((_ref) => {
        let [firstEntry] = _ref;
        if (firstEntry && firstEntry.target === referenceEl && resizeObserver && floating) {
          resizeObserver.unobserve(floating);
          cancelAnimationFrame(reobserveFrame);
          reobserveFrame = requestAnimationFrame(() => {
            var _resizeObserver;
            (_resizeObserver = resizeObserver) == null || _resizeObserver.observe(floating);
          });
        }
        update2();
      });
      if (referenceEl && !animationFrame) {
        resizeObserver.observe(referenceEl);
      }
      if (floating) {
        resizeObserver.observe(floating);
      }
    }
    let frameId;
    let prevRefRect = animationFrame ? getBoundingClientRect(reference) : null;
    if (animationFrame) {
      frameLoop();
    }
    function frameLoop() {
      const nextRefRect = getBoundingClientRect(reference);
      if (prevRefRect && !rectsAreEqual(prevRefRect, nextRefRect)) {
        update2();
      }
      prevRefRect = nextRefRect;
      frameId = requestAnimationFrame(frameLoop);
    }
    update2();
    return () => {
      var _resizeObserver2;
      ancestors.forEach((ancestor) => {
        ancestorScroll && ancestor.removeEventListener("scroll", update2);
        ancestorResize && ancestor.removeEventListener("resize", update2);
      });
      cleanupIo == null || cleanupIo();
      (_resizeObserver2 = resizeObserver) == null || _resizeObserver2.disconnect();
      resizeObserver = null;
      if (animationFrame) {
        cancelAnimationFrame(frameId);
      }
    };
  }
  var offset2 = offset;
  var shift2 = shift;
  var flip2 = flip;
  var size2 = size;
  var arrow2 = arrow;
  var computePosition2 = (reference, floating, options) => {
    const cache = /* @__PURE__ */ new Map();
    const mergedOptions = options != null ? options : {};
    const platformWithCache = {
      ...platform,
      ...mergedOptions.platform,
      _c: cache
    };
    return computePosition(reference, floating, {
      ...mergedOptions,
      platform: platformWithCache
    });
  };

  // ../../node_modules/composed-offset-position/dist/composed-offset-position.browser.min.mjs
  function e9(t6) {
    return i6(t6);
  }
  function r7(t6) {
    return t6.assignedSlot ? t6.assignedSlot : t6.parentNode instanceof ShadowRoot ? t6.parentNode.host : t6.parentNode;
  }
  function i6(e10) {
    for (let t6 = e10; t6; t6 = r7(t6)) if (t6 instanceof Element && "none" === getComputedStyle(t6).display) return null;
    for (let n6 = r7(e10); n6; n6 = r7(n6)) {
      if (!(n6 instanceof Element)) continue;
      const e11 = getComputedStyle(n6);
      if ("contents" !== e11.display) {
        if ("static" !== e11.position || isContainingBlock(e11)) return n6;
        if ("BODY" === n6.tagName) return n6;
      }
    }
    return null;
  }

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.UEBQI7VV.js
  function isVirtualElement(e10) {
    return e10 !== null && typeof e10 === "object" && "getBoundingClientRect" in e10 && ("contextElement" in e10 ? e10 instanceof Element : true);
  }
  var SUPPORTS_POPOVER = Boolean(globalThis?.HTMLElement?.prototype.hasOwnProperty("popover"));
  var WaPopup = class extends WebAwesomeElement {
    constructor() {
      super(...arguments);
      this.localize = new LocalizeController2(this);
      this.SUPPORTS_POPOVER = false;
      this.active = false;
      this.placement = "top";
      this.boundary = "viewport";
      this.distance = 0;
      this.skidding = 0;
      this.arrow = false;
      this.arrowPlacement = "anchor";
      this.arrowPadding = 10;
      this.flip = false;
      this.flipFallbackPlacements = "";
      this.flipFallbackStrategy = "best-fit";
      this.flipPadding = 0;
      this.shift = false;
      this.shiftPadding = 0;
      this.autoSizePadding = 0;
      this.hoverBridge = false;
      this.updateHoverBridge = () => {
        if (this.hoverBridge && this.anchorEl && this.popup) {
          const anchorRect = this.anchorEl.getBoundingClientRect();
          const popupRect = this.popup.getBoundingClientRect();
          const isVertical = this.placement.includes("top") || this.placement.includes("bottom");
          let topLeftX = 0;
          let topLeftY = 0;
          let topRightX = 0;
          let topRightY = 0;
          let bottomLeftX = 0;
          let bottomLeftY = 0;
          let bottomRightX = 0;
          let bottomRightY = 0;
          if (isVertical) {
            if (anchorRect.top < popupRect.top) {
              topLeftX = anchorRect.left;
              topLeftY = anchorRect.bottom;
              topRightX = anchorRect.right;
              topRightY = anchorRect.bottom;
              bottomLeftX = popupRect.left;
              bottomLeftY = popupRect.top;
              bottomRightX = popupRect.right;
              bottomRightY = popupRect.top;
            } else {
              topLeftX = popupRect.left;
              topLeftY = popupRect.bottom;
              topRightX = popupRect.right;
              topRightY = popupRect.bottom;
              bottomLeftX = anchorRect.left;
              bottomLeftY = anchorRect.top;
              bottomRightX = anchorRect.right;
              bottomRightY = anchorRect.top;
            }
          } else {
            if (anchorRect.left < popupRect.left) {
              topLeftX = anchorRect.right;
              topLeftY = anchorRect.top;
              topRightX = popupRect.left;
              topRightY = popupRect.top;
              bottomLeftX = anchorRect.right;
              bottomLeftY = anchorRect.bottom;
              bottomRightX = popupRect.left;
              bottomRightY = popupRect.bottom;
            } else {
              topLeftX = popupRect.right;
              topLeftY = popupRect.top;
              topRightX = anchorRect.left;
              topRightY = anchorRect.top;
              bottomLeftX = popupRect.right;
              bottomLeftY = popupRect.bottom;
              bottomRightX = anchorRect.left;
              bottomRightY = anchorRect.bottom;
            }
          }
          this.style.setProperty("--hover-bridge-top-left-x", `${topLeftX}px`);
          this.style.setProperty("--hover-bridge-top-left-y", `${topLeftY}px`);
          this.style.setProperty("--hover-bridge-top-right-x", `${topRightX}px`);
          this.style.setProperty("--hover-bridge-top-right-y", `${topRightY}px`);
          this.style.setProperty("--hover-bridge-bottom-left-x", `${bottomLeftX}px`);
          this.style.setProperty("--hover-bridge-bottom-left-y", `${bottomLeftY}px`);
          this.style.setProperty("--hover-bridge-bottom-right-x", `${bottomRightX}px`);
          this.style.setProperty("--hover-bridge-bottom-right-y", `${bottomRightY}px`);
        }
      };
    }
    async connectedCallback() {
      super.connectedCallback();
      await this.updateComplete;
      this.SUPPORTS_POPOVER = SUPPORTS_POPOVER;
      this.start();
    }
    disconnectedCallback() {
      super.disconnectedCallback();
      this.stop();
    }
    async updated(changedProperties) {
      super.updated(changedProperties);
      if (changedProperties.has("active")) {
        if (this.active) {
          this.start();
        } else {
          this.stop();
        }
      }
      if (changedProperties.has("anchor")) {
        this.handleAnchorChange();
      }
      if (this.active) {
        await this.updateComplete;
        this.reposition();
      }
    }
    async handleAnchorChange() {
      await this.stop();
      if (this.anchor && typeof this.anchor === "string") {
        const root = this.getRootNode();
        this.anchorEl = root.getElementById(this.anchor);
      } else if (this.anchor instanceof Element || isVirtualElement(this.anchor)) {
        this.anchorEl = this.anchor;
      } else {
        this.anchorEl = this.querySelector('[slot="anchor"]');
      }
      if (this.anchorEl instanceof HTMLSlotElement) {
        this.anchorEl = this.anchorEl.assignedElements({ flatten: true })[0];
      }
      if (this.anchorEl) {
        this.start();
      }
    }
    start() {
      if (!this.anchorEl || !this.active || !this.isConnected) {
        return;
      }
      this.popup?.showPopover?.();
      this.cleanup = autoUpdate(this.anchorEl, this.popup, () => {
        this.reposition();
      });
    }
    async stop() {
      return new Promise((resolve) => {
        this.popup?.hidePopover?.();
        if (this.cleanup) {
          this.cleanup();
          this.cleanup = void 0;
          this.removeAttribute("data-current-placement");
          this.style.removeProperty("--auto-size-available-width");
          this.style.removeProperty("--auto-size-available-height");
          requestAnimationFrame(() => resolve());
        } else {
          resolve();
        }
      });
    }
    /** Forces the popup to recalculate and reposition itself. */
    reposition() {
      if (!this.active || !this.anchorEl || !this.popup) {
        return;
      }
      const middleware = [
        // The offset middleware goes first
        offset2({ mainAxis: this.distance, crossAxis: this.skidding })
      ];
      if (this.sync) {
        middleware.push(
          size2({
            apply: ({ rects }) => {
              const syncWidth = this.sync === "width" || this.sync === "both";
              const syncHeight = this.sync === "height" || this.sync === "both";
              this.popup.style.width = syncWidth ? `${rects.reference.width}px` : "";
              this.popup.style.height = syncHeight ? `${rects.reference.height}px` : "";
            }
          })
        );
      } else {
        this.popup.style.width = "";
        this.popup.style.height = "";
      }
      let defaultBoundary;
      if (this.SUPPORTS_POPOVER && !isVirtualElement(this.anchor) && this.boundary === "scroll") {
        defaultBoundary = getOverflowAncestors(this.anchorEl).filter((el) => el instanceof Element);
      }
      if (this.flip) {
        middleware.push(
          flip2({
            boundary: this.flipBoundary || defaultBoundary,
            // @ts-expect-error - We're converting a string attribute to an array here
            fallbackPlacements: this.flipFallbackPlacements,
            fallbackStrategy: this.flipFallbackStrategy === "best-fit" ? "bestFit" : "initialPlacement",
            padding: this.flipPadding
          })
        );
      }
      if (this.shift) {
        middleware.push(
          shift2({
            boundary: this.shiftBoundary || defaultBoundary,
            padding: this.shiftPadding
          })
        );
      }
      if (this.autoSize) {
        middleware.push(
          size2({
            boundary: this.autoSizeBoundary || defaultBoundary,
            padding: this.autoSizePadding,
            apply: ({ availableWidth, availableHeight }) => {
              if (this.autoSize === "vertical" || this.autoSize === "both") {
                this.style.setProperty("--auto-size-available-height", `${availableHeight}px`);
              } else {
                this.style.removeProperty("--auto-size-available-height");
              }
              if (this.autoSize === "horizontal" || this.autoSize === "both") {
                this.style.setProperty("--auto-size-available-width", `${availableWidth}px`);
              } else {
                this.style.removeProperty("--auto-size-available-width");
              }
            }
          })
        );
      } else {
        this.style.removeProperty("--auto-size-available-width");
        this.style.removeProperty("--auto-size-available-height");
      }
      if (this.arrow) {
        middleware.push(
          arrow2({
            element: this.arrowEl,
            padding: this.arrowPadding
          })
        );
      }
      const getOffsetParent2 = this.SUPPORTS_POPOVER ? (element) => platform.getOffsetParent(element, e9) : platform.getOffsetParent;
      computePosition2(this.anchorEl, this.popup, {
        placement: this.placement,
        middleware,
        strategy: this.SUPPORTS_POPOVER ? "absolute" : "fixed",
        platform: {
          ...platform,
          getOffsetParent: getOffsetParent2
        }
      }).then(({ x: x2, y: y3, middlewareData, placement }) => {
        const isRtl = this.localize.dir() === "rtl";
        const staticSide = { top: "bottom", right: "left", bottom: "top", left: "right" }[placement.split("-")[0]];
        this.setAttribute("data-current-placement", placement);
        Object.assign(this.popup.style, {
          left: `${x2}px`,
          top: `${y3}px`
        });
        if (this.arrow) {
          const arrowX = middlewareData.arrow.x;
          const arrowY = middlewareData.arrow.y;
          let top = "";
          let right = "";
          let bottom = "";
          let left = "";
          if (this.arrowPlacement === "start") {
            const value = typeof arrowX === "number" ? `calc(${this.arrowPadding}px - var(--arrow-padding-offset))` : "";
            top = typeof arrowY === "number" ? `calc(${this.arrowPadding}px - var(--arrow-padding-offset))` : "";
            right = isRtl ? value : "";
            left = isRtl ? "" : value;
          } else if (this.arrowPlacement === "end") {
            const value = typeof arrowX === "number" ? `calc(${this.arrowPadding}px - var(--arrow-padding-offset))` : "";
            right = isRtl ? "" : value;
            left = isRtl ? value : "";
            bottom = typeof arrowY === "number" ? `calc(${this.arrowPadding}px - var(--arrow-padding-offset))` : "";
          } else if (this.arrowPlacement === "center") {
            left = typeof arrowX === "number" ? `calc(50% - var(--arrow-size-diagonal))` : "";
            top = typeof arrowY === "number" ? `calc(50% - var(--arrow-size-diagonal))` : "";
          } else {
            left = typeof arrowX === "number" ? `${arrowX}px` : "";
            top = typeof arrowY === "number" ? `${arrowY}px` : "";
          }
          Object.assign(this.arrowEl.style, {
            top,
            right,
            bottom,
            left,
            [staticSide]: "calc(var(--arrow-base-offset) - var(--arrow-size-diagonal))"
          });
        }
      });
      requestAnimationFrame(() => this.updateHoverBridge());
      this.dispatchEvent(new WaRepositionEvent());
    }
    render() {
      return b2`
      <slot name="anchor" @slotchange=${this.handleAnchorChange}></slot>

      <span
        part="hover-bridge"
        class=${e7({
        "popup-hover-bridge": true,
        "popup-hover-bridge-visible": this.hoverBridge && this.active
      })}
      ></span>

      <div
        popover="manual"
        part="popup"
        class=${e7({
        popup: true,
        "popup-active": this.active,
        "popup-fixed": !this.SUPPORTS_POPOVER,
        "popup-has-arrow": this.arrow
      })}
      >
        <slot></slot>
        ${this.arrow ? b2`<div part="arrow" class="arrow" role="presentation"></div>` : ""}
      </div>
    `;
    }
  };
  WaPopup.css = popup_styles_default;
  __decorateClass([
    e6(".popup")
  ], WaPopup.prototype, "popup", 2);
  __decorateClass([
    e6(".arrow")
  ], WaPopup.prototype, "arrowEl", 2);
  __decorateClass([
    n4({ attribute: false, type: Boolean })
  ], WaPopup.prototype, "SUPPORTS_POPOVER", 2);
  __decorateClass([
    n4()
  ], WaPopup.prototype, "anchor", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaPopup.prototype, "active", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaPopup.prototype, "placement", 2);
  __decorateClass([
    n4()
  ], WaPopup.prototype, "boundary", 2);
  __decorateClass([
    n4({ type: Number })
  ], WaPopup.prototype, "distance", 2);
  __decorateClass([
    n4({ type: Number })
  ], WaPopup.prototype, "skidding", 2);
  __decorateClass([
    n4({ type: Boolean })
  ], WaPopup.prototype, "arrow", 2);
  __decorateClass([
    n4({ attribute: "arrow-placement" })
  ], WaPopup.prototype, "arrowPlacement", 2);
  __decorateClass([
    n4({ attribute: "arrow-padding", type: Number })
  ], WaPopup.prototype, "arrowPadding", 2);
  __decorateClass([
    n4({ type: Boolean })
  ], WaPopup.prototype, "flip", 2);
  __decorateClass([
    n4({
      attribute: "flip-fallback-placements",
      converter: {
        fromAttribute: (value) => {
          return value.split(" ").map((p4) => p4.trim()).filter((p4) => p4 !== "");
        },
        toAttribute: (value) => {
          return value.join(" ");
        }
      }
    })
  ], WaPopup.prototype, "flipFallbackPlacements", 2);
  __decorateClass([
    n4({ attribute: "flip-fallback-strategy" })
  ], WaPopup.prototype, "flipFallbackStrategy", 2);
  __decorateClass([
    n4({ type: Object })
  ], WaPopup.prototype, "flipBoundary", 2);
  __decorateClass([
    n4({ attribute: "flip-padding", type: Number })
  ], WaPopup.prototype, "flipPadding", 2);
  __decorateClass([
    n4({ type: Boolean })
  ], WaPopup.prototype, "shift", 2);
  __decorateClass([
    n4({ type: Object })
  ], WaPopup.prototype, "shiftBoundary", 2);
  __decorateClass([
    n4({ attribute: "shift-padding", type: Number })
  ], WaPopup.prototype, "shiftPadding", 2);
  __decorateClass([
    n4({ attribute: "auto-size" })
  ], WaPopup.prototype, "autoSize", 2);
  __decorateClass([
    n4()
  ], WaPopup.prototype, "sync", 2);
  __decorateClass([
    n4({ type: Object })
  ], WaPopup.prototype, "autoSizeBoundary", 2);
  __decorateClass([
    n4({ attribute: "auto-size-padding", type: Number })
  ], WaPopup.prototype, "autoSizePadding", 2);
  __decorateClass([
    n4({ attribute: "hover-bridge", type: Boolean })
  ], WaPopup.prototype, "hoverBridge", 2);
  WaPopup = __decorateClass([
    t5("wa-popup")
  ], WaPopup);

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.S35PLDPD.js
  var button_styles_default = i`
  @layer wa-component {
    :host {
      display: inline-block;

      /* Workaround because Chrome doesn't like :host(:has()) below
       * https://issues.chromium.org/issues/40062355
       * Firefox doesn't like this nested rule, so both are needed */
      &:has(wa-badge) {
        position: relative;
      }
    }

    /* Apply relative positioning only when needed to position wa-badge
     * This avoids creating a new stacking context for every button */
    :host(:has(wa-badge)) {
      position: relative;
    }
  }

  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    user-select: none;
    -webkit-user-select: none;
    white-space: nowrap;
    vertical-align: middle;
    transition-property: background, border, box-shadow, color, opacity, transform;
    transition-duration: var(--wa-transition-fast);
    transition-timing-function: var(--wa-transition-easing);
    transform-origin: center;
    cursor: pointer;
    padding: 0 var(--wa-form-control-padding-inline);
    font-family: inherit;
    font-size: inherit;
    font-weight: var(--wa-font-weight-action);
    height: var(--wa-form-control-height);
    width: 100%;

    background-color: var(--wa-color-fill-loud, var(--wa-color-neutral-fill-loud));

    border-color: transparent;
    color: var(--wa-color-on-loud, var(--wa-color-neutral-on-loud));
    border-start-start-radius: var(--_button-start-start-radius, var(--wa-form-control-border-radius));
    border-start-end-radius: var(--_button-start-end-radius, var(--wa-form-control-border-radius));
    border-end-start-radius: var(--_button-end-start-radius, var(--wa-form-control-border-radius));
    border-end-end-radius: var(--_button-end-end-radius, var(--wa-form-control-border-radius));
    border-style: var(--wa-form-control-border-style);
    border-width: var(--wa-form-control-border-width);
  }

  /* Hover and active transforms */
  .button:not(.disabled):not(.loading) {
    @media (hover: hover) {
      &:hover {
        transform: var(--wa-button-transform-hover);
      }
    }
    &:active {
      transform: var(--wa-button-transform-active);
    }

    @media (prefers-reduced-motion: reduce) {
      &:hover,
      &:active {
        transform: none;
      }
    }
  }

  /* Appearance modifiers */
  :host([appearance='plain']) {
    /* Indentation overrides for grouping */
    margin-inline-start: var(--_button-horizontal-indent);
    margin-block-start: var(--_button-vertical-indent);

    .button {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: transparent;
      border-color: transparent;
    }
    @media (hover: hover) {
      .button:not(.disabled):not(.loading):hover {
        color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
        background-color: var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet));
      }
    }
    .button:not(.disabled):not(.loading):active {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: color-mix(
        in oklab,
        var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet)),
        var(--wa-color-mix-active)
      );
    }
  }

  :host([appearance='outlined']) {
    /* Indentation overrides for grouping outlined */
    margin-inline-start: var(--_button-horizontal-indent-outlined);
    margin-block-start: var(--_button-vertical-indent-outlined);

    .button {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: transparent;
      border-color: var(--wa-color-border-loud, var(--wa-color-neutral-border-loud));
    }
    @media (hover: hover) {
      .button:not(.disabled):not(.loading):hover {
        color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
        background-color: var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet));
      }
    }
    .button:not(.disabled):not(.loading):active {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: color-mix(
        in oklab,
        var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet)),
        var(--wa-color-mix-active)
      );
    }
  }

  :host([appearance='filled']) {
    /* Indentation overrides for grouping */
    margin-inline-start: var(--_button-horizontal-indent);
    margin-block-start: var(--_button-vertical-indent);

    .button {
      color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
      background-color: var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal));
      border-color: transparent;
    }
    @media (hover: hover) {
      .button:not(.disabled):not(.loading):hover {
        color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
        background-color: color-mix(
          in oklab,
          var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal)),
          var(--wa-color-mix-hover)
        );
      }
    }
    .button:not(.disabled):not(.loading):active {
      color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
      background-color: color-mix(
        in oklab,
        var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal)),
        var(--wa-color-mix-active)
      );
    }
  }

  :host([appearance='filled-outlined']) {
    /* Indentation overrides for grouping outlined */
    margin-inline-start: var(--_button-horizontal-indent-outlined);
    margin-block-start: var(--_button-vertical-indent-outlined);

    .button {
      color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
      background-color: var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal));
      border-color: var(--wa-color-border-normal, var(--wa-color-neutral-border-normal));
    }
    @media (hover: hover) {
      .button:not(.disabled):not(.loading):hover {
        color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
        background-color: color-mix(
          in oklab,
          var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal)),
          var(--wa-color-mix-hover)
        );
      }
    }
    .button:not(.disabled):not(.loading):active {
      color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
      background-color: color-mix(
        in oklab,
        var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal)),
        var(--wa-color-mix-active)
      );
    }
  }

  :host([appearance='accent']) {
    /* Indentation overrides for grouping */
    margin-inline-start: var(--_button-horizontal-indent);
    margin-block-start: var(--_button-vertical-indent);

    .button {
      color: var(--wa-color-on-loud, var(--wa-color-neutral-on-loud));
      background-color: var(--wa-color-fill-loud, var(--wa-color-neutral-fill-loud));
      border-color: transparent;
    }
    @media (hover: hover) {
      .button:not(.disabled):not(.loading):hover {
        background-color: color-mix(
          in oklab,
          var(--wa-color-fill-loud, var(--wa-color-neutral-fill-loud)),
          var(--wa-color-mix-hover)
        );
      }
    }
    .button:not(.disabled):not(.loading):active {
      background-color: color-mix(
        in oklab,
        var(--wa-color-fill-loud, var(--wa-color-neutral-fill-loud)),
        var(--wa-color-mix-active)
      );
    }
  }

  /* Focus states */
  .button:focus {
    outline: none;
  }

  .button:focus-visible {
    outline: var(--wa-focus-ring);
    outline-offset: var(--wa-focus-ring-offset);
  }

  /* Disabled state */
  :host([disabled]) {
    opacity: 0.5;
    cursor: not-allowed;

    /* When disabled, prevent mouse events from bubbling up from children */
    .button {
      pointer-events: none;
    }
  }

  /* Keep it last so Safari doesn't stop parsing this block */
  .button::-moz-focus-inner {
    border: 0;
  }

  /* Icon buttons */
  .button.is-icon-button {
    outline-offset: 2px;
    width: var(--wa-form-control-height);
    aspect-ratio: 1;
  }

  /* Icon buttons with a caret need to grow to fit both the icon and the caret */
  .button.is-icon-button.caret {
    width: auto;
    aspect-ratio: auto;
    min-width: var(--wa-form-control-height);
  }

  /* Pill modifier */
  :host([pill]) .button {
    border-start-start-radius: var(--_button-start-start-radius, var(--wa-border-radius-pill));
    border-start-end-radius: var(--_button-start-end-radius, var(--wa-border-radius-pill));
    border-end-start-radius: var(--_button-end-start-radius, var(--wa-border-radius-pill));
    border-end-end-radius: var(--_button-end-end-radius, var(--wa-border-radius-pill));
  }

  /*
   * Label
   */

  .start,
  .end {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    pointer-events: none;
  }

  .label {
    display: inline-block;
  }

  .is-icon-button .label {
    display: flex;
    justify-content: center;
  }

  .label::slotted(wa-icon) {
    align-self: center;
  }

  /*
   * Caret modifier
   */

  wa-icon[part='caret'] {
    display: flex;
    align-self: center;
    align-items: center;

    &::part(svg) {
      width: 0.875em;
      height: 0.875em;
    }

    .button:has(&) .end {
      display: none;
    }
  }

  /*
   * Loading modifier
   */

  .loading {
    position: relative;
    cursor: wait;

    .start,
    .label,
    .end,
    .caret {
      /* Hidden with opacity, not visibility, so the label stays in the accessibility tree */
      opacity: 0;

      /* Unlike visibility: hidden, opacity leaves the content clickable */
      pointer-events: none;
    }

    wa-spinner {
      --indicator-color: currentColor;
      --track-color: color-mix(in oklab, currentColor, transparent 90%);

      position: absolute;
      font-size: 1em;
      height: 1em;
      width: 1em;
      top: calc(50% - 0.5em);
      left: calc(50% - 0.5em);
    }
  }

  /*
   * Badges
   */

  .button ::slotted(wa-badge) {
    border-color: var(--wa-color-surface-default);
    position: absolute;
    inset-block-start: 0;
    inset-inline-end: 0;
    translate: 50% -50%;
    pointer-events: none;
  }

  :host(:dir(rtl)) ::slotted(wa-badge) {
    translate: -50% -50%;
  }

  /*
  * Button spacing
  */

  slot[name='start']::slotted(*) {
    margin-inline-end: 0.75em;
  }

  slot[name='end']::slotted(*),
  .button:not(.visually-hidden-label) [part='caret'] {
    margin-inline-start: 0.75em;
  }
`;

  // ../../node_modules/lit-html/static.js
  var a3 = Symbol.for("");
  var o9 = (t6) => {
    if (t6?.r === a3) return t6?._$litStatic$;
  };
  var i7 = (t6, ...r8) => ({ _$litStatic$: r8.reduce((r9, e10, a4) => r9 + ((t7) => {
    if (void 0 !== t7._$litStatic$) return t7._$litStatic$;
    throw Error(`Value passed to 'literal' function must be a 'literal' result: ${t7}. Use 'unsafeStatic' to pass non-literal values, but
            take care to ensure page security.`);
  })(e10) + t6[a4 + 1], t6[0]), r: a3 });
  var l5 = /* @__PURE__ */ new Map();
  var n5 = (t6) => (r8, ...e10) => {
    const a4 = e10.length;
    let s4, i8;
    const n6 = [], u4 = [];
    let c5, $3 = 0, f3 = false;
    for (; $3 < a4; ) {
      for (c5 = r8[$3]; $3 < a4 && void 0 !== (i8 = e10[$3], s4 = o9(i8)); ) c5 += s4 + r8[++$3], f3 = true;
      $3 !== a4 && u4.push(i8), n6.push(c5), $3++;
    }
    if ($3 === a4 && n6.push(r8[a4]), f3) {
      const t7 = n6.join("$$lit$$");
      void 0 === (r8 = l5.get(t7)) && (n6.raw = n6, l5.set(t7, r8 = n6)), e10 = u4;
    }
    return t6(r8, ...e10);
  };
  var u3 = n5(b2);
  var c4 = n5(w);
  var $2 = n5(T);

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.LXLE4T4D.js
  var WaButton = class extends WebAwesomeFormAssociatedElement {
    constructor() {
      super(...arguments);
      this.assumeInteractionOn = ["click"];
      this.hasSlotController = new HasSlotController(this, "[default]", "start", "end");
      this.localize = new LocalizeController2(this);
      this.invalid = false;
      this.isIconButton = false;
      this.title = "";
      this.variant = "neutral";
      this.appearance = "accent";
      this.size = "m";
      this.withCaret = false;
      this.withStart = false;
      this.withEnd = false;
      this.disabled = false;
      this.loading = false;
      this.pill = false;
      this.type = "button";
    }
    static get validators() {
      return [...super.validators, MirrorValidator()];
    }
    handleSizeChange() {
      warnDeprecatedSize(this.localName, this.size);
    }
    constructLightDOMButton() {
      const button = document.createElement("button");
      for (const attribute of this.attributes) {
        if (attribute.name === "style") {
          continue;
        }
        button.setAttribute(attribute.name, attribute.value);
      }
      button.type = this.type;
      button.style.position = "absolute !important";
      button.style.width = "0 !important";
      button.style.height = "0 !important";
      button.style.clipPath = "inset(50%) !important";
      button.style.overflow = "hidden !important";
      button.style.whiteSpace = "nowrap !important";
      if (this.name) {
        button.name = this.name;
      }
      button.value = this.value || "";
      return button;
    }
    handleClick(event) {
      if (this.disabled || this.loading) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (this.type !== "submit" && this.type !== "reset") {
        return;
      }
      const form = this.getForm();
      if (!form) return;
      const lightDOMButton = this.constructLightDOMButton();
      this.parentElement?.append(lightDOMButton);
      lightDOMButton.click();
      lightDOMButton.remove();
    }
    handleInvalid() {
      this.dispatchEvent(new WaInvalidEvent());
    }
    handleLabelSlotChange() {
      const nodes = this.labelSlot.assignedNodes({ flatten: true });
      let hasIconLabel = false;
      let hasIcon = false;
      let hasText = false;
      let hasOtherElements = false;
      [...nodes].forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node;
          if (element.localName === "wa-icon") {
            hasIcon = true;
            if (!hasIconLabel) hasIconLabel = element.label !== void 0;
          } else {
            hasOtherElements = true;
          }
        } else if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent?.trim() || "";
          if (text.length > 0) {
            hasText = true;
          }
        }
      });
      this.isIconButton = hasIcon && !hasText && !hasOtherElements;
      this.customStates.set("icon-button", this.isIconButton);
      if (this.isIconButton && !hasIconLabel) {
        console.warn(
          'Icon buttons must have a label for screen readers. Add <wa-icon label="..."> to remove this warning.',
          this
        );
      }
    }
    isButton() {
      return this.href ? false : true;
    }
    isLink() {
      return this.href ? true : false;
    }
    handleDisabledChange() {
      this.customStates.set("disabled", this.disabled);
      this.updateValidity();
    }
    handleHrefChange() {
      this.customStates.set("link", this.isLink());
    }
    handleLoadingChange() {
      this.customStates.set("loading", this.loading);
    }
    // eslint-disable-next-line
    setValue(..._args) {
    }
    /** Simulates a click on the button. */
    click() {
      this.button.click();
    }
    /** Sets focus on the button. */
    focus(options) {
      this.button.focus(options);
    }
    /** Removes focus from the button. */
    blur() {
      this.button.blur();
    }
    render() {
      const isLink = this.isLink();
      const tag = isLink ? i7`a` : i7`button`;
      return u3`
      <${tag}
        part="base button"
        class=${e7({
        button: true,
        caret: this.withCaret,
        disabled: this.disabled,
        loading: this.loading,
        rtl: this.localize.dir() === "rtl",
        "has-label": this.hasSlotController.test("[default]"),
        "has-start": this.hasSlotController.test("start", "withStart"),
        "has-end": this.hasSlotController.test("end", "withEnd"),
        "is-icon-button": this.isIconButton
      })}
        ?disabled=${o7(isLink ? void 0 : this.disabled)}
        type=${o7(isLink ? void 0 : this.type)}
        title=${this.title}
        name=${o7(isLink ? void 0 : this.name)}
        value=${o7(isLink ? void 0 : this.value)}
        href=${o7(isLink ? this.href : void 0)}
        target=${o7(isLink ? this.target : void 0)}
        download=${o7(isLink ? this.download : void 0)}
        rel=${o7(isLink && this.rel ? this.rel : void 0)}
        role=${o7(isLink ? void 0 : "button")}
        aria-disabled=${o7(isLink && this.disabled ? "true" : void 0)}
        aria-busy=${this.loading ? "true" : "false"}
        tabindex=${this.disabled ? "-1" : "0"}
        @invalid=${this.isButton() ? this.handleInvalid : null}
        @click=${this.handleClick}
      >
        <slot name="start" part="start" class="start"></slot>
        <slot part="label" class="label" @slotchange=${this.handleLabelSlotChange}></slot>
        <slot name="end" part="end" class="end"></slot>
        ${this.withCaret ? u3`
                <wa-icon part="caret" class="caret" library="system" name="chevron-down" variant="solid"></wa-icon>
              ` : ""}
        ${this.loading ? u3`<wa-spinner part="spinner"></wa-spinner>` : ""}
      </${tag}>
    `;
    }
  };
  WaButton.shadowRootOptions = { ...WebAwesomeFormAssociatedElement.shadowRootOptions, delegatesFocus: true };
  WaButton.css = [button_styles_default, variants_styles_default, size_styles_default];
  __decorateClass([
    e6(".button")
  ], WaButton.prototype, "button", 2);
  __decorateClass([
    e6("slot:not([name])")
  ], WaButton.prototype, "labelSlot", 2);
  __decorateClass([
    r6()
  ], WaButton.prototype, "invalid", 2);
  __decorateClass([
    r6()
  ], WaButton.prototype, "isIconButton", 2);
  __decorateClass([
    n4()
  ], WaButton.prototype, "title", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaButton.prototype, "variant", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaButton.prototype, "appearance", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaButton.prototype, "size", 2);
  __decorateClass([
    watch("size")
  ], WaButton.prototype, "handleSizeChange", 1);
  __decorateClass([
    n4({ attribute: "with-caret", type: Boolean, reflect: true })
  ], WaButton.prototype, "withCaret", 2);
  __decorateClass([
    n4({ attribute: "with-start", type: Boolean })
  ], WaButton.prototype, "withStart", 2);
  __decorateClass([
    n4({ attribute: "with-end", type: Boolean })
  ], WaButton.prototype, "withEnd", 2);
  __decorateClass([
    n4({ type: Boolean })
  ], WaButton.prototype, "disabled", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaButton.prototype, "loading", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaButton.prototype, "pill", 2);
  __decorateClass([
    n4()
  ], WaButton.prototype, "type", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaButton.prototype, "name", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaButton.prototype, "value", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaButton.prototype, "href", 2);
  __decorateClass([
    n4()
  ], WaButton.prototype, "target", 2);
  __decorateClass([
    n4()
  ], WaButton.prototype, "rel", 2);
  __decorateClass([
    n4()
  ], WaButton.prototype, "download", 2);
  __decorateClass([
    n4({ attribute: "formaction" })
  ], WaButton.prototype, "formAction", 2);
  __decorateClass([
    n4({ attribute: "formenctype" })
  ], WaButton.prototype, "formEnctype", 2);
  __decorateClass([
    n4({ attribute: "formmethod" })
  ], WaButton.prototype, "formMethod", 2);
  __decorateClass([
    n4({ attribute: "formnovalidate", type: Boolean })
  ], WaButton.prototype, "formNoValidate", 2);
  __decorateClass([
    n4({ attribute: "formtarget" })
  ], WaButton.prototype, "formTarget", 2);
  __decorateClass([
    watch("disabled", { waitUntilFirstUpdate: true })
  ], WaButton.prototype, "handleDisabledChange", 1);
  __decorateClass([
    watch("href")
  ], WaButton.prototype, "handleHrefChange", 1);
  __decorateClass([
    watch("loading", { waitUntilFirstUpdate: true })
  ], WaButton.prototype, "handleLoadingChange", 1);
  WaButton = __decorateClass([
    t5("wa-button")
  ], WaButton);
  WaButton.disableWarning?.("change-in-update");

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.W7A2VLCT.js
  var spinner_styles_default = i`
  :host {
    --track-width: 2px;
    --track-color: var(--wa-color-neutral-fill-normal);
    --indicator-color: var(--wa-color-brand-fill-loud);
    --speed: 2s;
    --size: 1em;

    /*
      Resizing a spinner element using anything but font-size will break the animation because the animation uses em
      units. Therefore, if a spinner is used in a flex container without \`flex: none\` applied, the spinner can
      grow/shrink and break the animation. The use of \`flex: none\` on the host element prevents this by always having
      the spinner sized according to its actual dimensions.
    */
    flex: none;
    display: inline-flex;
    width: var(--size);
    height: var(--size);
  }

  svg {
    width: 100%;
    height: 100%;
    aspect-ratio: 1;
    animation: spin var(--speed) linear infinite;
  }

  .track,
  .indicator {
    --radius: calc(var(--size) / 2 - var(--track-width) / 2);
    --circumference: calc(var(--radius) * 2 * 3.141592654);

    cx: calc(var(--size) / 2);
    cy: calc(var(--size) / 2);
    r: var(--radius);
    fill: none;
    stroke-width: var(--track-width);
  }

  .track {
    stroke: var(--track-color);
  }

  .indicator {
    stroke: var(--indicator-color);
    stroke-linecap: round;
    stroke-dasharray: calc(0.597 * var(--circumference)), calc(0.796 * var(--circumference));
    stroke-dashoffset: calc(-0.04 * var(--circumference));
    animation: dash 1.5s ease-in-out infinite;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes dash {
    0% {
      stroke-dasharray: calc(0.008 * var(--circumference)), calc(1.194 * var(--circumference));
      stroke-dashoffset: 0;
    }
    50% {
      stroke-dasharray: calc(0.716 * var(--circumference)), calc(1.194 * var(--circumference));
      stroke-dashoffset: calc(-0.278 * var(--circumference));
    }
    100% {
      stroke-dasharray: calc(0.716 * var(--circumference)), calc(1.194 * var(--circumference));
      stroke-dashoffset: calc(-0.987 * var(--circumference));
    }
  }
`;

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.EGBUT3HG.js
  var WaSpinner = class extends WebAwesomeElement {
    constructor() {
      super(...arguments);
      this.localize = new LocalizeController2(this);
    }
    render() {
      return b2`
      <svg
        part="base spinner"
        role="progressbar"
        aria-label=${this.localize.term("loading")}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle class="track" />
        <circle class="indicator" />
      </svg>
    `;
    }
  };
  WaSpinner.css = spinner_styles_default;
  WaSpinner = __decorateClass([
    t5("wa-spinner")
  ], WaSpinner);

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.HKHINDC2.js
  var RenderedWatcher = class {
    constructor(element, callback) {
      this.element = element;
      this.callback = callback;
    }
    /**
     * Starts watching and reports the current state on the next frame. Additional targets also act as change signals,
     * e.g. an internal element that always has a non-zero box when rendered.
     */
    start(...additionalTargets) {
      if (o5) {
        return;
      }
      this.observer ?? (this.observer = new ResizeObserver(() => this.check()));
      this.observer.observe(this.element);
      for (const target of additionalTargets) {
        this.observer.observe(target);
      }
      this.initialCheckHandle ?? (this.initialCheckHandle = requestAnimationFrame(() => {
        this.initialCheckHandle = void 0;
        this.check();
      }));
    }
    /** Stops watching. */
    stop() {
      if (this.initialCheckHandle !== void 0) {
        cancelAnimationFrame(this.initialCheckHandle);
        this.initialCheckHandle = void 0;
      }
      this.observer?.disconnect();
    }
    check() {
      this.callback(this.element.getClientRects().length > 0);
    }
  };

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.RMZ7BVDM.js
  function parseSpaceDelimitedTokens(input) {
    return input.split(" ").map((token) => token.trim()).filter((token) => token !== "");
  }

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.XTG2LNFG.js
  var dialog_styles_default = i`
  :host {
    --width: 31rem;
    --spacing: var(--wa-space-l);
    --backdrop-filter: none;
    --show-duration: var(--wa-transition-normal);
    --hide-duration: var(--wa-transition-normal);

    display: none;
  }

  :host([open]) {
    display: block;
  }

  .dialog {
    display: flex;
    flex-direction: column;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    width: var(--width);
    max-width: calc(100% - var(--wa-space-2xl));
    max-height: calc(100% - var(--wa-space-2xl));
    color: inherit;
    background-color: var(--wa-color-surface-raised);
    border-radius: var(--wa-panel-border-radius);
    border: none;
    box-shadow: var(--wa-shadow-l);
    padding: 0;
    margin: auto;

    &.show {
      animation: show-dialog var(--show-duration) ease;

      &::backdrop {
        animation: show-backdrop var(--show-duration, 200ms) ease;
      }
    }

    &.hide {
      animation: show-dialog var(--hide-duration) ease reverse;

      &::backdrop {
        animation: show-backdrop var(--hide-duration, 200ms) ease reverse;
      }
    }

    &.pulse {
      animation: pulse 250ms ease;
    }
  }

  .dialog:focus {
    outline: none;
  }

  /* Ensure there's enough vertical padding for phones that don't update vh when chrome appears (e.g. iPhone) */
  @media screen and (max-width: 420px) {
    .dialog {
      max-height: 80vh;
    }
  }

  .open {
    display: flex;
    opacity: 1;
  }

  .header {
    flex: 0 0 auto;
    display: flex;
    flex-wrap: nowrap;

    padding-inline-start: var(--spacing);
    padding-block-end: 0;

    /* Subtract the close button's padding so that the X is visually aligned with the edges of the dialog content */
    padding-inline-end: calc(var(--spacing) - var(--wa-form-control-padding-block));
    padding-block-start: calc(var(--spacing) - var(--wa-form-control-padding-block));
  }

  .title {
    align-self: center;
    flex: 1 1 auto;
    font-family: inherit;
    font-size: var(--wa-font-size-l);
    font-weight: var(--wa-font-weight-heading);
    line-height: var(--wa-line-height-condensed);
    margin: 0;
  }

  .header-actions {
    align-self: start;
    display: flex;
    flex-shrink: 0;
    flex-wrap: wrap;
    justify-content: end;
    gap: var(--wa-space-2xs);
    padding-inline-start: var(--spacing);
  }

  .header-actions wa-button,
  .header-actions ::slotted(wa-button) {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
  }

  .body {
    flex: 1 1 auto;
    display: block;
    padding: var(--spacing);
    overflow: auto;
    -webkit-overflow-scrolling: touch;

    &:focus {
      outline: none;
    }

    &:focus-visible {
      outline: var(--wa-focus-ring);
      outline-offset: var(--wa-focus-ring-offset);
    }
  }

  .footer {
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    gap: var(--wa-space-xs);
    justify-content: end;
    padding: var(--spacing);
    padding-block-start: 0;
  }

  .footer ::slotted(wa-button:not(:first-of-type)) {
    margin-inline-start: var(--wa-spacing-xs);
  }

  .dialog::backdrop {
    /*
      NOTE: the ::backdrop element doesn't inherit properly in Safari yet, but it will in 17.4! At that time, we can
      remove the fallback values here.
    */
    background-color: var(--wa-color-overlay-modal, rgb(0 0 0 / 0.25));
    backdrop-filter: var(--backdrop-filter);
  }

  @keyframes pulse {
    0% {
      scale: 1;
    }
    50% {
      scale: 1.02;
    }
    100% {
      scale: 1;
    }
  }

  @keyframes show-dialog {
    from {
      opacity: 0;
      scale: 0.8;
    }
    to {
      opacity: 1;
      scale: 1;
    }
  }

  @keyframes show-backdrop {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @media (forced-colors: active) {
    .dialog {
      border: solid 1px white;
    }
  }
`;

  // ../../node_modules/@awesome.me/webawesome/dist/chunks/chunk.K5QNGYEG.js
  var WaDialog = class extends WebAwesomeElement {
    constructor() {
      super(...arguments);
      this.localize = new LocalizeController2(this);
      this.hasSlotController = new HasSlotController(this, "footer", "header-actions", "label");
      this.renderedWatcher = new RenderedWatcher(this, (isRendered) => this.handleRenderedChange(isRendered));
      this.open = false;
      this.label = "";
      this.withoutHeader = false;
      this.lightDismiss = false;
      this.withFooter = false;
      this.withLabel = false;
      this.handleDocumentKeyDown = (event) => {
        if (event.key === "Escape" && this.open && isTopDismissible(this)) {
          event.preventDefault();
          event.stopPropagation();
          this.requestClose(this.dialog);
        }
      };
    }
    firstUpdated(changedProperties) {
      super.firstUpdated(changedProperties);
      if (this.open) {
        this.addOpenListeners();
        this.dialog.showModal();
        lockBodyScrolling(this);
        this.renderedWatcher.start(this.dialog);
      }
    }
    disconnectedCallback() {
      super.disconnectedCallback();
      this.renderedWatcher.stop();
      unlockBodyScrolling(this);
      this.removeOpenListeners();
    }
    async requestClose(source) {
      const waHideEvent = new WaHideEvent({ source });
      this.dispatchEvent(waHideEvent);
      if (waHideEvent.defaultPrevented) {
        this.open = true;
        animateWithClass(this.dialog, "pulse");
        return;
      }
      this.removeOpenListeners();
      await animateWithClass(this.dialog, "hide");
      this.open = false;
      this.dialog.close();
      unlockBodyScrolling(this);
      this.renderedWatcher.stop();
      const trigger = this.originalTrigger;
      if (typeof trigger?.focus === "function") {
        setTimeout(() => trigger.focus());
      }
      this.dispatchEvent(new WaAfterHideEvent());
    }
    addOpenListeners() {
      document.addEventListener("keydown", this.handleDocumentKeyDown);
      registerDismissible(this);
    }
    removeOpenListeners() {
      document.removeEventListener("keydown", this.handleDocumentKeyDown);
      unregisterDismissible(this);
    }
    handleDialogCancel(event) {
      event.preventDefault();
      if (!this.dialog.classList.contains("hide") && event.target === this.dialog && isTopDismissible(this)) {
        this.requestClose(this.dialog);
      }
    }
    handleDialogClick(event) {
      const target = event.target;
      const button = target.closest('[data-dialog="close"]');
      if (button) {
        event.stopPropagation();
        this.requestClose(button);
      }
    }
    async handleDialogPointerDown(event) {
      if (event.target === this.dialog && !isEventInsideRect(event, this.dialog)) {
        if (this.lightDismiss) {
          this.requestClose(this.dialog);
        } else {
          await animateWithClass(this.dialog, "pulse");
        }
      }
    }
    /**
     * Suspends the modal when third-party CSS (e.g. cookie banner blockers) hides an open dialog, so the page isn't
     * left scroll locked and inert. "open" stays true so the modal resumes if the dialog is rendered again.
     */
    handleRenderedChange(isRendered) {
      if (!this.open) {
        this.renderedWatcher.stop();
        return;
      }
      if (!isRendered && this.dialog.open) {
        this.removeOpenListeners();
        this.dialog.close();
        unlockBodyScrolling(this);
      } else if (isRendered && !this.dialog.open) {
        this.addOpenListeners();
        this.dialog.showModal();
        lockBodyScrolling(this);
      }
    }
    handleOpenChange() {
      if (this.open && !this.dialog.open) {
        this.show();
      } else if (!this.open && this.dialog.open) {
        this.open = true;
        this.requestClose(this.dialog);
      } else if (!this.open) {
        this.renderedWatcher.stop();
      }
    }
    /** Shows the dialog. */
    async show() {
      const waShowEvent = new WaShowEvent();
      this.dispatchEvent(waShowEvent);
      if (waShowEvent.defaultPrevented) {
        this.open = false;
        return;
      }
      this.addOpenListeners();
      this.originalTrigger = document.activeElement;
      this.open = true;
      this.dialog.showModal();
      lockBodyScrolling(this);
      this.renderedWatcher.start(this.dialog);
      requestAnimationFrame(() => {
        const elementToFocus = this.querySelector("[autofocus]");
        if (elementToFocus && typeof elementToFocus.focus === "function") {
          elementToFocus.focus();
        } else {
          this.dialog.focus();
        }
      });
      await animateWithClass(this.dialog, "show");
      this.dispatchEvent(new WaAfterShowEvent());
    }
    render() {
      const hasHeader = !this.withoutHeader;
      const hasFooter = this.hasSlotController.test("footer", "withFooter");
      const hasLabel = this.label.length > 0 || this.hasSlotController.test("label", "withLabel");
      return b2`
      <dialog
        part="dialog"
        aria-labelledby=${o7(hasHeader && hasLabel ? "title" : void 0)}
        aria-label=${o7(!hasHeader && this.label ? this.label : void 0)}
        class=${e7({
        dialog: true,
        open: this.open
      })}
        @cancel=${this.handleDialogCancel}
        @click=${this.handleDialogClick}
        @pointerdown=${this.handleDialogPointerDown}
      >
        ${hasHeader ? b2`
              <div part="header" class="header">
                <h2 part="title" class="title" id="title">
                  <!-- If there's no label, use an invisible character to prevent the header from collapsing -->
                  <slot name="label"> ${this.label.length > 0 ? this.label : String.fromCharCode(8203)} </slot>
                </h2>
                <div part="header-actions" class="header-actions">
                  <slot name="header-actions"></slot>
                  <wa-button
                    part="close-button"
                    exportparts="base:close-button__base"
                    class="close"
                    appearance="plain"
                    @click="${(event) => this.requestClose(event.target)}"
                  >
                    <wa-icon
                      name="xmark"
                      label=${this.localize.term("close")}
                      library="system"
                      variant="solid"
                    ></wa-icon>
                  </wa-button>
                </div>
              </div>
            ` : ""}

        <div part="body" class="body"><slot></slot></div>

        <!-- Use a hidden element so we still get "slotchange" events. -->
        <div part="footer" class="footer" ?hidden=${!hasFooter}>
          <slot name="footer"></slot>
        </div>
      </dialog>
    `;
    }
  };
  WaDialog.css = dialog_styles_default;
  __decorateClass([
    e6(".dialog")
  ], WaDialog.prototype, "dialog", 2);
  __decorateClass([
    n4({ type: Boolean, reflect: true })
  ], WaDialog.prototype, "open", 2);
  __decorateClass([
    n4({ reflect: true })
  ], WaDialog.prototype, "label", 2);
  __decorateClass([
    n4({ attribute: "without-header", type: Boolean, reflect: true })
  ], WaDialog.prototype, "withoutHeader", 2);
  __decorateClass([
    n4({ attribute: "light-dismiss", type: Boolean })
  ], WaDialog.prototype, "lightDismiss", 2);
  __decorateClass([
    n4({ attribute: "with-footer", type: Boolean })
  ], WaDialog.prototype, "withFooter", 2);
  __decorateClass([
    n4({ attribute: "with-label", type: Boolean })
  ], WaDialog.prototype, "withLabel", 2);
  __decorateClass([
    watch("open", { waitUntilFirstUpdate: true })
  ], WaDialog.prototype, "handleOpenChange", 1);
  WaDialog = __decorateClass([
    t5("wa-dialog")
  ], WaDialog);
  if (!o5) {
    document.addEventListener("click", (event) => {
      const dialogAttrEl = event.target.closest("[data-dialog]");
      if (dialogAttrEl instanceof Element) {
        const [command, id] = parseSpaceDelimitedTokens(dialogAttrEl.getAttribute("data-dialog") || "");
        if (command === "open" && id?.length) {
          const doc = dialogAttrEl.getRootNode();
          const dialog = doc.getElementById(id);
          if (dialog?.localName === "wa-dialog") {
            dialog.open = true;
          } else {
            console.warn(`A dialog with an ID of "${id}" could not be found in this document.`);
          }
        }
      }
    });
    document.addEventListener("pointerdown", () => {
    });
  }

  // browser/schema-form.browser.ts
  function plainData(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    if (Object.getOwnPropertySymbols(value).length !== 0) return false;
    const names = Object.getOwnPropertyNames(value);
    return names.length === Object.keys(value).length && names.every((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      return descriptor?.enumerable === true && "value" in descriptor;
    });
  }
  function exact(value, required, optional) {
    const allowed = /* @__PURE__ */ new Set([...required, ...optional]);
    const keys = Object.keys(value);
    return required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.has(key));
  }
  function finiteOptional(value) {
    return value === void 0 || typeof value === "number" && Number.isFinite(value);
  }
  function scalarString(value) {
    if (typeof value !== "string") return false;
    for (let index = 0; index < value.length; index += 1) {
      const unit = value.charCodeAt(index);
      if (unit >= 55296 && unit <= 56319) {
        const next = value.charCodeAt(index + 1);
        if (!(next >= 56320 && next <= 57343)) return false;
        index += 1;
      } else if (unit >= 56320 && unit <= 57343) return false;
    }
    return true;
  }
  function validateRootData(value) {
    if (!plainData(value) || !exact(value, ["cancelable", "fieldCount", "restorePending"], ["title", "description"]) || typeof value.cancelable !== "boolean" || !Number.isInteger(value.fieldCount) || value.fieldCount < 0 || value.fieldCount > 128 || typeof value.restorePending !== "boolean" || value.title !== void 0 && !scalarString(value.title) || value.description !== void 0 && !scalarString(value.description)) {
      throw new TypeError("Invalid Schema Form root RenderData");
    }
    return value;
  }
  function validateFieldData(value) {
    if (!plainData(value) || typeof value.kind !== "string") throw new TypeError("Invalid Schema Form field RenderData");
    const baseRequired = ["key", "kind", "label", "required", "restoreAllowed"];
    const baseOptional = ["description", "error", "localstorageKey"];
    const kindRequired = value.kind === "string" ? ["value", "multiline"] : value.kind === "number" ? ["integer"] : value.kind === "boolean" ? ["value"] : value.kind === "select" ? ["options"] : [];
    const kindOptional = value.kind === "string" ? ["placeholder", "minLength", "maxLength"] : value.kind === "number" ? ["value", "min", "max"] : value.kind === "select" ? ["value"] : [];
    if (!["string", "number", "boolean", "select"].includes(value.kind) || !exact(value, [...baseRequired, ...kindRequired], [...baseOptional, ...kindOptional]) || !scalarString(value.key) || !scalarString(value.label) || typeof value.required !== "boolean" || typeof value.restoreAllowed !== "boolean" || value.localstorageKey !== void 0 && (!scalarString(value.localstorageKey) || value.localstorageKey.length === 0 || new TextEncoder().encode(value.localstorageKey).byteLength > 256) || value.restoreAllowed === true && value.localstorageKey === void 0 || value.description !== void 0 && !scalarString(value.description) || value.error !== void 0 && (!scalarString(value.error) || value.error.length === 0)) {
      throw new TypeError("Invalid Schema Form field RenderData");
    }
    if (value.kind === "string") {
      if (!scalarString(value.value) || typeof value.multiline !== "boolean" || value.placeholder !== void 0 && !scalarString(value.placeholder) || value.minLength !== void 0 && (!Number.isInteger(value.minLength) || value.minLength < 0) || value.maxLength !== void 0 && (!Number.isInteger(value.maxLength) || value.maxLength < 0) || typeof value.minLength === "number" && typeof value.maxLength === "number" && value.minLength > value.maxLength) {
        throw new TypeError("Invalid string field RenderData");
      }
    } else if (value.kind === "number") {
      if (typeof value.integer !== "boolean" || !finiteOptional(value.value) || !finiteOptional(value.min) || !finiteOptional(value.max) || typeof value.min === "number" && typeof value.max === "number" && value.min > value.max) {
        throw new TypeError("Invalid number field RenderData");
      }
    } else if (value.kind === "boolean") {
      if (typeof value.value !== "boolean") throw new TypeError("Invalid boolean field RenderData");
    } else {
      if (!Array.isArray(value.options) || value.value !== void 0 && typeof value.value !== "string") {
        throw new TypeError("Invalid select field RenderData");
      }
      const seen = /* @__PURE__ */ new Set();
      for (const option of value.options) {
        if (!plainData(option) || !exact(option, ["value", "label"], []) || !scalarString(option.value) || !scalarString(option.label) || seen.has(option.value)) {
          throw new TypeError("Invalid select option RenderData");
        }
        seen.add(option.value);
      }
      if (value.value !== void 0 && (!scalarString(value.value) || !seen.has(value.value))) throw new TypeError("Invalid select value RenderData");
    }
    return value;
  }
  function controlValue(event) {
    const target = event.currentTarget;
    return typeof target.value === "string" ? target.value : "";
  }
  function eventFits(data) {
    try {
      return new TextEncoder().encode(JSON.stringify(data)).byteLength <= 131072;
    } catch {
      return false;
    }
  }
  function denseDataArray(value) {
    if (!Array.isArray(value)) return false;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== value.length + 1 || !keys.includes("length")) return false;
    return value.every((_2, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      return descriptor?.enumerable === true && "value" in descriptor;
    });
  }
  var SchemaFormFieldElement = class extends i4 {
    static styles = i`
    :host { display: block; min-width: 0; max-width: 100%; }
    .field { min-width: 0; display: grid; gap: .35rem; }
    .label { font-weight: 600; overflow-wrap: anywhere; }
    .required { color: var(--wa-color-danger-60); }
    .hint { color: var(--wa-color-neutral-60); font-size: .875rem; overflow-wrap: anywhere; }
    .error { color: var(--wa-color-danger-60); font-size: .875rem; overflow-wrap: anywhere; }
    wa-input, wa-textarea, wa-select { box-sizing: border-box; min-width: 0; width: 100%; max-width: 100%; }
  `;
    current;
    displayedError;
    disabled = false;
    overrideActive = false;
    overrideValue = null;
    draft = "";
    dirty = false;
    receiveRenderData(data) {
      const validated = validateFieldData(data);
      if (this.current !== void 0 && this.current.kind !== validated.kind) throw new TypeError("Schema Form field kind changed");
      if (validated.kind === "number") {
        if (!this.dirty) this.draft = validated.value === void 0 ? "" : String(validated.value);
      }
      this.current = validated;
      this.displayedError = validated.error;
      this.overrideActive = false;
      this.requestUpdate();
      const parent = this.parentElement;
      if (typeof parent?.fieldReady === "function") parent.fieldReady(this);
    }
    connectedCallback() {
      super.connectedCallback();
      if (this.current !== void 0) {
        const parent = this.parentElement;
        if (typeof parent?.fieldReady === "function") parent.fieldReady(this);
      }
    }
    hasRenderData() {
      return this.current !== void 0;
    }
    setFormDisabled(disabled) {
      if (this.disabled === disabled) return;
      this.disabled = disabled;
      this.requestUpdate();
    }
    setDisplayedError(error) {
      this.displayedError = error;
      this.requestUpdate();
    }
    fieldKey() {
      return this.current?.key;
    }
    storageMetadata() {
      const data = this.current;
      return data?.localstorageKey === void 0 ? void 0 : { key: data.localstorageKey, restoreAllowed: data.restoreAllowed };
    }
    renderDataValue() {
      const data = this.current;
      if (data === void 0) throw new TypeError("Schema Form field has no RenderData");
      if (this.overrideActive) return this.overrideValue;
      if (data.kind === "number" || data.kind === "select") return data.value ?? null;
      return data.value;
    }
    restoredValue(value) {
      const data = this.current;
      if (data === void 0) return { accepted: false };
      if (data.kind === "string") return scalarString(value) ? { accepted: true, value } : { accepted: false };
      if (data.kind === "boolean") return typeof value === "boolean" ? { accepted: true, value } : { accepted: false };
      if (data.kind === "number") {
        return value === null || typeof value === "number" && Number.isFinite(value) ? { accepted: true, value } : { accepted: false };
      }
      return value === null || scalarString(value) && data.options.some((option) => option.value === value) ? { accepted: true, value } : { accepted: false };
    }
    applyRestoredValue(value) {
      const data = this.current;
      if (data === void 0) return;
      this.overrideActive = true;
      this.overrideValue = value;
      if (data.kind === "number") {
        this.draft = value === null ? "" : String(value);
        this.dirty = false;
      }
      this.requestUpdate();
    }
    readFormValue() {
      const data = this.current;
      if (data === void 0) throw new TypeError("Schema Form field has no RenderData");
      if (data.kind === "string") {
        const control2 = this.renderRoot.querySelector("wa-input, wa-textarea");
        return { key: data.key, value: typeof control2?.value === "string" ? control2.value : this.renderDataValue() };
      }
      if (data.kind === "boolean") {
        const control2 = this.renderRoot.querySelector("wa-checkbox");
        return { key: data.key, value: typeof control2?.checked === "boolean" ? control2.checked : this.renderDataValue() };
      }
      if (data.kind === "number") {
        const lexical = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
        if (!lexical.test(this.draft)) return { key: data.key, value: null };
        const parsed = Number(this.draft);
        return { key: data.key, value: Number.isFinite(parsed) ? parsed : null };
      }
      const control = this.renderRoot.querySelector("wa-select");
      const token = typeof control?.value === "string" ? control.value : "";
      if (control === null) return { key: data.key, value: this.renderDataValue() };
      if (token === "") return { key: data.key, value: null };
      const match = /^o:(0|[1-9][0-9]*)$/.exec(token);
      const index = match === null ? -1 : Number(match[1]);
      return { key: data.key, value: data.options[index]?.value ?? null };
    }
    changed(event) {
      const data = this.current;
      const parent = this.parentElement;
      if (data === void 0 || this.disabled || parent?.interactionDisabled?.() === true) return;
      if (data.kind === "number") {
        this.draft = controlValue(event);
        this.dirty = true;
      }
      const currentValue = this.readFormValue().value;
      this.overrideActive = true;
      this.overrideValue = currentValue;
      this.displayedError = void 0;
      this.requestUpdate();
      if (typeof parent?.fieldChanged === "function") parent.fieldChanged(this);
    }
    render() {
      const data = this.current;
      if (data === void 0) return b2``;
      const displayValue = this.renderDataValue();
      return b2`
      <div class="field">
        <div class="label">${data.label}${data.required ? b2`<span class="required"> *</span>` : A}</div>
        ${data.kind === "string" && !data.multiline ? b2`
          <wa-input .value=${l4(displayValue)} .placeholder=${data.placeholder ?? ""} .disabled=${this.disabled} @input=${this.changed}></wa-input>
        ` : A}
        ${data.kind === "string" && data.multiline ? b2`
          <wa-textarea .value=${l4(displayValue)} .placeholder=${data.placeholder ?? ""} .disabled=${this.disabled} @input=${this.changed}></wa-textarea>
        ` : A}
        ${data.kind === "number" ? b2`
          <wa-input type="text" inputmode="decimal" .value=${l4(this.draft)} .disabled=${this.disabled} @input=${this.changed}></wa-input>
        ` : A}
        ${data.kind === "boolean" ? b2`
          <wa-checkbox .checked=${l4(displayValue)} .disabled=${this.disabled} @change=${this.changed}></wa-checkbox>
        ` : A}
        ${data.kind === "select" ? b2`
          <wa-select with-clear .value=${l4(displayValue === null ? "" : `o:${data.options.findIndex((option) => option.value === displayValue)}`)} .disabled=${this.disabled} @change=${this.changed}>
            ${data.options.map((option, index) => b2`<wa-option value=${`o:${index}`}>${option.label}</wa-option>`)}
          </wa-select>
        ` : A}
        ${data.description === void 0 ? A : b2`<div class="hint">${data.description}</div>`}
        ${this.displayedError === void 0 ? A : b2`<div class="error" role="alert">${this.displayedError}</div>`}
      </div>
    `;
    }
  };
  var SchemaFormElement = class extends i4 {
    static get observedAttributes() {
      return [.../* @__PURE__ */ new Set([...super.observedAttributes, "loading"])];
    }
    static styles = i`
    wa-dialog { --width: min(600px, 80vw); --spacing: 0; }
    wa-dialog::part(body) { padding: 0; overflow: hidden; }
    .shell {
      box-sizing: border-box;
      min-width: 0;
      min-height: 0;
      width: 100%;
      max-width: 100%;
      max-height: 80vh;
      overflow: hidden;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
    }
    header, footer { min-width: 0; display: flex; align-items: center; gap: .75rem; padding: 1rem; }
    header { justify-content: space-between; border-bottom: 1px solid var(--wa-color-neutral-30); }
    header h2 { min-width: 0; margin: 0; overflow-wrap: anywhere; }
    .body {
      min-width: 0;
      min-height: 0;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 1rem;
    }
    .description { min-width: 0; margin: 0 0 1rem; color: var(--wa-color-neutral-60); overflow-wrap: anywhere; }
    ::slotted(lr-schema-form-field) { min-width: 0; max-width: 100%; margin-bottom: 1rem; }
    footer { justify-content: flex-end; border-top: 1px solid var(--wa-color-neutral-30); }
    .size-error { min-width: 0; color: var(--wa-color-danger-60); margin-right: auto; overflow-wrap: anywhere; }
  `;
    context;
    current;
    sizeError = false;
    restoreAttempted = false;
    restoreBarrier = false;
    previousFocus;
    attributeChangedCallback(name, oldValue, newValue) {
      super.attributeChangedCallback(name, oldValue, newValue);
      if (name === "loading" && oldValue !== newValue) {
        this.syncDisabled();
        this.requestUpdate();
      }
    }
    connectedCallback() {
      const active = document.activeElement;
      this.previousFocus = active instanceof HTMLElement && active !== document.body && active !== document.documentElement ? active : void 0;
      super.connectedCallback();
    }
    disconnectedCallback() {
      const previousFocus = this.previousFocus;
      this.previousFocus = void 0;
      super.disconnectedCallback();
      queueMicrotask(() => {
        if (previousFocus === void 0 || !previousFocus.isConnected || previousFocus.matches(":disabled, [inert], [hidden]") || previousFocus.closest("[inert]") !== null || previousFocus.getClientRects().length === 0) return;
        try {
          previousFocus.focus({ preventScroll: true });
        } catch {
        }
      });
    }
    receiveRenderContext(context) {
      if (context === null || typeof context !== "object" || typeof context.emitCustomEvent !== "function") {
        throw new TypeError("Invalid WebPresentationContext");
      }
      this.context = context;
    }
    receiveRenderData(data) {
      const validated = validateRootData(data);
      this.current = validated;
      this.restoreBarrier = validated.restorePending && !this.restoreAttempted;
      this.syncDisabled();
      this.maybeRestore();
      this.requestUpdate();
    }
    receiveRenderEvent(event) {
      if (event === null || typeof event !== "object" || event.name !== "validate-error") return;
      const data = event.data;
      if (!plainData(data) || !exact(data, ["errors"], []) || !denseDataArray(data.errors) || !eventFits(data)) {
        throw new TypeError("Invalid Schema Form validate-error event");
      }
      const fields = this.directFields();
      const byKey = new Map(fields.map((field) => [field.fieldKey(), field]));
      const seen = /* @__PURE__ */ new Set();
      const updates = [];
      for (const entry of data.errors) {
        if (!plainData(entry) || !exact(entry, ["field", "errorMsg"], []) || !scalarString(entry.field) || seen.has(entry.field) || !scalarString(entry.errorMsg) || entry.errorMsg.length === 0) {
          throw new TypeError("Invalid Schema Form validate-error event");
        }
        const field = byKey.get(entry.field);
        if (field === void 0) throw new TypeError("Invalid Schema Form validate-error field");
        seen.add(entry.field);
        updates.push({ field, error: entry.errorMsg });
      }
      for (const update2 of updates) update2.field.setDisplayedError(update2.error);
    }
    interactionDisabled() {
      return this.getAttribute("loading") === "true" || this.restoreBarrier;
    }
    directFields() {
      return Array.from(this.children).filter((child) => child instanceof SchemaFormFieldElement);
    }
    syncDisabled() {
      const disabled = this.interactionDisabled();
      for (const field of this.directFields()) field.setFormDisabled(disabled);
    }
    fieldReady(field) {
      if (field.parentElement !== this) return;
      field.setFormDisabled(this.interactionDisabled());
      this.maybeRestore();
    }
    updated() {
      this.syncDisabled();
    }
    maybeRestore() {
      const data = this.current;
      if (data?.restorePending !== true || this.restoreAttempted) return;
      const fields = this.directFields();
      if (fields.length !== data.fieldCount || fields.some((field) => !field.hasRenderData())) return;
      this.restoreAttempted = true;
      const baseline = {};
      for (const field of fields) {
        const entry = field.readFormValue();
        Object.defineProperty(baseline, entry.key, { value: field.renderDataValue(), enumerable: true, writable: true, configurable: true });
      }
      const candidate = { ...baseline };
      const substitutions = /* @__PURE__ */ new Map();
      for (const field of fields) {
        const metadata = field.storageMetadata();
        if (metadata === void 0 || !metadata.restoreAllowed) continue;
        try {
          const stored = globalThis.localStorage.getItem(metadata.key);
          if (stored === null) continue;
          let parsed;
          try {
            parsed = JSON.parse(stored);
          } catch {
            continue;
          }
          const restored = field.restoredValue(parsed);
          if (!restored.accepted) continue;
          const value = restored.value;
          const key = field.fieldKey();
          if (key === void 0) continue;
          Object.defineProperty(candidate, key, { value, enumerable: true, writable: true, configurable: true });
          substitutions.set(field, value);
        } catch {
        }
      }
      let accepted = candidate;
      if (!eventFits({ values: candidate })) {
        accepted = baseline;
        substitutions.clear();
      }
      if (eventFits({ values: accepted })) {
        for (const [field, value] of substitutions) field.applyRestoredValue(value);
        try {
          this.context?.emitCustomEvent("restore", { values: accepted });
        } finally {
          this.restoreBarrier = false;
          this.syncDisabled();
          this.requestUpdate();
        }
        return;
      }
      this.restoreBarrier = false;
      this.syncDisabled();
      this.requestUpdate();
    }
    fieldChanged(field) {
      if (field.parentElement !== this || this.interactionDisabled()) return;
      this.emitSnapshot("change");
    }
    collectValues() {
      const values = {};
      for (const child of Array.from(this.children)) {
        if (!(child instanceof SchemaFormFieldElement)) continue;
        const entry = child.readFormValue();
        Object.defineProperty(values, entry.key, { value: entry.value, enumerable: true, configurable: true, writable: true });
      }
      return values;
    }
    submit() {
      if (this.interactionDisabled()) return;
      this.emitSnapshot("submit");
    }
    cancel() {
      if (!this.interactionDisabled() && this.current?.cancelable === true) this.context?.emitCustomEvent("cancel");
    }
    emitSnapshot(name) {
      const data = { values: this.collectValues() };
      const fits = eventFits(data);
      if (!fits) {
        this.sizeError = true;
        this.requestUpdate();
        return;
      }
      if (this.sizeError) {
        this.sizeError = false;
        this.requestUpdate();
      }
      if (name === "submit") this.saveDraft(data.values);
      this.context?.emitCustomEvent(name, data);
    }
    saveDraft(values) {
      for (const field of this.directFields()) {
        const metadata = field.storageMetadata();
        const key = field.fieldKey();
        if (metadata === void 0 || key === void 0) continue;
        try {
          globalThis.localStorage.setItem(metadata.key, JSON.stringify(values[key]));
        } catch {
        }
      }
    }
    hideRequested(event) {
      event.preventDefault();
      if (!this.interactionDisabled() && this.current?.cancelable === true) this.cancel();
    }
    stop(event) {
      event.stopPropagation();
    }
    render() {
      const data = this.current;
      const cancelable = data?.cancelable === true;
      const disabled = this.interactionDisabled();
      const loading = this.getAttribute("loading") === "true";
      return b2`
      <wa-dialog open without-header .label=${data?.title ?? "Form"} @wa-hide=${this.hideRequested}
        @keydown=${this.stop} @keyup=${this.stop}
        @pointerdown=${this.stop} @pointermove=${this.stop} @pointerup=${this.stop} @pointercancel=${this.stop}
        @click=${this.stop}>
        <form class="shell" novalidate @submit=${(event) => {
        event.preventDefault();
        this.submit();
      }}>
          <header>
            <h2>${data?.title ?? ""}</h2>
            ${cancelable ? b2`<wa-button type="button" aria-label="Close" .disabled=${disabled} @click=${this.cancel}>Close</wa-button>` : A}
          </header>
          <div class="body">
            ${data?.description === void 0 ? A : b2`<p class="description">${data.description}</p>`}
            <slot></slot>
          </div>
          <footer>
            ${this.sizeError ? b2`<div class="size-error" role="alert">Form data is too large</div>` : A}
            ${cancelable ? b2`<wa-button type="button" .disabled=${disabled} @click=${this.cancel}>Cancel</wa-button>` : A}
            <wa-button type="submit" variant="brand" .disabled=${disabled} .loading=${loading}>Submit</wa-button>
          </footer>
        </form>
      </wa-dialog>
    `;
    }
  };
  if (customElements.get("lr-schema-form") !== void 0 || customElements.get("lr-schema-form-field") !== void 0) {
    throw new TypeError("Schema Form custom element collision");
  }
  customElements.define("lr-schema-form-field", SchemaFormFieldElement);
  customElements.define("lr-schema-form", SchemaFormElement);
})();
/*! Bundled license information:

@lit/reactive-element/css-tag.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/reactive-element.js:
lit-html/lit-html.js:
lit-element/lit-element.js:
lit-html/directive.js:
@lit/reactive-element/decorators/custom-element.js:
@lit/reactive-element/decorators/property.js:
@lit/reactive-element/decorators/state.js:
@lit/reactive-element/decorators/event-options.js:
@lit/reactive-element/decorators/base.js:
@lit/reactive-element/decorators/query.js:
@lit/reactive-element/decorators/query-all.js:
@lit/reactive-element/decorators/query-async.js:
@lit/reactive-element/decorators/query-assigned-nodes.js:
lit-html/directives/unsafe-html.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/is-server.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/directive-helpers.js:
lit-html/directives/live.js:
lit-html/static.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@awesome.me/webawesome/dist/chunks/chunk.JTOY5KP3.js:
@awesome.me/webawesome/dist/chunks/chunk.4XYGFHPR.js:
@awesome.me/webawesome/dist/chunks/chunk.3ZKPD2O5.js:
@awesome.me/webawesome/dist/chunks/chunk.JPBXG7RE.js:
@awesome.me/webawesome/dist/chunks/chunk.R7QX4M6R.js:
@awesome.me/webawesome/dist/chunks/chunk.VC3BPUZJ.js:
@awesome.me/webawesome/dist/chunks/chunk.7VGCIHDG.js:
@awesome.me/webawesome/dist/chunks/chunk.AOKMSJXD.js:
@awesome.me/webawesome/dist/chunks/chunk.KBXNFZQL.js:
@awesome.me/webawesome/dist/chunks/chunk.RPQJAXXR.js:
@awesome.me/webawesome/dist/chunks/chunk.RWNXKUCF.js:
@awesome.me/webawesome/dist/chunks/chunk.G5ZZIGWB.js:
@awesome.me/webawesome/dist/chunks/chunk.PZAN6FPN.js:
@awesome.me/webawesome/dist/chunks/chunk.M45NRQFW.js:
@awesome.me/webawesome/dist/chunks/chunk.S67PIWQL.js:
@awesome.me/webawesome/dist/chunks/chunk.R6M2PXD4.js:
@awesome.me/webawesome/dist/chunks/chunk.YDQCS2HK.js:
@awesome.me/webawesome/dist/chunks/chunk.WDIIGUNP.js:
@awesome.me/webawesome/dist/chunks/chunk.O74G5RVH.js:
@awesome.me/webawesome/dist/chunks/chunk.HGBRCPUS.js:
@awesome.me/webawesome/dist/chunks/chunk.KKI7M5DP.js:
@awesome.me/webawesome/dist/chunks/chunk.YPRC5XZF.js:
@awesome.me/webawesome/dist/chunks/chunk.UDRJMWVZ.js:
@awesome.me/webawesome/dist/chunks/chunk.JAAVYFGY.js:
@awesome.me/webawesome/dist/components/input/input.js:
@awesome.me/webawesome/dist/chunks/chunk.IOB2JHMR.js:
@awesome.me/webawesome/dist/chunks/chunk.HEEBTYY6.js:
@awesome.me/webawesome/dist/chunks/chunk.GSQEF3SC.js:
@awesome.me/webawesome/dist/components/textarea/textarea.js:
@awesome.me/webawesome/dist/chunks/chunk.YB6263IP.js:
@awesome.me/webawesome/dist/chunks/chunk.GWSUX3V5.js:
@awesome.me/webawesome/dist/chunks/chunk.PFQEHEIR.js:
@awesome.me/webawesome/dist/components/checkbox/checkbox.js:
@awesome.me/webawesome/dist/chunks/chunk.UZWY5NQM.js:
@awesome.me/webawesome/dist/chunks/chunk.DITA2S5A.js:
@awesome.me/webawesome/dist/chunks/chunk.4ZAKP7NY.js:
@awesome.me/webawesome/dist/chunks/chunk.MQODJ75V.js:
@awesome.me/webawesome/dist/chunks/chunk.3NKIHICW.js:
@awesome.me/webawesome/dist/chunks/chunk.PX3HMKF7.js:
@awesome.me/webawesome/dist/chunks/chunk.3H2FQERJ.js:
@awesome.me/webawesome/dist/chunks/chunk.F25QOBDY.js:
@awesome.me/webawesome/dist/chunks/chunk.L6CIKOFQ.js:
@awesome.me/webawesome/dist/chunks/chunk.ZAVDMBWV.js:
@awesome.me/webawesome/dist/chunks/chunk.HPULLNVR.js:
@awesome.me/webawesome/dist/chunks/chunk.4AHPL3WP.js:
@awesome.me/webawesome/dist/chunks/chunk.XNTP7DEQ.js:
@awesome.me/webawesome/dist/chunks/chunk.JS5OA4M6.js:
@awesome.me/webawesome/dist/chunks/chunk.C3KOHXUM.js:
@awesome.me/webawesome/dist/chunks/chunk.5WATURH2.js:
@awesome.me/webawesome/dist/chunks/chunk.ZWQCGLB5.js:
@awesome.me/webawesome/dist/chunks/chunk.HS5AYC6E.js:
@awesome.me/webawesome/dist/chunks/chunk.UEBQI7VV.js:
@awesome.me/webawesome/dist/chunks/chunk.S35PLDPD.js:
@awesome.me/webawesome/dist/chunks/chunk.LXLE4T4D.js:
@awesome.me/webawesome/dist/chunks/chunk.W7A2VLCT.js:
@awesome.me/webawesome/dist/chunks/chunk.EGBUT3HG.js:
@awesome.me/webawesome/dist/components/select/select.js:
@awesome.me/webawesome/dist/components/option/option.js:
@awesome.me/webawesome/dist/components/button/button.js:
@awesome.me/webawesome/dist/chunks/chunk.HKHINDC2.js:
@awesome.me/webawesome/dist/chunks/chunk.RMZ7BVDM.js:
@awesome.me/webawesome/dist/chunks/chunk.XTG2LNFG.js:
@awesome.me/webawesome/dist/chunks/chunk.K5QNGYEG.js:
@awesome.me/webawesome/dist/components/dialog/dialog.js:
  (*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license *)

@lit/reactive-element/decorators/query-assigned-elements.js:
  (**
   * @license
   * Copyright 2021 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/directives/class-map.js:
lit-html/directives/if-defined.js:
  (**
   * @license
   * Copyright 2018 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)
*/
