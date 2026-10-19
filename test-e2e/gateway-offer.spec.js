// "Open without gateway" (#70), driven through the real chrome.
//
// src/main/gateway-offer.test.js pins the host parsing (every gateway shape,
// the Swarm CID decode, invalid input) and gateway-offer-ui.test.js the
// renderer's per-tab bookkeeping; this spec pins what the user actually gets:
// a gateway URL stays the gateway URL in the address bar, the pill appears
// only when there is a native version, its popover names the destination,
// "Open without gateway" lands on that native URL with the path, query and
// fragment intact, a link clicked inside a page gets the same offer on
// arrival, and the opt-in "always" mode redirects by itself and can be turned
// off again from the trust popover.
//
// Gateway pages are served by the harness' https stub, names resolve through
// `setEnsFixture` (which the harness also hands to main's gateway lookup), so
// nothing here touches the network.

const { Reference } = require('@ethersphere/bee-js');
const { test, expect, clickOverGuest, SAMPLE_BZZ_HASH } = require('./fixtures');

const NAME = 'gateway-demo.eth';
const GATEWAY_URL = 'https://gateway-demo.eth.limo/blog/post.html?lang=en#comments';
const NATIVE_URL = 'ipfs://gateway-demo.eth/blog/post.html?lang=en#comments';
const CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

const ENS_OK = {
  type: 'ok',
  protocol: 'ipfs',
  decoded: CID,
  uri: `ipfs://${CID}`,
  trust: {
    level: 'verified',
    system: 'ens',
    method: 'quorum',
    block: { number: 21000000 },
    queried: ['a.rpc.test', 'b.rpc.test', 'c.rpc.test'],
    agreed: ['a.rpc.test', 'b.rpc.test'],
    dissented: [],
  },
};

const webviewUrl = (window) =>
  window.evaluate(() => {
    const wv = document.querySelector('webview.active, webview:not(.hidden)');
    return wv?.getURL?.() || '';
  });

const inGuest = (window, source) =>
  window.evaluate(async (js) => {
    const wv = document.querySelector('webview.active, webview:not(.hidden)');
    if (!wv?.executeJavaScript) return null;
    try {
      return await wv.executeJavaScript(js, true);
    } catch {
      return null;
    }
  }, source);

const navigateTo = async (window, value) => {
  const input = window.locator('[data-test="address-input"]');
  await input.click();
  await input.fill(value);
  await input.press('Enter');
};

const storedAlways = (window) =>
  window.evaluate(async () => (await window.electronAPI.getSettings()).openWithoutGateway);

const setUp = async (harness) => {
  await harness.setEnsFixture(NAME, ENS_OK);
  await harness.setContentFixture(`ipfs://${NAME}/`, {
    body: `<!doctype html><title>native ${NAME}</title><h1>native</h1>`,
  });
};

test('a gateway page keeps its URL and offers the native version, which opens with path, query and fragment', async ({
  window,
  harness,
}) => {
  await setUp(harness);
  await navigateTo(window, GATEWAY_URL);

  await expect.poll(() => webviewUrl(window), { timeout: 15_000 }).toBe(GATEWAY_URL);
  const pill = window.locator('[data-test="gateway-offer-pill"]');
  await expect(pill).toBeVisible({ timeout: 15_000 });
  // Never rewritten: the bar shows what was typed.
  await expect(window.locator('[data-test="address-input"]')).toHaveValue(GATEWAY_URL);
  await expect(pill).toHaveText('Open without gateway');
  await expect(pill).toHaveAttribute('title', `Open ${NATIVE_URL}`);

  await pill.click();
  const popover = window.locator('[data-test="gateway-offer-popover"]');
  await expect(popover).toBeVisible();
  await expect(pill).toHaveAttribute('aria-expanded', 'true');
  await expect(window.locator('[data-test="gateway-offer-destination"]')).toHaveText(NATIVE_URL);
  await expect(popover).toContainText(
    'Loads directly from IPFS instead of through the eth.limo gateway.'
  );
  await expect(window.locator('[data-test="gateway-offer-always"]')).not.toBeChecked();

  // Anchored to the pill: the popover hangs below it, right edges aligned.
  const pillBox = await pill.boundingBox();
  const popBox = await popover.boundingBox();
  expect(popBox.y).toBeGreaterThan(pillBox.y + pillBox.height - 1);
  expect(Math.abs(popBox.x + popBox.width - (pillBox.x + pillBox.width))).toBeLessThan(2);

  await clickOverGuest(window.locator('[data-test="gateway-offer-open"]'));
  await expect.poll(() => webviewUrl(window), { timeout: 15_000 }).toBe(NATIVE_URL);
  await expect(popover).toBeHidden();
  // We are where it pointed, so the pill is gone.
  await expect(pill).toBeHidden();
  await expect(window.locator('#trust-shield')).toBeVisible({ timeout: 15_000 });
  // Opening once is not "always".
  expect(await storedAlways(window)).toBe(false);
});

test('Cancel closes the popover and stays on the gateway page', async ({ window, harness }) => {
  await setUp(harness);
  await navigateTo(window, GATEWAY_URL);
  const pill = window.locator('[data-test="gateway-offer-pill"]');
  await expect(pill).toBeVisible({ timeout: 15_000 });
  await pill.click();
  await window.locator('[data-test="gateway-offer-always"]').check();
  await clickOverGuest(window.locator('[data-test="gateway-offer-cancel"]'));
  await expect(window.locator('[data-test="gateway-offer-popover"]')).toBeHidden();
  expect(await webviewUrl(window)).toBe(GATEWAY_URL);
  expect(await storedAlways(window)).toBe(false);
});

test('no contenthash, no pill', async ({ window }) => {
  await navigateTo(window, 'https://no-content.eth.limo/');
  await expect
    .poll(() => webviewUrl(window), { timeout: 15_000 })
    .toBe('https://no-content.eth.limo/');
  // The lookup has settled (main answers null) and the pill never showed.
  expect(
    await window.evaluate(() => window.electronAPI.getGatewayOffer('https://no-content.eth.limo/'))
  ).toBeNull();
  await expect(window.locator('[data-test="gateway-offer-pill"]')).toBeHidden();
});

test('a Swarm CID on bzz.link is offered as its bzz:// reference without any lookup', async ({
  window,
}) => {
  const cid = new Reference(SAMPLE_BZZ_HASH).toCid('manifest');
  const url = `https://${cid}.bzz.link/docs/?q=1`;
  await navigateTo(window, url);
  const pill = window.locator('[data-test="gateway-offer-pill"]');
  await expect(pill).toBeVisible({ timeout: 15_000 });
  await expect(pill).toHaveAttribute('title', `Open bzz://${SAMPLE_BZZ_HASH}/docs/?q=1`);
  await expect(window.locator('#gateway-offer-pill-icon')).toHaveAttribute(
    'data-protocol',
    'swarm'
  );
  await pill.click();
  await expect(window.locator('[data-test="gateway-offer-popover"]')).toContainText(
    'Loads directly from Swarm instead of through the bzz.link gateway.'
  );

  // One character short is not a CID: no offer.
  await navigateTo(window, `https://${cid.slice(0, -1)}.bzz.link/`);
  await expect
    .poll(() => webviewUrl(window), { timeout: 15_000 })
    .toBe(`https://${cid.slice(0, -1)}.bzz.link/`);
  expect(
    await window.evaluate(
      (u) => window.electronAPI.getGatewayOffer(u),
      `https://${cid.slice(0, -1)}.bzz.link/`
    )
  ).toBeNull();
  await expect(pill).toBeHidden();
});

test('a gateway link clicked inside a page is not intercepted, and offered on arrival', async ({
  window,
  harness,
}) => {
  await setUp(harness);
  await harness.setContentFixture(`ipfs://${CID}/`, {
    body: `<!doctype html><title>links</title><a id="go" href="${GATEWAY_URL}">read</a>`,
  });
  await navigateTo(window, `ipfs://${CID}/`);
  await expect
    .poll(() => inGuest(window, 'Boolean(document.getElementById("go"))'), { timeout: 15_000 })
    .toBe(true);
  await inGuest(window, 'document.getElementById("go").click()');

  await expect.poll(() => webviewUrl(window), { timeout: 15_000 }).toBe(GATEWAY_URL);
  await expect(window.locator('[data-test="gateway-offer-pill"]')).toBeVisible({
    timeout: 15_000,
  });
});

test('"Always open without gateway" redirects gateway navigations, and the trust popover turns it off', async ({
  window,
  harness,
}) => {
  await setUp(harness);
  await navigateTo(window, GATEWAY_URL);
  const pill = window.locator('[data-test="gateway-offer-pill"]');
  await expect(pill).toBeVisible({ timeout: 15_000 });
  await pill.click();
  await window.locator('[data-test="gateway-offer-always"]').check();
  await clickOverGuest(window.locator('[data-test="gateway-offer-open"]'));
  await expect.poll(() => webviewUrl(window), { timeout: 15_000 }).toBe(NATIVE_URL);
  await expect.poll(() => storedAlways(window)).toBe(true);

  // A later gateway navigation goes native by itself.
  await navigateTo(window, 'https://gateway-demo.eth.link/about/');
  await expect
    .poll(() => webviewUrl(window), { timeout: 15_000 })
    .toBe('ipfs://gateway-demo.eth/about/');

  // The same setting sits at the foot of the trust popover.
  await window.locator('#trust-shield').click();
  const toggle = window.locator('[data-test="trust-popover-gateway-toggle"]');
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect.poll(() => storedAlways(window)).toBe(false);

  // Off again: back to offering.
  await navigateTo(window, GATEWAY_URL);
  await expect.poll(() => webviewUrl(window), { timeout: 15_000 }).toBe(GATEWAY_URL);
  await expect(pill).toBeVisible({ timeout: 15_000 });
});

test('with "always" on, Back onto the gateway page stays there and offers instead', async ({
  window,
  harness,
}) => {
  // A slow lookup lets the gateway page commit before "always" moves on, so
  // it is in history for Back to return to — the case that could loop.
  await harness.setEnsFixture(NAME, { ...ENS_OK, delayMs: 700 });
  await harness.setContentFixture(`ipfs://${NAME}/`, {
    body: `<!doctype html><title>native ${NAME}</title><h1>native</h1>`,
  });
  await window.evaluate(() => window.electronAPI.saveSettings({ openWithoutGateway: true }));

  await navigateTo(window, GATEWAY_URL);
  await expect.poll(() => webviewUrl(window), { timeout: 15_000 }).toBe(GATEWAY_URL);
  await expect.poll(() => webviewUrl(window), { timeout: 15_000 }).toBe(NATIVE_URL);

  await window.locator('#back-btn').click();
  await expect.poll(() => webviewUrl(window), { timeout: 15_000 }).toBe(GATEWAY_URL);
  await expect(window.locator('[data-test="gateway-offer-pill"]')).toBeVisible({
    timeout: 15_000,
  });
  // Well past the lookup delay: still here, not sent forward again.
  await window.waitForTimeout(2_000);
  expect(await webviewUrl(window)).toBe(GATEWAY_URL);
  await expect(window.locator('[data-test="address-input"]')).toHaveValue(GATEWAY_URL);
});

test('with "always" on, the page it redirected away from is redirected again once the tab has moved on', async ({
  window,
  harness,
}) => {
  await setUp(harness);
  await window.evaluate(() => window.electronAPI.saveSettings({ openWithoutGateway: true }));

  await navigateTo(window, GATEWAY_URL);
  await expect.poll(() => webviewUrl(window), { timeout: 15_000 }).toBe(NATIVE_URL);

  // Somewhere else, then the same gateway URL typed again (R1-M1): the
  // "just redirected away from" guard belongs to the first visit only.
  await navigateTo(window, 'https://example.com/elsewhere');
  await expect
    .poll(() => webviewUrl(window), { timeout: 15_000 })
    .toBe('https://example.com/elsewhere');
  await navigateTo(window, GATEWAY_URL);
  await expect.poll(() => webviewUrl(window), { timeout: 15_000 }).toBe(NATIVE_URL);
});
