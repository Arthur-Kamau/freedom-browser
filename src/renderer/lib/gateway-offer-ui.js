/**
 * "Open without gateway" pill (#70).
 *
 * A page on an ENS/Swarm gateway — `vitalik.eth.limo`, `vitalik.eth.link`,
 * `vitalik.bzz.link`, `<swarm-cid>.bzz.link` — is an https page like any
 * other, and the address bar keeps saying so: Freedom never rewrites a
 * gateway URL on its own. What it does is *offer* the native version. Main
 * (src/main/gateway-offer.js) works out whether there is one — an ENS lookup
 * for the name shapes, a CID decode for `<cid>.bzz.link` — and when there
 * is, a labelled pill at the right end of the address bar says "Open without
 * gateway", its icon the target protocol and its tooltip the destination.
 * Clicking it opens a small popover anchored to the pill: the destination,
 * one line on what changes, an "Always open without gateway" checkbox, and
 * Cancel / "Open without gateway". Opening navigates to the native URL with
 * the path, query and fragment the gateway page had.
 *
 * The offer is worked out on arrival — a typed URL, a bookmark and a link
 * clicked inside a page all get it the same way, once the gateway page has
 * committed. Nothing intercepts the click.
 *
 * "Always open without gateway" (the `openWithoutGateway` setting, off by
 * default) is the one case that navigates by itself: a gateway navigation
 * starting in any tab is looked up at once and, when there is a native
 * version, sent there instead. It goes through the same `loadTarget` as a
 * typed `ipfs://` / `bzz://` URL, so the transport assertion and the trust
 * checks behind those still apply. A gateway page reached by Back/Forward is
 * left alone (and shows the pill), as is one this tab was just redirected
 * away from — otherwise Back could never get past it. The same setting is a
 * checkbox at the bottom of the trust popover and a row in Settings →
 * Networks → Name Resolution.
 */

import { getActiveTab, onWebviewCreated } from './tabs.js';
import { isHistoryTraversalPending } from './history-traversal.js';
import { isModalDialogOpen } from './modal-dialog.js';
import { pushDebug } from './debug.js';
import { boundPopoverToViewport } from './popover-bounds.js';

// The gateway suffixes main knows. Only a pre-filter, so that ordinary pages
// never cost an IPC round-trip: main makes the real decision.
const GATEWAY_HOST = /^https?:\/\/[^/?#]+\.(?:eth\.limo|eth\.link|bzz\.link)\.?(?:[/?#]|$)/i;

export const looksLikeGatewayUrl = (url) => typeof url === 'string' && GATEWAY_HOST.test(url);

const PROTOCOL_NAMES = { ipfs: 'IPFS', ipns: 'IPNS', bzz: 'Swarm' };

/**
 * The popover's one-line explanation for an offer.
 * @param {{protocol: string, gateway: string}} offer
 */
export const describeOffer = (offer) =>
  `Loads directly from ${PROTOCOL_NAMES[offer?.protocol] || 'the network'} instead of ` +
  `through the ${offer?.gateway || ''} gateway.`;

// Per <webview>:
//   seq          bumped on every main-frame commit; an offer answer for an
//                older commit is dropped.
//   committedUrl the page the offer belongs to.
//   offer        main's answer for committedUrl, or null.
//   startedUrl   the last main-frame navigation started, for the "always"
//                redirect: its answer only counts while nothing newer began.
//   redirectedFrom  the gateway URL this tab was last sent away from by
//                "always", which it then may come back to (Back, a page
//                link) without being sent away again.
let stateByWebview = new WeakMap();
let alwaysOpen = false;
let navigate = null;

let pillEl;
let pillIconEl;
let popoverEl;
let popoverIconEl;
let destinationEl;
let explanationEl;
let alwaysEl;
let openBtn;
let cancelBtn;
let trustToggleEl;

const stateFor = (webview) => {
  let st = stateByWebview.get(webview);
  if (!st) {
    st = { seq: 0, committedUrl: '', offer: null, startedUrl: '', redirectedFrom: '' };
    stateByWebview.set(webview, st);
  }
  return st;
};

const activeWebview = () => getActiveTab()?.webview || null;

/** The offer for the active tab's page, or null. */
export const getActiveOffer = () => {
  const webview = activeWebview();
  return webview ? stateByWebview.get(webview)?.offer || null : null;
};

const requestOffer = async (url) => {
  try {
    return (await window.electronAPI?.getGatewayOffer?.(url)) || null;
  } catch (err) {
    pushDebug(`[gateway] offer lookup failed: ${err?.message}`);
    return null;
  }
};

// The target protocol's glyph, copied from the address bar's protocol icon
// so the pill and the bar draw IPFS and Swarm the same way.
const protocolGlyph = (protocol) => {
  const cls = protocol === 'bzz' ? 'icon-swarm' : 'icon-ipfs';
  const source = document.querySelector?.(`#protocol-icon .${cls}`);
  return source ? source.cloneNode(true) : null;
};

const paintIcon = (el, protocol) => {
  if (!el) return;
  const glyph = protocolGlyph(protocol);
  el.replaceChildren(...(glyph ? [glyph] : []));
  el.dataset.protocol = protocol === 'bzz' ? 'swarm' : 'ipfs';
};

const setPopoverOpen = (open) => {
  if (!popoverEl || !pillEl) return;
  popoverEl.hidden = !open;
  pillEl.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    // Anchored to the pill: its right edge lines up with the pill's.
    const wrapper = popoverEl.offsetParent;
    if (wrapper?.getBoundingClientRect && pillEl.getBoundingClientRect) {
      const right = wrapper.getBoundingClientRect().right - pillEl.getBoundingClientRect().right;
      popoverEl.style.right = `${Math.max(0, Math.round(right))}px`;
    }
    popoverEl.scrollTop = 0;
    boundPopoverToViewport(popoverEl);
  }
};

// For the chrome's shared dismissal paths (index.js), like
// `closePopupBlockedPopover`.
export const closeGatewayOfferPopover = () => {
  if (popoverEl && !popoverEl.hidden) setPopoverOpen(false);
};

// `resetChoice` on opening only: a refresh while the popover is up (an
// in-page navigation moving the destination) keeps what the user ticked.
const renderPopover = (offer, { resetChoice = true } = {}) => {
  if (!offer) return;
  paintIcon(popoverIconEl, offer.protocol);
  // The whole destination, wrapped rather than cut: it is what the user is
  // deciding on.
  if (destinationEl) destinationEl.textContent = offer.destination;
  if (explanationEl) explanationEl.textContent = describeOffer(offer);
  if (alwaysEl && resetChoice) alwaysEl.checked = alwaysOpen;
};

/**
 * Show or hide the pill for the active tab, and keep an open popover current.
 */
export const refresh = () => {
  if (!pillEl) return;
  const offer = getActiveOffer();
  pillEl.classList.toggle('hidden', !offer);
  if (!offer) {
    setPopoverOpen(false);
    return;
  }
  paintIcon(pillIconEl, offer.protocol);
  const hint = `Open ${offer.destination}`;
  pillEl.title = hint;
  pillEl.setAttribute('aria-label', `Open without gateway: ${offer.destination}`);
  if (!popoverEl?.hidden) renderPopover(offer, { resetChoice: false });
};

const saveAlwaysOpen = async (value) => {
  alwaysOpen = value === true;
  syncToggles();
  try {
    await window.electronAPI?.saveSettings?.({ openWithoutGateway: alwaysOpen });
  } catch (err) {
    pushDebug(`[gateway] saving "always open without gateway" failed: ${err?.message}`);
  }
};

const syncToggles = () => {
  if (trustToggleEl) trustToggleEl.checked = alwaysOpen;
  // The pill popover's box is part of a pending decision (it applies on
  // "Open without gateway"), so an open popover keeps what the user ticked.
  if (alwaysEl && popoverEl?.hidden !== false) alwaysEl.checked = alwaysOpen;
};

/** Apply the `openWithoutGateway` setting from a settings payload. */
export const applyGatewaySettings = (settings) => {
  alwaysOpen = settings?.openWithoutGateway === true;
  syncToggles();
};

const openOffer = async () => {
  const webview = activeWebview();
  const offer = getActiveOffer();
  if (!webview || !offer) return;
  const wantsAlways = alwaysEl?.checked === true;
  setPopoverOpen(false);
  if (wantsAlways !== alwaysOpen) await saveAlwaysOpen(wantsAlways);
  pushDebug(`[gateway] opening ${offer.destination} instead of ${offer.gatewayHost}`);
  navigate?.(offer.destination, webview, { auto: false });
};

// A main-frame commit (cross-document or in-page): the offer belongs to the
// new URL, so the old one goes at once and a fresh one is asked for.
const onCommitted = (webview, url) => {
  const st = stateFor(webview);
  st.seq += 1;
  st.committedUrl = url || '';
  const hadOffer = !!st.offer;
  st.offer = null;
  if (hadOffer && activeWebview() === webview) refresh();
  if (!looksLikeGatewayUrl(url)) return;
  const seq = st.seq;
  requestOffer(url).then((offer) => {
    if (st.seq !== seq || !offer) return;
    st.offer = offer;
    if (activeWebview() === webview) refresh();
  });
};

// "Always open without gateway": send a gateway navigation that has a native
// version there instead, as soon as main has an answer.
const onStarted = (webview, url) => {
  const st = stateFor(webview);
  st.startedUrl = url || '';
  if (!alwaysOpen || !looksLikeGatewayUrl(url)) return;
  if (isHistoryTraversalPending(webview)) return;
  if (st.redirectedFrom && st.redirectedFrom === url) {
    // Back on the page "always" just took this tab away from: stay. The
    // next navigation to it is redirected again.
    st.redirectedFrom = '';
    return;
  }
  requestOffer(url).then((offer) => {
    if (!offer || !alwaysOpen || st.startedUrl !== url) return;
    st.redirectedFrom = url;
    pushDebug(`[gateway] always open without gateway: ${url} → ${offer.destination}`);
    navigate?.(offer.destination, webview, { auto: true });
  });
};

const watchWebview = (webview) => {
  if (!webview?.addEventListener) return;
  webview.addEventListener('did-start-navigation', (event) => {
    if (event.isMainFrame === false || event.isInPlace) return;
    onStarted(webview, event.url);
  });
  webview.addEventListener('did-navigate', (event) => {
    onCommitted(webview, event.url);
  });
  webview.addEventListener('did-navigate-in-page', (event) => {
    if (event.isMainFrame === false) return;
    onCommitted(webview, event.url);
  });
};

/**
 * @param {{ navigate: (url: string, webview: object, opts: {auto: boolean}) => void }} deps
 *   `navigate` opens the native URL in that tab (index.js wires `loadTarget`).
 */
export const initGatewayOfferUi = ({ navigate: navigateFn } = {}) => {
  navigate = navigateFn || null;
  pillEl = document.getElementById('gateway-offer-pill');
  pillIconEl = document.getElementById('gateway-offer-pill-icon');
  popoverEl = document.getElementById('gateway-offer-popover');
  popoverIconEl = document.getElementById('gateway-offer-popover-icon');
  destinationEl = document.getElementById('gateway-offer-destination');
  explanationEl = document.getElementById('gateway-offer-explanation');
  alwaysEl = document.getElementById('gateway-offer-always');
  openBtn = document.getElementById('gateway-offer-open');
  cancelBtn = document.getElementById('gateway-offer-cancel');
  trustToggleEl = document.getElementById('trust-popover-gateway-toggle');
  if (!pillEl || !popoverEl) {
    pushDebug('[gateway] open-without-gateway pill unavailable (missing DOM)');
    return;
  }

  onWebviewCreated(watchWebview);

  window.electronAPI
    ?.getSettings?.()
    .then(applyGatewaySettings)
    .catch(() => {});
  window.addEventListener('settings:updated', (event) => applyGatewaySettings(event.detail));

  pillEl.addEventListener('click', () => {
    if (popoverEl.hidden) {
      renderPopover(getActiveOffer());
      setPopoverOpen(true);
      openBtn?.focus();
    } else {
      setPopoverOpen(false);
    }
  });
  openBtn?.addEventListener('click', () => {
    openOffer();
  });
  cancelBtn?.addEventListener('click', () => setPopoverOpen(false));
  trustToggleEl?.addEventListener('change', () => {
    saveAlwaysOpen(trustToggleEl.checked);
  });

  // Click-away / Esc / focus loss, as for the pop-up-blocked popover.
  document.addEventListener('click', (e) => {
    if (isModalDialogOpen() || popoverEl.hidden) return;
    if (!popoverEl.contains(e.target) && !pillEl.contains(e.target)) {
      setPopoverOpen(false);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || isModalDialogOpen() || popoverEl.hidden) return;
    e.preventDefault();
    setPopoverOpen(false);
  });
  window.addEventListener('blur', () => setPopoverOpen(false));

  document.addEventListener('active-tab-changed', () => {
    setPopoverOpen(false);
    refresh();
  });

  refresh();
};

// Test-only: reset module state between cases.
export const _resetForTests = () => {
  stateByWebview = new WeakMap();
  alwaysOpen = false;
  navigate = null;
  pillEl = pillIconEl = popoverEl = popoverIconEl = undefined;
  destinationEl = explanationEl = alwaysEl = openBtn = cancelBtn = trustToggleEl = undefined;
};
