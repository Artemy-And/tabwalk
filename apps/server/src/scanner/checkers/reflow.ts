import type { Checker, CheckFinding } from '../types.js';

interface LayoutObservation {
  rule: 'horizontal-scroll' | 'clipped-content';
  selector: string;
  html: string;
  detail: string;
}

interface LayoutResult {
  width: number;
  height: number;
  documentWidth: number;
  observations: LayoutObservation[];
  limits: string[];
}

// Runs inside the browser. Only rendered text and controls are candidates;
// scrollWidth alone cannot establish that information or functionality is lost.
function measureReflow(options: { ignoreSelectors: string[] }): LayoutResult {
  const started = performance.now();
  const root = document.documentElement;
  const width = root.clientWidth || innerWidth;
  const height = root.clientHeight || innerHeight;
  const documentWidth = document.scrollingElement?.scrollWidth ?? root.scrollWidth;
  const observations: LayoutObservation[] = [];
  const limits = new Set<string>();
  const styles = new WeakMap<Element, CSSStyleDeclaration>();
  const recorded = new WeakMap<Element, Set<string>>();
  const tolerance = 2;
  const styleOf = (element: Element): CSSStyleDeclaration => {
    let style = styles.get(element);
    if (!style) {
      style = getComputedStyle(element);
      styles.set(element, style);
    }
    return style;
  };
  const parentOf = (element: Element): Element | null =>
    element.parentElement ??
    (element.getRootNode() instanceof ShadowRoot
      ? (element.getRootNode() as ShadowRoot).host
      : null);
  const ignored = options.ignoreSelectors.filter((selector) => {
    try {
      document.querySelector(selector);
      return true;
    } catch {
      return false;
    }
  });
  const prune = (element: Element): boolean => {
    const style = styleOf(element);
    if (
      element.matches('[hidden], [inert], [aria-hidden="true"]') ||
      ignored.some((selector) => element.matches(selector))
    )
      return true;
    if (
      style.display === 'none' ||
      style.visibility !== 'visible' ||
      style.opacity === '0' ||
      style.contentVisibility === 'hidden'
    )
      return true;
    // Common visually-hidden labels and skip links are intentional, not lost text.
    const box = element.getBoundingClientRect();
    return (
      (style.position === 'absolute' || style.position === 'fixed') &&
      box.width <= 2 &&
      box.height <= 2 &&
      (style.overflowX === 'hidden' || style.clip !== 'auto' || style.clipPath !== 'none')
    );
  };
  const selectorOf = (element: Element): string => {
    const scope = element.getRootNode() as Document | ShadowRoot;
    const parts: string[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) {
      if (current.id && scope.querySelectorAll(`#${CSS.escape(current.id)}`).length === 1) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      let part = current.localName;
      const siblings = current.parentElement
        ? [...current.parentElement.children].filter(
            (sibling) => sibling.localName === current?.localName,
          )
        : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      parts.unshift(part);
      if (scope.querySelectorAll(parts.join(' > ')).length === 1) break;
    }
    return scope instanceof ShadowRoot
      ? `${selectorOf(scope.host)} >>> ${parts.join(' > ')}`
      : parts.join(' > ');
  };
  const ancestorsOf = (element: Element): Element[] => {
    const ancestors: Element[] = [];
    for (let ancestor: Element | null = element; ancestor; ancestor = parentOf(ancestor)) {
      ancestors.push(ancestor);
      if (ancestors.length === 80) {
        limits.add('ancestor-limit');
        break;
      }
    }
    return ancestors;
  };
  const record = (element: Element, rule: LayoutObservation['rule'], detail: string): void => {
    const rules = recorded.get(element) ?? new Set<string>();
    if (rules.has(rule)) return;
    if (observations.length >= 50) {
      limits.add('finding-limit');
      return;
    }
    rules.add(rule);
    recorded.set(element, rules);
    const html = element.outerHTML;
    observations.push({
      rule,
      selector: selectorOf(element),
      html: html.length > 500 ? html.slice(0, html.indexOf('>') + 1) : html,
      detail,
    });
  };
  const clipped = (value: string) => value === 'hidden' || value === 'clip';
  const scrollable = (value: string) => value === 'auto' || value === 'scroll';
  const rootStyle = styleOf(root);
  const viewportOverflow =
    rootStyle.overflowX === 'visible' && document.body
      ? styleOf(document.body).overflowX
      : rootStyle.overflowX;
  const originX = scrollX;
  const viewportLeft = -originX;
  const viewportRight = width - originX;
  const probe = (element: Element, rectangles: DOMRect[], control: boolean): void => {
    const ancestors = ancestorsOf(element);
    // The exception applies to horizontal layout, not hidden text inside a cell.
    const exception = ancestors.some((ancestor) =>
      ancestor.matches(
        'table, [role="table"], [role="grid"], pre, svg, canvas, video, audio, iframe, [role="img"]',
      ),
    );
    const localScroll = ancestors.filter(
      (ancestor) =>
        ancestor !== root && ancestor !== document.body && scrollable(styleOf(ancestor).overflowX),
    );
    const horizontalRoot = documentWidth > width + tolerance;
    for (const rect of rectangles) {
      if (rect.width <= tolerance || rect.height <= tolerance) continue;
      let cut = false;
      for (const ancestor of ancestors) {
        const style = styleOf(ancestor);
        const box = ancestor.getBoundingClientRect();
        if (!(ancestor instanceof HTMLElement) || style.display === 'contents') continue;
        // A zero-height/width clip can hide all content. Avoid division by zero
        // without skipping that observation; display:contents has no clip box.
        const scaleX = ancestor.offsetWidth ? box.width / ancestor.offsetWidth : 1;
        const scaleY = ancestor.offsetHeight ? box.height / ancestor.offsetHeight : 1;
        const left = box.left + ancestor.clientLeft * scaleX;
        const top = box.top + ancestor.clientTop * scaleY;
        const right = left + ancestor.clientWidth * scaleX;
        const bottom = top + ancestor.clientHeight * scaleY;
        const axes = [
          clipped(style.overflowX) &&
          (rect.left < left - tolerance || rect.right > right + tolerance)
            ? 'horizontal'
            : '',
          clipped(style.overflowY) &&
          (rect.top < top - tolerance || rect.bottom > bottom + tolerance)
            ? 'vertical'
            : '',
        ].filter(Boolean);
        if (axes.length) {
          record(
            element,
            'clipped-content',
            `${axes.join(' and ')} clipping by ${selectorOf(ancestor)} (overflow-x: ${style.overflowX}; overflow-y: ${style.overflowY}). Check whether the full text or control is available through an equivalent interaction.`,
          );
          cut = true;
          break;
        }
      }
      const outside =
        rect.left < viewportLeft - tolerance || rect.right > viewportRight + tolerance;
      if (
        !cut &&
        outside &&
        horizontalRoot &&
        clipped(viewportOverflow) &&
        localScroll.length === 0
      ) {
        record(
          element,
          'clipped-content',
          `Horizontal clipping at the viewport (overflow-x: ${viewportOverflow}). Check whether the full text or control remains available.`,
        );
        cut = true;
      }
      if (cut || exception) continue;
      const available = Math.min(
        width,
        ...localScroll.map((ancestor) => ancestor.clientWidth || width),
      );
      // Ordinary text lines wider than a local scroll port need review. Panels
      // that each fit the port, such as a carousel, are not reported for scrolling.
      if (!control && localScroll.length && rect.width > available + tolerance) {
        record(
          element,
          'horizontal-scroll',
          `A text line is ${Math.round(rect.width)} CSS px wide in a ${available} CSS px scroll port. Check whether reading requires horizontal scrolling and whether a two-dimensional layout exception applies.`,
        );
      } else if (
        outside &&
        horizontalRoot &&
        localScroll.length === 0 &&
        !clipped(viewportOverflow)
      ) {
        record(
          element,
          'horizontal-scroll',
          `Rendered ${control ? 'control' : 'text'} extends outside the ${width} CSS px viewport; document width is ${documentWidth} CSS px. Check whether information or functionality requires horizontal scrolling and whether a layout exception applies.`,
        );
      }
    }
  };
  let nodes = 0;
  const walkerFor = (scope: Node): TreeWalker =>
    document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (nodes >= 5000 || performance.now() - started >= 2000) {
          limits.add(nodes >= 5000 ? 'node-limit' : 'time-limit');
          throw new Error('Reflow traversal limit reached');
        }
        nodes++;
        return node instanceof Element && prune(node)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    });
  const walkers = [walkerFor(root)];
  while (walkers.length) {
    if (nodes >= 5000) {
      limits.add('node-limit');
      break;
    }
    if (performance.now() - started >= 2000) {
      limits.add('time-limit');
      break;
    }
    if (limits.has('finding-limit')) break;
    const walker = walkers[walkers.length - 1]!;
    let node: Node | null;
    try {
      node = walker.nextNode();
    } catch (error) {
      if (limits.has('node-limit') || limits.has('time-limit')) break;
      throw error;
    }
    if (!node) {
      walkers.pop();
      continue;
    }
    if (node instanceof Element) {
      if (node.shadowRoot) walkers.push(walkerFor(node.shadowRoot));
      if (
        node.localName === 'iframe' &&
        node.getBoundingClientRect().width > 2 &&
        node.getBoundingClientRect().height > 2
      )
        limits.add('frame-content');
      if (
        node.matches(
          'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [contenteditable="true"]',
        )
      )
        probe(node, [...node.getClientRects()], true);
    } else if (node instanceof Text && node.textContent?.trim()) {
      const element = node.parentElement;
      if (!element || ancestorsOf(element).some(prune)) continue;
      if (element.closest('textarea, select, script, style, noscript')) continue;
      if (node.length > 4000) {
        limits.add('text-limit');
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      probe(element, [...range.getClientRects()], false);
    }
  }
  return { width, height, documentWidth, observations, limits: [...limits] };
}

export const reflowChecker: Checker = {
  name: 'reflow',
  async run(page, options = {}): Promise<CheckFinding[]> {
    // This heuristic is offered in selected narrow/zoom profiles. A desktop
    // scan at 1280 px makes no claim about reflow at a smaller viewport.
    if ((page.viewportSize()?.width ?? 1280) > 640) return [];
    const args = JSON.stringify({ ignoreSelectors: options.ignoreSelectors ?? [] });
    // tsx keepNames inserts __name() into nested browser functions.
    const result = await page.evaluate<LayoutResult>(
      `(() => { const __name = fn => fn; return (${measureReflow})(${args}); })()`,
    );
    const context = `${result.width} × ${result.height} CSS px; document width ${result.documentWidth} CSS px.`;
    const findings: CheckFinding[] = result.observations.map((observation) => ({
      kind: 'incomplete',
      impact: 'serious',
      ruleId: `reflow-${observation.rule}`,
      help:
        observation.rule === 'horizontal-scroll'
          ? 'Content may require horizontal scrolling at this viewport'
          : 'Text or controls may be clipped at this viewport',
      helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/reflow.html',
      wcagTags: ['wcag2aa', 'wcag1410'],
      standards: [],
      target: [observation.selector],
      html: observation.html,
      failureSummary: `${context}\n${observation.detail}\nThis is a geometry observation requiring human assessment, not an automatic WCAG violation.`,
    }));
    if (result.limits.length)
      findings.push({
        kind: 'incomplete',
        impact: null,
        ruleId: 'reflow-check-limited',
        help: 'Reflow checks did not cover all page content',
        helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/reflow.html',
        wcagTags: [],
        standards: [],
        target: ['html'],
        html: '<html>',
        failureSummary: `${context}\nReflow coverage is partial: ${result.limits.join(', ')}. Limits: 5,000 nodes, 2 seconds, 50 findings, 4,000 characters per text node, 80 ancestors. Embedded frames need a separate manual check.`,
      });
    return findings;
  },
};
