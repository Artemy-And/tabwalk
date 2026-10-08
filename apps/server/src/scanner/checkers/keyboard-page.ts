export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Described {
  selector: string;
  html: string;
}

export interface Stop extends Described {
  id: number;
  frame: boolean;
  styleKey: string;
  textField: boolean;
  onScreen: boolean;
  clip: Box | null;
  scroll: string;
  obscurer: Described | null;
}

export interface SkipTarget {
  fragment: string;
  found: boolean;
}

export interface OrderStop {
  label: string;
  selector: string;
  drawn: boolean;
}

export interface OrderLayout {
  width: number;
  height: number;
  stops: OrderStop[];
}

export interface KeyboardHelpers {
  active(): Stop | null;
  element(id: number): Element | null;
  clip(id: number): Box | null;
  describe(id: number): Described | null;
  settle(): Promise<void>;
  animations(id: number): Promise<void>;
  signature(id: number): string;
  blur(id: number): void;
  focus(id: number): boolean;
  focusLast(): boolean;
  unreached(visited: number[]): number;
  container(ids: number[]): Described | null;
  inDialog(ids: number[]): boolean;
  floating(id: number): boolean;
  pickExit(ids: number[] | null): boolean;
  skipTarget(id: number): SkipTarget | null;
  pastSkipTarget(id: number): boolean;
  anyPastSkipTarget(): boolean;
  setOrder(stops: { id: number; visible: boolean }[]): void;
  drawOrder(maxHeight: number, scale: number): OrderLayout | null;
  clearOrder(): void;
}

declare global {
  interface Window {
    __tabwalkKeyboard?: KeyboardHelpers;
  }
}

// Runs inside the page: it must not reference anything outside its own body.
export function installKeyboardHelpers(margin: number): void {
  if (window.__tabwalkKeyboard) return;

  const TABBABLE =
    'a[href], area[href], button, input:not([type="hidden"]), select, textarea, iframe, summary, ' +
    'audio[controls], video[controls], [contenteditable]:not([contenteditable="false"]), [tabindex]';
  const TEXT_INPUTS = ['text', 'email', 'search', 'tel', 'url', 'password', 'number'];
  const CONTROL =
    'button, a[href], input[type="button"], input[type="submit"], [role="button"], [role="link"]';
  // buttons that close a cookie banner or a pop-up; accept first, a refusal can end in a paywall
  const EXITS = [
    /^(accept|agree|allow|consent|i agree|i accept|ok|okay|got it|understood)\b|\b(accept|allow) all\b|akzeptieren|zustimmen|einverstanden|alle erlauben|accepter|j'accepte|aceptar|acepto|accett|accepteren|akkoord|принять|согласен|понятно|хорошо|接受|同意/,
    /^(reject|decline|deny|refuse)\b|\b(only|just) (the )?(necessary|essential|required)\b|\b(necessary|essential|required)( cookies)? only\b|continue without|ablehnen|nur (notwendige|erforderliche|essenzielle)|refuser|continuer sans|rechazar|rifiut|weigeren|отклонить|только необходимые|拒绝/,
    /^(close|dismiss|continue|no,? thanks|not now|maybe later|skip)\b|schließen|fermer|cerrar|chiudi|sluiten|закрыть|продолжить|关闭|^[×✕✖x]$/,
  ];

  const ids = new WeakMap<Element, number>();
  const byId = new Map<number, Element>();
  let nextId = 1;
  let skip: { link: Element; target: Element } | null = null;
  let lastCover: Element | null = null;
  let order: { id: number; visible: boolean }[] = [];
  let overlay: Element | null = null;

  const idOf = (el: Element): number => {
    let id = ids.get(el);
    if (id === undefined) {
      id = nextId++;
      ids.set(el, id);
      byId.set(id, el);
    }
    return id;
  };

  const parentOf = (el: Element): Element | null => {
    if (el.parentElement) return el.parentElement;
    const root = el.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  };

  const contains = (outer: Element, inner: Element): boolean => {
    for (let e: Element | null = inner; e; e = parentOf(e)) if (e === outer) return true;
    return false;
  };

  const deepActive = (): Element | null => {
    let el = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return el;
  };

  const viewport = () => ({
    width: document.documentElement.clientWidth || window.innerWidth,
    height: document.documentElement.clientHeight || window.innerHeight,
  });

  const selectorIn = (el: Element): string => {
    const root = el.getRootNode() as Document | ShadowRoot;
    const unique = (selector: string): boolean => {
      try {
        return root.querySelectorAll(selector).length === 1;
      } catch {
        return false;
      }
    };
    const parts: string[] = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      if (e.id && unique(`#${CSS.escape(e.id)}`)) {
        parts.unshift(`#${CSS.escape(e.id)}`);
        break;
      }
      let part = e.localName;
      const classes = [...e.classList].filter((c) => /^[a-z_-][\w-]*$/i.test(c)).slice(0, 2);
      for (const c of classes) part += `.${CSS.escape(c)}`;
      const parent: Element | null = e.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.localName === e?.localName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(e) + 1})`;
      }
      parts.unshift(part);
      if (unique(parts.join(' > '))) break;
    }
    return parts.join(' > ');
  };

  const selectorOf = (el: Element): string => {
    const root = el.getRootNode();
    const own = selectorIn(el);
    return root instanceof ShadowRoot ? `${selectorOf(root.host)} >>> ${own}` : own;
  };

  const htmlOf = (el: Element): string => {
    const html = el.outerHTML.replaceAll(' style=""', '');
    return html.length > 300 ? html.slice(0, html.indexOf('>') + 1) : html;
  };

  const describeEl = (el: Element) => ({ selector: selectorOf(el), html: htmlOf(el) });

  const styleKey = (el: Element): string => {
    const chain: string[] = [];
    let e: Element | null = el;
    for (let i = 0; e && i < 4; i++, e = parentOf(e)) {
      chain.push(
        e.localName +
          [...e.classList]
            .sort()
            .map((c) => `.${c}`)
            .join(''),
      );
    }
    return `${chain.join('<')}|${el.getAttribute('type') ?? ''}|${el.getAttribute('role') ?? ''}`;
  };

  const transparent = (el: Element): boolean => {
    if (getComputedStyle(el).visibility === 'hidden') return true;
    for (let e: Element | null = el; e; e = parentOf(e)) {
      if (Number(getComputedStyle(e).opacity) < 0.05) return true;
    }
    return false;
  };

  const rectsOf = (el: Element): DOMRect[] => {
    const rects: DOMRect[] = [];
    const add = (e: Element) => {
      for (const r of e.getClientRects()) if (r.width >= 2 && r.height >= 2) rects.push(r);
    };
    add(el);
    if (rects.length === 0) {
      for (const child of el.querySelectorAll('*')) {
        add(child);
        if (rects.length >= 20) break;
      }
    }
    return rects;
  };

  const visualBox = (el: Element): Box | null => {
    const shown = [el];
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
      shown.push(...(el.labels ?? []));
    }
    const vp = viewport();
    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const e of shown) {
      if (transparent(e)) continue;
      for (const r of rectsOf(e)) {
        if (r.right <= 0 || r.bottom <= 0 || r.left >= vp.width || r.top >= vp.height) continue;
        left = Math.min(left, r.left);
        top = Math.min(top, r.top);
        right = Math.max(right, r.right);
        bottom = Math.max(bottom, r.bottom);
      }
    }
    if (right <= left || bottom <= top) return null;
    return { x: left, y: top, width: right - left, height: bottom - top };
  };

  const union = (a: Box, b: Box): Box => {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return {
      x,
      y,
      width: Math.max(a.x + a.width, b.x + b.width) - x,
      height: Math.max(a.y + a.height, b.y + b.height) - y,
    };
  };

  const shownBox = (el: Element): Box | null => {
    if (transparent(el)) return null;
    const vp = viewport();
    const r = el.getBoundingClientRect();
    const x = Math.max(0, r.left);
    const y = Math.max(0, r.top);
    const width = Math.min(vp.width, r.right) - x;
    const height = Math.min(vp.height, r.bottom) - y;
    return width >= 1 && height >= 1 ? { x, y, width, height } : null;
  };

  // focus styles often sit on a wrapper or, for hidden elements, on a visible ancestor
  const regionOf = (el: Element, own: Box | null): Box | null => {
    const vp = viewport();
    if (!own) {
      for (let e = parentOf(el); e; e = parentOf(e)) {
        if (e === document.body || e === document.documentElement) {
          return { x: 0, y: 0, width: vp.width, height: vp.height };
        }
        const box = shownBox(e);
        if (box) return box;
      }
      return null;
    }
    const limit = Math.min(
      Math.max(own.width * own.height * 16, 300 * 300),
      vp.width * vp.height * 0.4,
    );
    let region = own;
    let e = parentOf(el);
    for (let i = 0; e && i < 3; i++, e = parentOf(e)) {
      const box = shownBox(e);
      if (!box || box.width * box.height > limit) break;
      region = union(region, box);
    }
    return region;
  };

  const clipOf = (box: Box): Box | null => {
    const vp = viewport();
    const x = Math.max(0, Math.floor(box.x - margin));
    const y = Math.max(0, Math.floor(box.y - margin));
    const right = Math.min(vp.width, Math.ceil(box.x + box.width + margin));
    const bottom = Math.min(vp.height, Math.ceil(box.y + box.height + margin));
    if (right - x < 2 || bottom - y < 2) return null;
    return { x, y, width: right - x, height: bottom - y };
  };

  const topAt = (x: number, y: number): Element | null => {
    let el = document.elementFromPoint(x, y);
    while (el?.shadowRoot) {
      const inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    return el;
  };

  const floatingAround = (el: Element): Element | null => {
    let found: Element | null = null;
    for (let e: Element | null = el; e; e = parentOf(e)) {
      const position = getComputedStyle(e).position;
      if (position === 'fixed' || position === 'sticky') found = e;
    }
    return found;
  };

  const spread = (start: number, size: number): number[] =>
    size <= 2
      ? [start + size / 2]
      : [start + 1, start + size * 0.25, start + size * 0.5, start + size * 0.75, start + size - 1];

  const coverAt = (el: Element, box: Box): Element | null => {
    const vp = viewport();
    let cover: Element | null = null;
    let sampled = 0;
    for (const x of spread(box.x, box.width)) {
      for (const y of spread(box.y, box.height)) {
        if (x < 0 || y < 0 || x >= vp.width || y >= vp.height) continue;
        sampled++;
        const top = topAt(x, y);
        if (!top || contains(el, top) || contains(top, el)) return null;
        const floating = floatingAround(top);
        if (!floating || contains(floating, el)) return null;
        cover ??= floating;
      }
    }
    return sampled > 0 ? cover : null;
  };

  // elementFromPoint skips elements with pointer-events: none, even when they are drawn on top
  const obscurerOf = (el: Element, box: Box): Element | null => {
    if (!(el instanceof HTMLElement) || getComputedStyle(el).pointerEvents !== 'none') {
      return coverAt(el, box);
    }
    // only CSSOM edits: a strict CSP ignores a style attribute set from script
    const value = el.style.getPropertyValue('pointer-events');
    const priority = el.style.getPropertyPriority('pointer-events');
    el.style.setProperty('pointer-events', 'auto', 'important');
    try {
      return coverAt(el, box);
    } finally {
      if (value) el.style.setProperty('pointer-events', value, priority);
      else el.style.removeProperty('pointer-events');
    }
  };

  const isTextField = (el: Element): boolean =>
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement && TEXT_INPUTS.includes(el.type)) ||
    (el instanceof HTMLElement && el.isContentEditable);

  const isTabbable = (el: Element): boolean => {
    if (!(el instanceof HTMLElement) || el.tabIndex < 0) return false;
    if ((el as HTMLButtonElement).disabled) return false;
    for (let ancestor: Element | null = el; ancestor; ancestor = parentOf(ancestor)) {
      if (ancestor.hasAttribute('inert')) return false;
    }
    if (el.getClientRects().length === 0) return false;
    return getComputedStyle(el).visibility !== 'hidden';
  };

  const tabbableElements = (root: Document | ShadowRoot = document): HTMLElement[] => {
    const result: HTMLElement[] = [];
    for (const el of root.querySelectorAll('*')) {
      if (el.matches(TABBABLE) && isTabbable(el)) result.push(el as HTMLElement);
      if (el.shadowRoot) result.push(...tabbableElements(el.shadowRoot));
    }
    return result;
  };

  const afterTarget = (target: Element, el: Element): boolean => {
    let light = el;
    while (light.getRootNode() instanceof ShadowRoot)
      light = (light.getRootNode() as ShadowRoot).host;
    return (
      contains(target, light) ||
      (target.compareDocumentPosition(light) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    );
  };

  const nameOf = (el: Element): string =>
    (
      (el instanceof HTMLElement ? el.innerText : el.textContent) ||
      el.getAttribute('aria-label') ||
      (el instanceof HTMLInputElement ? el.value || el.placeholder : '') ||
      el.getAttribute('title') ||
      el.getAttribute('alt') ||
      el.querySelector('img[alt]')?.getAttribute('alt') ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim();

  const labelOf = (el: Element): string => nameOf(el).toLowerCase();

  const pageBox = (el: Element): Box | null => {
    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const r of rectsOf(el)) {
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }
    if (right <= left || bottom <= top) return null;
    return {
      x: left + window.scrollX,
      y: top + window.scrollY,
      width: right - left,
      height: bottom - top,
    };
  };

  const clear = (color: string): boolean =>
    color === 'transparent' || /^rgba\(.*,\s*0\)$/.test(color);

  const look = (el: Element, pseudo?: string): string => {
    const s = getComputedStyle(el, pseudo);
    if (pseudo && (s.content === 'none' || s.content === 'normal')) return '';
    const outline =
      s.outlineStyle === 'none' || Number.parseFloat(s.outlineWidth) === 0 || clear(s.outlineColor)
        ? 'none'
        : `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} ${s.outlineOffset}`;
    const border = ['top', 'right', 'bottom', 'left'].map((side) => {
      const style = s.getPropertyValue(`border-${side}-style`);
      const width = s.getPropertyValue(`border-${side}-width`);
      return style === 'none' || Number.parseFloat(width) === 0
        ? 'none'
        : `${style} ${width} ${s.getPropertyValue(`border-${side}-color`)}`;
    });
    return [
      outline,
      ...border,
      s.boxShadow,
      s.backgroundColor,
      s.backgroundImage,
      s.color,
      s.textDecorationLine === 'none' ? 'none' : `${s.textDecorationLine} ${s.textDecorationColor}`,
      s.transform,
      s.opacity,
      s.filter,
    ].join('|');
  };

  window.__tabwalkKeyboard = {
    active() {
      const el = deepActive();
      if (!el || el === document.body || el === document.documentElement) return null;
      const frame = ['iframe', 'frame', 'object', 'embed'].includes(el.localName);
      const area = el.localName === 'area';
      const box = area ? null : visualBox(el);
      const cover = box ? obscurerOf(el, box) : null;
      const region = area ? null : regionOf(el, box);
      lastCover = cover;
      return {
        ...describeEl(el),
        id: idOf(el),
        frame,
        styleKey: styleKey(el),
        textField: isTextField(el),
        onScreen: area || box !== null,
        clip: region ? clipOf(region) : null,
        scroll: `${Math.round(window.scrollX)},${Math.round(window.scrollY)}`,
        obscurer: cover ? describeEl(cover) : null,
      };
    },

    element(id) {
      return byId.get(id) ?? null;
    },

    clip(id) {
      const el = byId.get(id);
      if (!el?.isConnected) return null;
      const region = regionOf(el, visualBox(el));
      return region ? clipOf(region) : null;
    },

    describe(id) {
      const el = byId.get(id);
      return el ? describeEl(el) : null;
    },

    settle() {
      return new Promise<void>((resolve) => {
        let last = '';
        let stable = 0;
        let frames = 0;
        const tick = () => {
          const now = `${window.scrollX},${window.scrollY}`;
          stable = now === last ? stable + 1 : 0;
          last = now;
          if (stable >= 2 || ++frames > 30) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    },

    async animations(id) {
      const el = byId.get(id);
      if (!el) return;
      const running = document.getAnimations().filter((animation) => {
        if (animation.playState !== 'running') return false;
        if (animation.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY) {
          return false;
        }
        const target = (animation.effect as KeyframeEffect | null)?.target;
        if (!target) return false;
        if (contains(target, el) || contains(el, target)) return true;
        return lastCover !== null && (contains(lastCover, target) || contains(target, lastCover));
      });
      if (running.length === 0) return;
      await Promise.race([
        Promise.all(running.map((animation) => animation.finished.catch(() => undefined))),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
    },

    signature(id) {
      const el = byId.get(id);
      if (!el) return '';
      const related = [el];
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
        related.push(...(el.labels ?? []));
      }
      if (el.nextElementSibling) related.push(el.nextElementSibling);
      let e = parentOf(el);
      for (let i = 0; e && i < 3; i++, e = parentOf(e)) related.push(e);
      return related
        .map((r) => `${look(r)}#${look(r, '::before')}#${look(r, '::after')}`)
        .join('/');
    },

    blur(id) {
      (byId.get(id) as HTMLElement | undefined)?.blur();
    },

    focus(id) {
      const el = byId.get(id) as HTMLElement | undefined;
      el?.focus({ preventScroll: true });
      return el !== undefined && deepActive() === el && el.matches(':focus-visible');
    },

    focusLast() {
      const all = tabbableElements();
      const last = all[all.length - 1];
      last?.focus();
      return last !== undefined && deepActive() === last;
    },

    unreached(visited) {
      const seen = new Set(visited.map((id) => byId.get(id)));
      return tabbableElements().filter((el) => !seen.has(el)).length;
    },

    container(list) {
      const els = list.map((id) => byId.get(id)).filter((el): el is Element => el !== undefined);
      const [first, ...rest] = els;
      if (!first) return null;
      let common: Element | null = first;
      while (common && !rest.every((el) => contains(common as Element, el))) {
        common = parentOf(common);
      }
      return common ? describeEl(common) : null;
    },

    inDialog(list) {
      return list.every((id) => {
        for (let e = byId.get(id) ?? null; e; e = parentOf(e)) {
          if (e instanceof HTMLDialogElement && e.open) return true;
          if (e.getAttribute('aria-modal') === 'true') return true;
          if (/^(alert)?dialog$/.test(e.getAttribute('role') ?? '')) return true;
        }
        return false;
      });
    },

    floating(id) {
      const el = byId.get(id);
      return el !== undefined && floatingAround(el) !== null;
    },

    pickExit(list) {
      const candidates = (
        list ? list.map((id) => byId.get(id)) : [...document.querySelectorAll(TABBABLE)]
      ).filter(
        (el): el is HTMLElement =>
          el instanceof HTMLElement && el.matches(CONTROL) && isTabbable(el),
      );
      for (const pattern of EXITS) {
        const exit = candidates.find((el) => {
          const label = labelOf(el);
          return label.length <= 60 && pattern.test(label);
        });
        if (exit) {
          exit.focus();
          return deepActive() === exit;
        }
      }
      return false;
    },

    skipTarget(id) {
      const link = byId.get(id);
      if (!(link instanceof HTMLAnchorElement) || !link.hasAttribute('href')) return null;
      let url: URL;
      try {
        url = new URL(link.href);
      } catch {
        return null;
      }
      const here = new URL(window.location.href);
      if (
        url.origin !== here.origin ||
        url.pathname !== here.pathname ||
        url.search !== here.search
      ) {
        return null;
      }
      let fragment: string;
      try {
        fragment = decodeURIComponent(url.hash.slice(1));
      } catch {
        return null;
      }
      if (!fragment || fragment === 'top' || /^[/!]/.test(fragment)) return null;
      const target = document.getElementById(fragment) ?? document.getElementsByName(fragment)[0];
      if (!target) return { fragment, found: false };
      skip = { link, target };
      return { fragment, found: true };
    },

    pastSkipTarget(id) {
      const el = byId.get(id);
      return el !== undefined && skip !== null && afterTarget(skip.target, el);
    },

    anyPastSkipTarget() {
      const target = skip?.target;
      if (!target) return false;
      return [...document.querySelectorAll(TABBABLE)].some(
        (el) => isTabbable(el) && afterTarget(target, el),
      );
    },

    setOrder(list) {
      order = list;
    },

    drawOrder(maxHeight, scale) {
      if (order.length === 0) return null;
      window.scrollTo(0, 0);
      const root = document.documentElement;
      const width = root.clientWidth || window.innerWidth;
      const height = Math.min(
        Math.max(root.scrollHeight, document.body?.scrollHeight ?? 0),
        maxHeight,
      );
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      Object.assign(svg.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        zIndex: '2147483647',
        pointerEvents: 'none',
        overflow: 'visible',
      });
      const draw = (name: string, attrs: Record<string, string | number>): Element => {
        const node = document.createElementNS(ns, name);
        for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
        svg.appendChild(node);
        return node;
      };

      // sizes are divided by the scale so they come out right in the smaller picture
      const radius = 12 / scale;
      const line = 2 / scale;
      const badges: [number, number, number][] = [];
      const stops = order.map(({ id, visible }, i) => {
        const el = byId.get(id);
        const box = el?.isConnected && visible && !transparent(el) ? pageBox(el) : null;
        const drawn = box !== null && box.y < height;
        if (box && drawn) {
          draw('rect', {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            fill: 'none',
            stroke: '#2563d6',
            'stroke-width': line,
          });
          badges.push([Math.max(radius, box.x), Math.max(radius, box.y), i + 1]);
        }
        return {
          label: el ? nameOf(el).slice(0, 100) : '',
          selector: el ? selectorOf(el) : '',
          drawn,
        };
      });
      if (badges.length > 1) {
        draw('polyline', {
          points: badges.map(([x, y]) => `${x},${y}`).join(' '),
          fill: 'none',
          stroke: '#2563d6',
          'stroke-width': line,
          'stroke-opacity': 0.7,
        });
      }
      for (const [x, y, n] of badges) {
        draw('circle', {
          cx: x,
          cy: y,
          r: radius,
          fill: '#2563d6',
          stroke: '#fff',
          'stroke-width': line,
        });
        const label = draw('text', {
          x,
          y,
          fill: '#fff',
          'font-family': 'Arial, sans-serif',
          'font-size': (n > 99 ? 9 : 12) / scale,
          'font-weight': 700,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        });
        label.textContent = String(n);
      }
      root.appendChild(svg);
      overlay = svg;
      return { width, height, stops };
    },

    clearOrder() {
      overlay?.remove();
      overlay = null;
    },
  };
}
