import type { CDPSession, Page } from 'playwright';
import type { PageFinding } from './check.js';
import type { ScanEnvironment } from './environments.js';

export interface ElementShot {
  context?: { url: string; environment: ScanEnvironment; scenario: string | null };
  fingerprint: string;
  // the pictured element itself, so the example a report shows is the one in the picture
  html: string;
  target: string[];
  image: Buffer;
  width: number;
  height: number;
}

// page around the element, so the picture shows where it sits
const MARGIN = 48;
const MAX_WIDTH = 960;
const MAX_HEIGHT = 640;
// a page full of new problems should not double its scan time
const MAX_PER_PAGE = 30;
const OUTLINE_ID = '__tabwalk-shot';

// One picture per problem: the first element with each fingerprint the scan has not pictured
// yet, outlined, with some of the page around it. Recommendations get none.
export async function shootElements(
  page: Page,
  findings: PageFinding[],
  pictured: Set<string>,
): Promise<ElementShot[]> {
  const shots: ElementShot[] = [];
  let cdp: CDPSession | null = null;

  try {
    for (const finding of findings) {
      if (shots.length >= MAX_PER_PAGE) break;
      if (finding.kind === 'recommendation' || pictured.has(finding.fingerprint)) continue;
      const selector = finding.target[0];
      if (!selector) continue;
      pictured.add(finding.fingerprint);

      const clip = await page
        .evaluate(
          async ({ selector, margin, maxWidth, maxHeight, id, focus }) => {
            let element: Element | null = null;
            try {
              element = document.querySelector(selector);
            } catch {
              return null;
            }
            if (!element) return null;
            // a keyboard problem shows in the focused state, which may be the only one where a
            // skip link is on screen at all; any other picture should not carry a stray focus ring
            if (focus) (element as HTMLElement).focus?.({ preventScroll: true });
            else (document.activeElement as HTMLElement | null)?.blur?.();
            element.scrollIntoView({ block: 'center', inline: 'center' });
            await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return null;

            const x = rect.left + window.scrollX;
            const y = rect.top + window.scrollY;
            const root = document.documentElement;
            // an element moved off the page, like a skip link that never shows, has no picture
            if (x + rect.width <= 0 || y + rect.height <= 0) return null;
            if (x >= root.scrollWidth || y >= root.scrollHeight) return null;
            const outline = document.createElement('div');
            outline.id = id;
            Object.assign(outline.style, {
              position: 'absolute',
              left: `${x - 5}px`,
              top: `${y - 5}px`,
              width: `${rect.width + 10}px`,
              height: `${rect.height + 10}px`,
              border: '3px solid #d1007e',
              borderRadius: '4px',
              boxShadow: '0 0 0 2px #ffffff',
              boxSizing: 'border-box',
              pointerEvents: 'none',
              zIndex: '2147483647',
            });
            root.append(outline);

            const left = Math.max(0, x - margin);
            const top = Math.max(0, y - margin);
            return {
              x: left,
              y: top,
              width: Math.min(root.scrollWidth - left, rect.width + 2 * margin, maxWidth),
              height: Math.min(root.scrollHeight - top, rect.height + 2 * margin, maxHeight),
            };
          },
          {
            selector,
            margin: MARGIN,
            maxWidth: MAX_WIDTH,
            maxHeight: MAX_HEIGHT,
            id: OUTLINE_ID,
            focus: finding.checker === 'keyboard',
          },
        )
        .catch(() => null);
      if (!clip || clip.width < 1 || clip.height < 1) continue;

      try {
        cdp ??= await page.context().newCDPSession(page);
        const { data } = await cdp.send('Page.captureScreenshot', {
          format: 'webp',
          quality: 60,
          captureBeyondViewport: true,
          clip: { ...clip, scale: 1 },
        });
        shots.push({
          fingerprint: finding.fingerprint,
          html: finding.html,
          target: finding.target,
          image: Buffer.from(data, 'base64'),
          width: Math.round(clip.width),
          height: Math.round(clip.height),
        });
      } finally {
        await page
          .evaluate((id) => document.getElementById(id)?.remove(), OUTLINE_ID)
          .catch(() => {});
      }
    }
  } catch {
    // a picture is a bonus: whatever went wrong, the findings stand
  } finally {
    await cdp?.detach().catch(() => {});
  }

  return shots;
}
