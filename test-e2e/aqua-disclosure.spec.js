// Steps 4 and 5 of the Aqua identity-claims feature, end to end: a
// harness-served site asks the wallet for claims through
// `aqua_requestDisclosure`, the user decides on the Share Identity screen,
// and the site verifies the response (test-e2e/fixtures/aqua-verifier.html,
// the example verifier) with an in-page stand-in for the identity service's
// verify endpoint, since web content cannot reach a loopback server under
// the harness. A real pre-seeded vault, a real encrypted claims
// store, the real disclosure build through the vendored WASM.
const { _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { test: base, expect } = require('./fixtures');
const { closeApp } = require('./close-app');

const repoRoot = path.resolve(__dirname, '..');
const identity = require(path.join(repoRoot, 'src', 'main', 'identity'));
const { createClaimsStore } = require(path.join(repoRoot, 'src', 'main', 'aqua', 'claims-store'));
const FIXTURE = path.join(repoRoot, 'src', 'main', 'aqua', '__fixtures__', 'name-claim.aqua.json');
const VERIFIER_PAGE = path.join(__dirname, 'fixtures', 'aqua-verifier.html');

const VAULT_PASSWORD = 'Freedom-E2E-Disclosure-2026!';
const SITE_URL = `bzz://${'c'.repeat(64)}/`;
const SITE_KEY = `bzz://${'c'.repeat(64)}`;

/** A claim record for the test wallet, built on the fixture tree. */
function claimRecord(address, type, payload) {
  const did = `did:pkh:eip155:1:${address}`;
  const tree = JSON.parse(fs.readFileSync(FIXTURE, 'utf8').replace(/did:pkh:eip155:1:0x[0-9a-fA-F]{40}/g, did));
  const [tip, obj] = Object.entries(tree.revisions).find(([, r]) => r.payloads);
  obj.payloads = { ...obj.payloads, ...payload };
  return {
    id: `e2e-${type}`, type, signerDid: did, address, nodeUrl: 'https://aqua.test', tip,
    genesis: Object.entries(tree.revisions).find(([, r]) => !r.previous_revision)[0],
    payload: obj.payloads, createdAt: '2026-10-22T12:00:00Z', signedAt: '2026-10-22T12:00:00Z', tree,
    verification: { isValid: true, status: 'OK', backend: 'service', checkedAt: '2026-10-22T12:00:00Z' },
    attestations: [], serverTips: { claim: tip, attestation: null },
  };
}

const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'f-aqua-'));
    const userDataDir = path.join(tmpRoot, 'userData');
    const identityDir = path.join(tmpRoot, 'identity');
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(identityDir, { recursive: true });
    fs.writeFileSync(
      path.join(userDataDir, 'settings.json'),
      JSON.stringify({ enableIdentityWallet: true, startAntAtLaunch: false, startIpfsAtLaunch: false, startRadicleAtLaunch: false, enableRadicleIntegration: false }),
      'utf-8'
    );
    const mnemonic = await identity.createVault(identityDir, VAULT_PASSWORD);
    const keys = identity.deriveAllKeys(mnemonic);
    const address = keys.userWallet.address;
    fs.writeFileSync(
      path.join(identityDir, 'vault-meta.json'),
      JSON.stringify({ addresses: { userWallet: address }, activeWalletIndex: 0, derivedWallets: [{ index: 0, name: 'Main Wallet', address }] }),
      'utf-8'
    );
    // Two claims in the encrypted store, sealed with this vault's seed.
    const seed = identity.getSeed(mnemonic);
    const store = createClaimsStore({ dataDir: identityDir, getSeed: async () => seed, isOwnDid: async () => true });
    await store.upsert(claimRecord(address, 'name', { given_name: 'Ada', family_name: 'Lovelace' }));
    await store.upsert(claimRecord(address, 'email', { email: 'ada@example.com' }));

    const app = await electron.launch({
      args: ['.'],
      cwd: repoRoot,
      env: { ...process.env, FREEDOM_TEST_MODE: '1', FREEDOM_TEST_USER_DATA: userDataDir, FREEDOM_IDENTITY_DATA: identityDir, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true', LANG: 'en_US.UTF-8' },
      timeout: 20_000,
    });
    app.__address = address;
    await use(app);
    await closeApp(app);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  },
});

function inTab(win, url, script) {
  return win.evaluate(
    async ({ url: u, js }) => {
      const wv = [...document.querySelectorAll('webview')].find((w) => {
        try { return w.getURL() === u; } catch { return false; }
      });
      if (!wv) return null;
      try { return await wv.executeJavaScript(js); } catch { return null; }
    },
    { url, js: script }
  );
}

const pageState = (win, url) =>
  inTab(win, url, `({ state: document.getElementById('status').dataset.state, text: document.getElementById('status').textContent, code: document.getElementById('status').dataset.code, missing: document.getElementById('status').dataset.missing, claims: [...document.querySelectorAll('#claims li')].map((li) => [li.dataset.type, li.dataset.attested]) })`);

test('a site requests claims, the user shares a subset, the site verifies the response', async ({ electronApp, window: win, harness }) => {
  test.setTimeout(150_000);
  const address = electronApp.__address;
  // The example page, with the service verify endpoint replaced by an
  // in-page stand-in that records every tree it is asked about and answers
  // valid for any tree that has revisions.
  const STUB = `<script>
    window.__verifyCalls = [];
    window.AQUA_VERIFY = async (body) => {
      window.__verifyCalls.push(body);
      const ok = body.main && typeof body.main.revisions === 'object' && Object.keys(body.main.revisions).length > 0;
      return { success: true, is_valid: ok, status: ok ? 'OK' : 'empty', logs: [] };
    };
  </script>`;
  const page = fs.readFileSync(VERIFIER_PAGE, 'utf8').replace('<script>\n      // Where to verify', `${STUB}<script>\n      // Where to verify`);
  expect(page).toContain('__verifyCalls');
  await harness.setContentFixture(SITE_URL, { contentType: 'text/html; charset=utf-8', body: page });
  const verifier = { calls: () => inTab(win, SITE_URL, 'window.__verifyCalls') };

  expect((await win.evaluate((pw) => window.identity.unlock(pw), VAULT_PASSWORD)).success).toBe(true);
  await win.evaluate((key) => window.dappPermissions.grantPermission(key, 0, 100), SITE_KEY);

  const addressBar = win.locator('[data-test="address-input"]');
  await addressBar.click();
  await addressBar.fill(SITE_URL);
  await addressBar.press('Enter');
  await expect.poll(() => inTab(win, SITE_URL, 'Boolean(window.ethereum?.request)'), { timeout: 30_000 }).toBe(true);

  // Connect (already granted, so it resolves without a prompt), then request.
  await inTab(win, SITE_URL, `document.getElementById('connect').click(); true`);
  await expect.poll(() => pageState(win, SITE_URL).then((s) => s?.state), { timeout: 20_000 }).toBe('connected');
  await inTab(win, SITE_URL, `document.getElementById('request').click(); true`);

  // The Share Identity screen: email and name offered and ticked, domain missing.
  const screen = win.locator('#sidebar-aqua-disclose');
  await expect(screen).toBeVisible({ timeout: 20_000 });
  await expect(win.locator('#aqua-disclose-site')).toHaveText(SITE_KEY);
  await expect(win.locator('#aqua-disclose-purpose')).toContainText('order confirmation');
  const rows = win.locator('#aqua-disclose-list .aqua-disclose-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('ada@example.com');
  await expect(rows.nth(1)).toContainText('Ada');
  await expect(rows.nth(1)).not.toContainText('Lovelace'); // only given_name was asked for
  await expect(rows.nth(2)).toContainText('no such claim');
  await expect(rows.nth(2).locator('.aqua-disclose-check')).toBeDisabled();

  // Share both: the email whole, the name redacted to its given name.
  await win.click('#aqua-disclose-share');
  await expect(screen).toBeHidden();

  await expect.poll(() => pageState(win, SITE_URL).then((s) => s?.state), { timeout: 30_000 }).toBe('verified');
  const state = await pageState(win, SITE_URL);
  expect(state.claims).toEqual([['email', '0'], ['name', '0']]);
  expect(state.missing).toBe('');
  // The verifier saw the email tree whole, with the subject it expected, and
  // the name claim as a selective tree whose family name is sealed.
  const calls = await verifier.calls();
  expect(calls.map((c) => c.kind)).toEqual(['tree', 'selective']);
  const payloads = Object.values(calls[0].main.revisions).find((r) => r.payloads).payloads;
  expect(payloads.email).toBe('ada@example.com');
  expect(payloads.signer_did.toLowerCase()).toBe(`did:pkh:eip155:1:${address}`.toLowerCase());
  const redacted = Object.values(calls[1].main.revisions).find((r) => r.disclosure === 'Redacted').redacted;
  const disclosed = redacted.leaves.filter((l) => l.type === 'Disclosed').map((l) => l.path);
  expect(disclosed).toContain('/payloads/given_name');
  expect(disclosed).not.toContain('/payloads/family_name');

  // A second request, rejected: the site gets 4001 and nothing is verified.
  await inTab(win, SITE_URL, `document.getElementById('request').click(); true`);
  await expect(screen).toBeVisible({ timeout: 20_000 });
  await win.click('#aqua-disclose-reject');
  await expect.poll(() => pageState(win, SITE_URL).then((s) => s?.state), { timeout: 20_000 }).toBe('failed');
  expect((await pageState(win, SITE_URL)).code).toBe('4001');
  expect(await verifier.calls()).toHaveLength(2);
});
