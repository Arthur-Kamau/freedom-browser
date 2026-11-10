/**
 * freedom://identity renders service and user strings as text, drives the
 * one-time-code flow in order, never labels a self-signed claim as verified,
 * and keeps every claim's evidence in the panel beside the list.
 */
const { runPageScript } = require('../../../test/helpers/page-script-harness');

const HOSTILE = `"><img src=x onerror=alert(1) data-xss="1">'<b>&amp;`;
const IDS = {
  // Identity bar
  'status-wallet': 'span',
  'copy-address-btn': 'button',
  'status-lock': 'span',
  'wallet-line': 'p',
  'status-service': 'span',
  'node-url': 'span',
  'node-state': 'span',
  'node-state-text': 'span',
  'node-item-host': 'span',
  'node-item-url': 'span',
  'status-caps': 'span',
  'node-settings-btn': 'button',
  'node-menu': 'details',
  'status-notice': 'div',
  'claims-count': 'span',
  'shared-count': 'span',
  content: 'main',
  'nav-claims': 'button',
  'nav-attest': 'button',
  'nav-requests': 'button',
  'panel-claims': 'section',
  'panel-attest': 'section',
  'panel-requests': 'section',
  // Readiness
  ready: 'section',
  'ready-title': 'h2',
  'ready-lead': 'p',
  'ready-aside-title': 'p',
  'ready-aside-text': 'p',
  'locked-card': 'li',
  'locked-mark': 'span',
  'locked-title': 'div',
  'locked-text': 'p',
  'unlock-btn': 'button',
  'service-down': 'li',
  'service-mark': 'span',
  'service-down-text': 'p',
  'service-retry-btn': 'button',
  'service-settings-btn': 'button',
  'signin-card': 'li',
  'signin-mark': 'span',
  'signin-text': 'p',
  'signin-btn': 'button',
  'signin-error': 'div',
  // Me
  'me-split': 'div',
  'claims-line': 'p',
  'add-claim-btn': 'button',
  'claims-list': 'div',
  'claims-slots': 'div',
  'claim-panel': 'section',
  'claims-empty': 'div',
  'start-name-btn': 'button',
  'claim-detail': 'div',
  'ask-view': 'div',
  'ask-title': 'h2',
  'import-view': 'div',
  // Composer
  composer: 'div',
  'composer-node': 'span',
  'add-claim-title': 'h3',
  'kind-help': 'p',
  'kinds-note': 'p',
  'code-help': 'span',
  'claim-form': 'form',
  'claim-kind': 'div',
  'kind-name': 'button',
  'kind-email': 'button',
  'kind-phone': 'button',
  'kind-domain': 'button',
  'fields-name': 'div',
  'fields-email': 'div',
  'fields-phone': 'div',
  'fields-domain': 'div',
  'given-name': 'input',
  'family-name': 'input',
  'middle-name': 'input',
  nickname: 'input',
  email: 'input',
  'phone-number': 'input',
  domain: 'input',
  code: 'input',
  'preview-value': 'div',
  'preview-proof': 'div',
  'code-section': 'div',
  'otp-step-send': 'div',
  'otp-step-enter': 'div',
  'otp-step-sign': 'div',
  'otp-send-note': 'span',
  'otp-enter-note': 'span',
  'send-code-btn': 'button',
  'verify-code-btn': 'button',
  'code-status': 'span',
  'form-error': 'div',
  'create-btn': 'button',
  'cancel-btn': 'button',
  'cancel-compose-btn': 'button',
  // Ask, import (views in the claim panel)
  'share-summary': 'div',
  'share-address': 'input',
  'share-btn': 'button',
  'share-error': 'div',
  'share-cancel': 'button',
  'share-cancel-btn': 'button',
  'import-summary': 'div',
  'import-text': 'textarea',
  'import-file': 'input',
  'import-btn': 'button',
  'import-error': 'div',
  'import-cancel': 'button',
  'import-cancel-btn': 'button',
  // All details, Remove (dialogs)
  'vouches-dialog': 'dialog',
  'vouches-summary': 'div',
  'vouches-list': 'div',
  'vouches-remove-btn': 'button',
  'vouches-done': 'button',
  'vouches-close': 'button',
  'remove-dialog': 'dialog',
  'remove-summary': 'div',
  'remove-goes': 'ul',
  'remove-btn': 'button',
  'remove-error': 'div',
  'remove-cancel': 'button',
  'remove-close': 'button',
  // Vouches I give
  'give-split': 'div',
  'shared-line': 'p',
  'shared-claims': 'div',
  'shared-panel': 'section',
  'shared-detail': 'div',
  'attest-view': 'div',
  'shared-tech': 'div',
  'attest-words': 'textarea',
  'attest-btn': 'button',
  'attest-error': 'div',
  // Requests
  'request-box': 'div',
  'request-input': 'textarea',
  'request-btn': 'button',
  'request-status': 'p',
  'request-cancel': 'button',
  'response-box': 'div',
  'response-output': 'textarea',
  'response-copy': 'button',
  'request-aside': 'div',
};

function claim(overrides = {}) {
  return {
    id: 'c1',
    type: 'name',
    signerDid: 'did:pkh:eip155:1:0xabc',
    tip: '0x1620' + '1'.repeat(64),
    payload: { given_name: HOSTILE, family_name: 'Freedom' },
    createdAt: '2026-10-22T12:00:00Z',
    signedAt: '2026-10-22T12:00:00Z',
    verification: { isValid: true, status: 'OK', checkedAt: '2026-10-22T12:00:00Z' },
    attestations: [],
    ...overrides,
  };
}

function api(overrides = {}) {
  return {
    aquaStatus: jest.fn(async () => ({
      success: true,
      nodeUrl: 'https://aqua.test',
      wallet: { address: '0xabc', canSign: true },
      vaultUnlocked: true,
      hasVault: true,
      signedIn: true,
    })),
    aquaSignIn: jest.fn(async () => ({
      success: true,
      signedIn: true,
      did: 'did:pkh:eip155:1:0xabc',
    })),
    aquaListClaims: jest.fn(async () => ({ success: true, claims: [] })),
    aquaCreateClaim: jest.fn(async () => ({ success: true, claim: claim() })),
    aquaRemoveClaim: jest.fn(async () => ({ success: true, removed: true })),
    aquaRefreshClaim: jest.fn(async () => ({ success: true, claim: claim() })),
    aquaSendCode: jest.fn(async ({ target }) => ({ success: true, target, message: 'sent' })),
    aquaVerifyCode: jest.fn(async () => ({ success: true, verificationToken: 'vt' })),
    aquaDnsInstructions: jest.fn(async () => ({
      success: true,
      txt_name: '_aqua.example.com',
      txt_value: HOSTILE,
      domain: 'example.com',
    })),
    aquaVerifyDns: jest.fn(async () => ({
      success: true,
      claim: claim({
        type: 'domain',
        payload: { domain_name: 'example.com' },
        domainVerification: 'mismatch',
        dnsCheck: { status: 'mismatch', message: HOSTILE, checkedAt: '2026-10-26T10:00:00Z' },
      }),
    })),
    aquaShareClaim: jest.fn(async () => ({ success: true, claim: claim() })),
    aquaPullAttestations: jest.fn(async () => ({ success: true, claim: null })),
    aquaImportAttestation: jest.fn(async () => ({ success: true, claim: claim() })),
    aquaListShared: jest.fn(async () => ({ success: true, shared: [] })),
    aquaAttestShared: jest.fn(async () => ({ success: true, issued: { id: 'a1' } })),
    aquaListIssued: jest.fn(async () => ({ success: true, issued: [] })),
    aquaExportIssued: jest.fn(async () => ({ success: true, json: '{"revisions":{}}' })),
    aquaSetTrust: jest.fn(async () => ({ success: true, entry: {} })),
    copyText: jest.fn(async () => true),
    aquaUnlock: jest.fn(async () => ({ success: true, unlocked: true })),
    openInNewTab: jest.fn(),
    onAquaClaimsChanged: jest.fn(),
    ...overrides,
  };
}

const run = async (freedomAPI, windowExtras) => {
  const page = await runPageScript('identity', { ids: IDS, freedomAPI, windowExtras });
  // The harness element has no form API; the page calls reset() when the
  // composer closes.
  page.elements['claim-form'].reset = () => {};
  return page;
};

// The fake elements have no showModal(), so the page falls back to the
// `open` property the browser would set itself.
const isOpen = (dialog) => dialog.open === true;
const shown = (node) => !node.classList.contains('hidden');
const current = (step) => step.classList.contains('current');
const buttonNamed = (root, text) =>
  root.querySelectorAll('.btn').find((b) => b.textContent === text);
const panel = (page) => page.elements['claim-detail'];

describe('freedom://identity', () => {
  test('shows the empty start and the wallet line', async () => {
    const page = await run(api());
    expect(shown(page.elements['claims-empty'])).toBe(true);
    expect(page.elements['claims-list'].children).toHaveLength(0);
    expect(page.elements['claims-count'].textContent).toBe('0');
    expect(page.elements['wallet-line'].textContent).toContain('Wallet 0xabc');
    expect(page.elements['wallet-line'].textContent).toContain('https://aqua.test');
    expect(page.elements['status-wallet'].textContent).toBe('0xabc');
    // The node card names the node and says it answers.
    expect(page.elements['status-service'].textContent).toBe('aqua.test');
    expect(page.elements['node-url'].textContent).toBe('aqua.test');
    expect(page.elements['node-state-text'].textContent).toBe('Reachable');
    // Every kind is offered as a slot to add.
    expect(
      page.elements['claims-slots'].querySelectorAll('.slot').map((s) => s.dataset.kind)
    ).toEqual(['name', 'email', 'phone', 'domain']);
    expect(shown(page.elements.ready)).toBe(false);
  });

  test('a locked vault is said once, on the checklist with the Unlock button, and the lists stay empty', async () => {
    const locked = {
      success: false,
      error: { code: 'VAULT_LOCKED', message: 'Unlock your vault' },
    };
    const lockedApi = api({
      aquaStatus: async () => ({
        success: true,
        nodeUrl: 'u',
        wallet: { address: '0xabc' },
        vaultUnlocked: false,
        hasVault: true,
      }),
      aquaListClaims: async () => locked,
      aquaListIssued: async () => locked,
    });
    const page = await run(lockedApi);
    expect(shown(page.elements.ready)).toBe(true);
    expect(current(page.elements['locked-card'])).toBe(true);
    expect(page.elements['locked-title'].textContent).toContain('unlocked');
    expect(shown(page.elements['unlock-btn'])).toBe(true);
    expect(page.elements['node-state-text'].textContent).toBe('Wallet locked');
    // The address is public and still shown, marked as locked.
    expect(page.elements['status-wallet'].textContent).toBe('0xabc');
    expect(shown(page.elements['status-lock'])).toBe(true);
    // Nowhere else repeats it.
    expect(shown(page.elements['status-notice'])).toBe(false);
    expect(page.elements['claims-list'].children).toHaveLength(0);
    expect(shown(page.elements['claims-empty'])).toBe(false);
    expect(page.elements['shared-claims'].children).toHaveLength(0);
    expect(page.elements['add-claim-btn'].disabled).toBe(true);
    expect(page.elements['request-btn'].disabled).toBe(true);
    // The page polls for an unlock made elsewhere while the vault is locked.
    expect(page.timers.length).toBeGreaterThan(0);
    await page.elements['unlock-btn'].fire('click');
    expect(lockedApi.aquaUnlock).toHaveBeenCalled();
  });

  test('a missing vault is the first step, without an Unlock button', async () => {
    const locked = {
      success: false,
      error: { code: 'VAULT_LOCKED', message: 'Unlock your vault' },
    };
    const page = await run(
      api({
        aquaStatus: async () => ({
          success: true,
          nodeUrl: 'u',
          wallet: null,
          vaultUnlocked: false,
          hasVault: false,
        }),
        aquaListClaims: async () => locked,
      })
    );
    expect(current(page.elements['locked-card'])).toBe(true);
    expect(page.elements['locked-text'].textContent).toContain('wallet sidebar');
    expect(shown(page.elements['unlock-btn'])).toBe(false);
    expect(shown(page.elements['status-lock'])).toBe(false);
    expect(page.elements['node-state-text'].textContent).toBe('No wallet yet');
    expect(page.elements['claims-list'].children).toHaveLength(0);
    expect(page.elements['add-claim-btn'].disabled).toBe(true);
  });

  test('an open wallet with no service session shows the sign-in step and loads nothing until signed', async () => {
    let signedIn = false;
    const freedomAPI = api({
      aquaStatus: jest.fn(async () => ({
        success: true,
        nodeUrl: 'https://aqua.test',
        wallet: { address: '0xabc', canSign: true },
        vaultUnlocked: true,
        hasVault: true,
        signedIn,
      })),
      aquaSignIn: jest.fn(async () => {
        signedIn = true;
        return { success: true, signedIn: true };
      }),
      aquaListClaims: jest.fn(async () => ({ success: true, claims: [claim()] })),
    });
    const page = await run(freedomAPI);
    expect(shown(page.elements.ready)).toBe(true);
    expect(current(page.elements['signin-card'])).toBe(true);
    expect(page.elements['locked-card'].classList.contains('done')).toBe(true);
    expect(page.elements['service-down'].classList.contains('done')).toBe(true);
    expect(page.elements['signin-text'].textContent).toContain('aqua.test');
    expect(page.elements['node-state-text'].textContent).toBe('Not signed in');
    expect(page.elements['add-claim-btn'].disabled).toBe(true);
    // Nothing that needs a session was fetched, and no claims are shown.
    expect(freedomAPI.aquaListClaims).not.toHaveBeenCalled();
    expect(freedomAPI.aquaListShared).not.toHaveBeenCalled();
    expect(page.elements['claims-list'].children).toHaveLength(0);

    await page.elements['signin-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaSignIn).toHaveBeenCalledTimes(1);
    expect(shown(page.elements.ready)).toBe(false);
    expect(page.elements['claims-list'].children).toHaveLength(1);
    expect(page.elements['add-claim-btn'].disabled).toBe(false);
  });

  test('a refused sign-in keeps the step up with the reason, as text', async () => {
    const freedomAPI = api({
      aquaStatus: jest.fn(async () => ({
        success: true,
        nodeUrl: 'u',
        wallet: { address: '0xabc' },
        vaultUnlocked: true,
        hasVault: true,
        signedIn: false,
      })),
      aquaSignIn: jest.fn(async () => ({
        success: false,
        error: { code: 'ERROR', message: HOSTILE },
      })),
    });
    const page = await run(freedomAPI);
    await page.elements['signin-btn'].fire('click');
    await page.flush();
    expect(current(page.elements['signin-card'])).toBe(true);
    expect(page.elements['signin-error'].textContent).toBe(HOSTILE);
    expect(page.document.htmlWrites).toHaveLength(0);
  });

  test('unlocking from the page goes straight on to the sign-in signature, and only then to the claims', async () => {
    let unlocked = false;
    let signedIn = false;
    const calls = [];
    const freedomAPI = api({
      aquaStatus: jest.fn(async () => ({
        success: true,
        nodeUrl: 'u',
        wallet: { address: '0xabc' },
        vaultUnlocked: unlocked,
        hasVault: true,
        signedIn,
      })),
      aquaUnlock: jest.fn(async () => {
        calls.push('unlock');
        unlocked = true;
        return { success: true, unlocked: true };
      }),
      aquaSignIn: jest.fn(async () => {
        calls.push('sign-in');
        signedIn = true;
        return { success: true, signedIn: true };
      }),
      aquaListClaims: jest.fn(async () => {
        calls.push('claims');
        return { success: true, claims: [] };
      }),
    });
    const page = await run(freedomAPI);
    expect(current(page.elements['locked-card'])).toBe(true);
    await page.elements['unlock-btn'].fire('click');
    await page.flush();
    expect(calls).toEqual(['unlock', 'sign-in', 'claims']);
    expect(current(page.elements['signin-card'])).toBe(false);
    expect(current(page.elements['locked-card'])).toBe(false);
    expect(shown(page.elements.ready)).toBe(false);
  });

  test('a node that does not answer is the step that blocks, with Try again and the way to Settings', async () => {
    const freedomAPI = api({
      aquaStatus: jest.fn(async () => ({
        success: true,
        nodeUrl: 'https://down.test',
        wallet: { address: '0xabc' },
        vaultUnlocked: true,
        hasVault: true,
        service: { reachable: false, serviceDid: null, outOfBandVerification: false },
      })),
    });
    const page = await run(freedomAPI);
    expect(current(page.elements['service-down'])).toBe(true);
    expect(page.elements['locked-card'].classList.contains('done')).toBe(true);
    expect(page.elements['service-down-text'].textContent).toContain('down.test');
    expect(page.elements['node-state-text'].textContent).toBe('Not answering');
    expect(page.elements['status-caps'].textContent).toBe('Not answering');
    expect(page.elements['wallet-line'].textContent).toContain('unreachable');
    await page.elements['service-settings-btn'].fire('click');
    expect(freedomAPI.openInNewTab).toHaveBeenCalledWith('freedom://settings/identity');
    await page.elements['node-settings-btn'].fire('click');
    expect(freedomAPI.openInNewTab).toHaveBeenCalledTimes(2);
    await page.elements['service-retry-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaStatus).toHaveBeenCalledTimes(2);

    const up = await run(api());
    expect(current(up.elements['service-down'])).toBe(false);
    expect(up.elements['status-caps'].textContent).toBe('Signed in · checks email, phone, domain');
  });

  test('an unlocked wallet shows no lock anywhere and enables the actions', async () => {
    const page = await run(api());
    expect(shown(page.elements.ready)).toBe(false);
    expect(current(page.elements['locked-card'])).toBe(false);
    expect(shown(page.elements['status-lock'])).toBe(false);
    expect(page.elements['add-claim-btn'].disabled).toBe(false);
    expect(page.elements['request-btn'].disabled).toBe(false);
  });

  test('renders a claim with hostile payload as text and labels it Not yet verified, never verified', async () => {
    const page = await run(
      api({ aquaListClaims: async () => ({ success: true, claims: [claim()] }) })
    );
    expect(shown(page.elements['claims-empty'])).toBe(false);
    expect(page.elements['claims-count'].textContent).toBe('1');
    expect(page.elements['claims-line'].textContent).toBe('1 claim on aqua.test');
    const row = page.elements['claims-list'].querySelector('.card');
    expect(row.classList.contains('selected')).toBe(true);
    expect(row.querySelector('.row-value').textContent).toBe(`${HOSTILE} Freedom`);
    expect(row.querySelector('.claim-icon').querySelector('.ico-user')).not.toBeNull();
    expect(row.querySelector('.badge').textContent).toBe('Not yet verified');
    expect(row.querySelector('.badge').querySelector('.ico-pen')).not.toBeNull();
    expect(page.elements['claims-list'].textContent).not.toMatch(/verified by|Verified$/);
    // The panel shows the same claim: its value, the marks, the next step and the technical rows.
    expect(panel(page).querySelector('.panel-value').textContent).toContain(`${HOSTILE} Freedom`);
    expect(panel(page).textContent).toContain('people who know you');
    expect(panel(page).querySelector('.tech-rows').textContent).toContain('did:pkh:eip155:1:0xabc');
    // The remaining kinds are offered under the list.
    expect(
      page.elements['claims-slots'].querySelectorAll('.slot').map((s) => s.dataset.kind)
    ).toEqual(['email', 'phone', 'domain']);
    // Nothing on the page went through an HTML sink (#432).
    expect(page.document.htmlWrites).toHaveLength(0);
  });

  test('each claim kind carries its own icon, and the rows select the panel', async () => {
    const claims = [
      claim({ id: 'n', type: 'name' }),
      claim({ id: 'e', type: 'email', payload: { email: 'a@b.c' } }),
      claim({ id: 'p', type: 'phone', payload: { phone_number: '+1' } }),
      claim({ id: 'd', type: 'domain', payload: { domain_name: 'example.com' } }),
    ];
    const page = await run(api({ aquaListClaims: async () => ({ success: true, claims }) }));
    const icons = page.elements['claims-list']
      .querySelectorAll('.claim-icon')
      .map((box) => box.querySelector('.ico').className);
    expect(icons).toEqual(['ico ico-user', 'ico ico-mail', 'ico ico-phone', 'ico ico-globe']);
    expect(page.elements['claims-slots'].children).toHaveLength(0);
    const rows = page.elements['claims-list'].querySelectorAll('.card');
    await rows[1].fire('click');
    expect(rows[1].classList.contains('selected')).toBe(true);
    expect(rows[0].classList.contains('selected')).toBe(false);
    expect(panel(page).querySelector('.panel-value').textContent).toContain('a@b.c');
    // On a phone the row opens the panel over the list; the back link returns.
    expect(page.elements['me-split'].classList.contains('show-pane')).toBe(true);
    await panel(page).querySelector('.back-link').fire('click');
    expect(page.elements['me-split'].classList.contains('show-pane')).toBe(false);
  });

  test('the two marks: the node check and the people who vouch, each with its own icon', async () => {
    const checked = claim({
      id: 'e',
      type: 'email',
      payload: { email: 'a@b.c' },
      attestations: [
        {
          tip: '0x1',
          attesterDid: 'did:pkh:eip155:1:0xserver',
          source: 'service',
          trust: 'trusted',
          verification: { isValid: true },
        },
        {
          tip: '0x2',
          attesterDid: 'did:pkh:eip155:1:0xpeer',
          source: 'peer',
          trust: 'trusted',
          verification: { isValid: true },
        },
        {
          tip: '0x3',
          attesterDid: 'did:pkh:eip155:1:0xpeer2',
          source: 'peer',
          verification: { isValid: true },
        },
      ],
    });
    const page = await run(
      api({ aquaListClaims: async () => ({ success: true, claims: [claim(), checked] }) })
    );
    const rows = page.elements['claims-list'].querySelectorAll('.card');
    // A name: no node can check it, so the shield is quiet, and nobody vouches yet.
    const nameMarks = rows[0].querySelectorAll('.mark');
    expect(nameMarks[0].classList.contains('tone-quiet')).toBe(true);
    expect(nameMarks[0].querySelector('.ico-shield-plain')).not.toBeNull();
    expect(nameMarks[1].classList.contains('tone-dashed')).toBe(true);
    // An email the node checked, with two people, one of them trusted: a teal
    // shield and two pips, green because a trusted person vouches.
    const emailMarks = rows[1].querySelectorAll('.mark');
    expect(emailMarks[0].classList.contains('tone-service')).toBe(true);
    expect(emailMarks[0].querySelector('.ico-shield-check')).not.toBeNull();
    expect(emailMarks[0].textContent).toContain('Checked');
    expect(emailMarks[1].classList.contains('tone-success')).toBe(true);
    expect(emailMarks[1].querySelectorAll('.pip')).toHaveLength(2);
    expect(rows[1].querySelector('.badge').textContent).toBe('Verified');
    // The panel says the same in two tiles, with one pip per person.
    await rows[1].fire('click');
    const tiles = panel(page).querySelectorAll('.tile');
    expect(tiles[0].querySelector('.tile-value').textContent).toBe('Checked by aqua.test');
    expect(tiles[1].querySelector('.tile-value').textContent).toContain(
      'Vouched by 2, 1 you trust'
    );
    expect(tiles[1].querySelectorAll('.pip-lg')).toHaveLength(2);
    expect(tiles[1].querySelectorAll('.untrusted')).toHaveLength(1);
  });

  test('an attested claim lists the attester and their words, as text, with the source icon', async () => {
    const attested = claim({
      attestations: [
        {
          tip: '0x1',
          attesterDid: 'did:pkh:eip155:1:0xserver',
          context: HOSTILE,
          source: 'service',
          trust: 'trusted',
          verification: { isValid: true },
        },
      ],
    });
    const page = await run(
      api({ aquaListClaims: async () => ({ success: true, claims: [attested] }) })
    );
    const row = page.elements['claims-list'].querySelector('.card');
    expect(row.querySelector('.badge').textContent).toBe('Verified');
    expect(row.querySelector('.badge').classList.contains('attested')).toBe(true);
    const box = panel(page).querySelector('.attestation');
    // The attester is shortened to its address, with the whole DID on hover.
    expect(box.querySelector('.who').textContent).toBe('0xserver');
    expect(box.querySelector('.who').title).toBe('did:pkh:eip155:1:0xserver');
    expect(box.querySelector('.badge').textContent).toBe('Trusted by you');
    expect(panel(page).querySelector('.trust-line').textContent).toBe(
      'Verified: aqua.test checked it.'
    );
    expect(box.querySelector('.words').textContent).toBe(HOSTILE);
    // The words fold to two lines and open on click.
    await box.querySelector('.words').fire('click');
    expect(box.querySelector('.words').classList.contains('expanded')).toBe(true);
    // The node is named, not called "the identity service".
    expect(box.querySelector('.source').textContent).toBe('aqua.test');
    expect(box.querySelector('.source').querySelector('.ico-server')).not.toBeNull();
    // The timeline ends with your own signature, which is not a vouch.
    const events = panel(page).querySelectorAll('.event');
    expect(events[events.length - 1].classList.contains('signed')).toBe(true);
    expect(events[events.length - 1].classList.contains('attestation')).toBe(false);
    expect(page.document.htmlWrites).toHaveLength(0);
  });

  test('each vouch says when it was signed, and All details lists every wallet, time and hash in full', async () => {
    const bob = 'did:pkh:eip155:1:0xB0bB0bB0bB0bB0bB0bB0bB0bB0bB0bB0bB0bB0bB';
    const signed = 1793235600; // 2026-10-29T01:00Z: the signature revision's timestamp, in seconds
    const tree = {
      revisions: {
        '0xa': { local_timestamp: signed - 1 },
        '0xb': { local_timestamp: signed, signer: bob },
      },
    };
    const claimWithTwo = claim({
      attestations: [
        {
          tip: '0x1620' + 'a'.repeat(64),
          attesterDid: bob,
          context: HOSTILE,
          source: 'peer',
          tree,
          verification: { isValid: true },
        },
        {
          tip: '0x1620' + 'b'.repeat(64),
          attesterDid: 'did:pkh:eip155:1:0xserver',
          context: 'checked',
          source: 'service',
          issuedAt: '2026-10-28T10:31:00Z',
          verification: { isValid: true },
        },
      ],
    });
    const fx = api({ aquaListClaims: async () => ({ success: true, claims: [claimWithTwo] }) });
    const page = await run(fx);
    const rows = panel(page).querySelectorAll('.attestation');
    // Newest first: the peer signed later than the service.
    expect(rows[0].querySelector('.who').textContent).toBe('0xB0bB…B0bB');
    expect(rows[0].querySelector('.when').textContent).toBe(
      `signed ${new Date(signed * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
    );
    expect(rows[1].querySelector('.when').textContent).toBe(
      `signed ${new Date('2026-10-28T10:31:00Z').toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
    );

    await panel(page).querySelector('.link-btn').fire('click');
    const dialog = page.elements['vouches-dialog'];
    expect(isOpen(dialog)).toBe(true);
    expect(page.elements['vouches-summary'].textContent).toContain(`${HOSTILE} Freedom`);
    const vouches = page.elements['vouches-list'].querySelectorAll('.vouch');
    expect(vouches).toHaveLength(3);
    const first = vouches[0];
    expect(first.querySelector('.source').textContent).toBe('Person');
    const cells = first
      .querySelectorAll('.dns-row')
      .map((row) => [
        row.querySelector('.label').textContent,
        row.querySelector('.mono').textContent,
      ]);
    expect(cells).toEqual([
      ['Wallet', '0xB0bB0bB0bB0bB0bB0bB0bB0bB0bB0bB0bB0bB0bB'],
      [
        'Signed',
        new Date(signed * 1000).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
      ],
      ['Hash', '0x1620' + 'a'.repeat(64)],
    ]);
    expect(first.querySelector('.words').textContent).toBe(HOSTILE);
    expect(vouches[1].querySelector('.source').textContent).toBe('aqua.test');
    // Your own signature closes the list, with the claim's hash.
    expect(vouches[2].querySelector('.source').textContent).toBe('You signed the claim');
    expect(vouches[2].textContent).toContain('0x1620' + '1'.repeat(64));
    expect(page.document.htmlWrites).toHaveLength(0);
    // The wallet address copies whole.
    await buttonNamed(first, 'Copy').fire('click');
    expect(fx.copyText).toHaveBeenCalledWith('0xB0bB0bB0bB0bB0bB0bB0bB0bB0bB0bB0bB0bB0bB');
    await page.elements['vouches-done'].fire('click');
    expect(isOpen(dialog)).toBe(false);
  });

  test('a failed attestation carries one Does not verify chip and its reason, and does not count', async () => {
    const failed = claim({
      attestations: [
        {
          tip: '0x1',
          attesterDid: 'did:pkh:eip155:1:0x0ca27C8a817291673dce4020BAd3b5dc1DDE1109',
          context: 'words',
          source: 'service',
          verification: { isValid: false, status: 'FAILED' },
        },
      ],
    });
    const page = await run(
      api({ aquaListClaims: async () => ({ success: true, claims: [failed] }) })
    );
    const row = page.elements['claims-list'].querySelector('.card');
    expect(row.querySelector('.badge').textContent).toBe('Not yet verified');
    // The node's mark says the check failed.
    expect(row.querySelector('.mark').classList.contains('tone-danger')).toBe(true);
    const box = panel(page).querySelector('.attestation');
    expect(box.classList.contains('invalid')).toBe(true);
    expect(box.querySelector('.who').textContent).toBe('0x0ca2…1109');
    expect(box.querySelector('.badge').textContent).toBe('Does not verify');
    expect(box.querySelector('.state').textContent).toBe('Does not verify: FAILED');
  });

  test('valid vouches from signers not on the trust list are counted, and never read Verified', async () => {
    const two = claim({
      attestations: [
        { tip: '0x1', attesterDid: 'a', verification: { isValid: true } },
        { tip: '0x2', attesterDid: 'b', verification: { isValid: true } },
        { tip: '0x3', attesterDid: 'c', verification: { isValid: false, status: 'bad' } },
      ],
    });
    const page = await run(api({ aquaListClaims: async () => ({ success: true, claims: [two] }) }));
    const badge = page.elements['claims-list'].querySelector('.badge');
    expect(badge.textContent).toBe('Vouched by 2');
    expect(badge.classList.contains('attested')).toBe(false);
  });

  test('a failed verification is one red mark on the row, and the panel says what failed', async () => {
    const page = await run(
      api({
        aquaListClaims: async () => ({
          success: true,
          claims: [claim({ verification: { isValid: false, status: 'Chain broken' } })],
        }),
      })
    );
    const row = page.elements['claims-list'].querySelector('.card');
    const badge = row.querySelector('.badge');
    expect(badge.textContent).toBe('Does not verify');
    expect(badge.classList.contains('invalid')).toBe(true);
    expect(row.querySelectorAll('.mark')).toHaveLength(1);
    expect(row.querySelector('.mark').textContent).toBe('Does not verify');
    expect(panel(page).querySelector('.broken').textContent).toContain(
      'The chain check failed: Chain broken'
    );
    expect(panel(page).textContent).toContain('The chain check: Chain broken');
    expect(buttonNamed(panel(page), 'Check again')).toBeDefined();
    expect(buttonNamed(panel(page), 'Ask someone to vouch')).toBeUndefined();
  });

  test('Add a claim opens the composer in place of the list, and Cancel closes it', async () => {
    const page = await run(api());
    expect(shown(page.elements.composer)).toBe(false);
    await page.elements['add-claim-btn'].fire('click');
    expect(shown(page.elements.composer)).toBe(true);
    expect(shown(page.elements['me-split'])).toBe(false);
    expect(page.elements['kind-name'].getAttribute('aria-pressed')).toBe('true');
    expect(shown(page.elements['fields-name'])).toBe(true);
    expect(page.elements['composer-node'].textContent).toBe('aqua.test');
    await page.elements['cancel-btn'].fire('click');
    expect(shown(page.elements.composer)).toBe(false);
    expect(shown(page.elements['me-split'])).toBe(true);
    // The empty start and a slot open it on their kind.
    await page.elements['start-name-btn'].fire('click');
    expect(shown(page.elements.composer)).toBe(true);
    await page.elements['cancel-compose-btn'].fire('click');
    await page.elements['claims-slots'].querySelectorAll('.slot')[3].fire('click');
    expect(page.elements['kind-domain'].getAttribute('aria-pressed')).toBe('true');
    expect(shown(page.elements['fields-domain'])).toBe(true);
  });

  test('creating a name claim sends the fields, closes the composer and reloads', async () => {
    const freedomAPI = api();
    const page = await run(freedomAPI);
    await page.elements['add-claim-btn'].fire('click');
    page.elements['given-name'].value = 'Probe';
    page.elements['family-name'].value = 'Freedom';
    await page.elements['given-name'].fire('input');
    expect(page.elements['preview-value'].textContent).toBe('Probe Freedom');
    await page.elements['create-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaCreateClaim).toHaveBeenCalledWith({
      type: 'name',
      fields: { given_name: 'Probe', family_name: 'Freedom', middle_name: '', nickname: '' },
    });
    expect(freedomAPI.aquaListClaims).toHaveBeenCalledTimes(2);
    expect(shown(page.elements.composer)).toBe(false);
  });

  test('an email claim needs the code verified first, for the same address, as numbered steps', async () => {
    const freedomAPI = api();
    const page = await run(freedomAPI);
    await page.elements['add-claim-btn'].fire('click');
    await page.elements['kind-email'].fire('click');
    expect(page.elements['kind-email'].getAttribute('aria-pressed')).toBe('true');
    expect(page.elements['kind-name'].getAttribute('aria-pressed')).toBe('false');
    expect(shown(page.elements['fields-email'])).toBe(true);
    expect(shown(page.elements['fields-name'])).toBe(false);
    expect(shown(page.elements['code-section'])).toBe(true);
    expect(current(page.elements['otp-step-send'])).toBe(true);

    await page.elements['create-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaCreateClaim).not.toHaveBeenCalled();
    expect(page.elements['form-error'].textContent).toContain('Verify the code');

    await page.elements['send-code-btn'].fire('click');
    expect(freedomAPI.aquaSendCode).not.toHaveBeenCalled();
    expect(page.elements['form-error'].textContent).toBe('Enter the email address first.');

    page.elements.email.value = 'a@b.c';
    await page.elements['send-code-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaSendCode).toHaveBeenCalledWith({ channel: 'email', target: 'a@b.c' });
    expect(page.elements['code-status'].textContent).toContain('Code sent to a@b.c');
    expect(page.elements['otp-step-send'].classList.contains('done')).toBe(true);
    expect(page.elements['otp-send-note'].textContent).toBe('Sent to a@b.c');
    expect(current(page.elements['otp-step-enter'])).toBe(true);

    page.elements.code.value = '123456';
    await page.elements['verify-code-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaVerifyCode).toHaveBeenCalledWith({ target: 'a@b.c', code: '123456' });
    expect(page.elements['otp-step-enter'].classList.contains('done')).toBe(true);
    expect(current(page.elements['otp-step-sign'])).toBe(true);

    // Changing the address after verification asks for a new code.
    page.elements.email.value = 'x@b.c';
    await page.elements['create-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaCreateClaim).not.toHaveBeenCalled();
    expect(page.elements['form-error'].textContent).toContain('Send a new code');

    page.elements.email.value = 'a@b.c';
    await page.elements['create-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaCreateClaim).toHaveBeenCalledWith({
      type: 'email',
      fields: { email: 'a@b.c', verification_token: 'vt' },
    });
  });

  test('a service error lands in the form as text', async () => {
    const page = await run(
      api({
        aquaCreateClaim: async () => ({
          success: false,
          error: { code: 'INVALID_INPUT', message: HOSTILE },
        }),
      })
    );
    await page.elements['add-claim-btn'].fire('click');
    page.elements['given-name'].value = 'A';
    page.elements['family-name'].value = 'B';
    await page.elements['create-btn'].fire('click');
    await page.flush();
    expect(page.elements['form-error'].textContent).toBe(HOSTILE);
    expect(shown(page.elements['form-error'])).toBe(true);
    expect(shown(page.elements.composer)).toBe(true);
  });

  test('Remove is reached from All details, asks in a dialog, and keeps the claim until confirmed', async () => {
    const freedomAPI = api({ aquaListClaims: async () => ({ success: true, claims: [claim()] }) });
    const page = await run(freedomAPI);
    const dialog = page.elements['remove-dialog'];
    await panel(page).querySelector('.link-btn').fire('click');
    expect(isOpen(page.elements['vouches-dialog'])).toBe(true);
    await page.elements['vouches-remove-btn'].fire('click');
    expect(isOpen(dialog)).toBe(true);
    expect(page.elements['remove-summary'].textContent).toContain(`${HOSTILE} Freedom`);
    expect(page.elements['remove-goes'].textContent).toContain('The name claim');
    await page.elements['remove-cancel'].fire('click');
    await page.flush();
    expect(isOpen(dialog)).toBe(false);
    expect(freedomAPI.aquaRemoveClaim).not.toHaveBeenCalled();

    await page.elements['vouches-remove-btn'].fire('click');
    await page.elements['remove-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaRemoveClaim).toHaveBeenCalledWith('c1');
    expect(isOpen(dialog)).toBe(false);
    expect(isOpen(page.elements['vouches-dialog'])).toBe(false);
    expect(page.document.htmlWrites).toHaveLength(0);
  });

  test('a domain claim shows its DNS record in the panel, as text, and Check DNS runs from it', async () => {
    const checked = claim({
      type: 'domain',
      payload: { domain_name: 'example.com' },
      domainVerification: 'mismatch',
      dnsCheck: { status: 'mismatch', message: HOSTILE, checkedAt: '2026-10-26T10:00:00Z' },
    });
    let claims = [
      claim({
        type: 'domain',
        payload: { domain_name: 'example.com' },
        domainVerification: 'pending',
      }),
    ];
    const freedomAPI = api({
      aquaListClaims: async () => ({ success: true, claims }),
      aquaVerifyDns: jest.fn(async () => {
        claims = [checked];
        return { success: true, claim: checked };
      }),
    });
    const page = await run(freedomAPI);
    const row = page.elements['claims-list'].querySelector('.card');
    expect(row.querySelector('.mark').textContent).toBe('Pending');
    expect(row.querySelector('.mark').classList.contains('tone-warn')).toBe(true);
    // The record is fetched for the panel as soon as the claim is shown.
    expect(freedomAPI.aquaDnsInstructions).toHaveBeenCalledWith('c1');
    expect(panel(page).textContent).toContain('The record is not visible yet');
    expect(panel(page).querySelector('.dns-box').textContent).toContain('_aqua.example.com');
    expect(panel(page).querySelector('.dns-box').textContent).toContain(HOSTILE);
    const rows = panel(page)
      .querySelectorAll('.dns-row')
      .map((r) => r.querySelector('.label').textContent);
    expect(rows).toEqual(['Type', 'Name', 'Value']);
    await buttonNamed(panel(page), 'Check DNS').fire('click');
    await page.flush();
    expect(freedomAPI.aquaVerifyDns).toHaveBeenCalledWith('c1');
    // The panel says what the node found, as text, and the mark turns red.
    const result = panel(page).querySelector('.dns-result');
    expect(result.querySelector('.status-line').textContent).toBe(HOSTILE);
    expect(result.querySelector('.status-line').classList.contains('bad')).toBe(true);
    expect(panel(page).textContent).toContain('could not confirm the record');
    const row2 = page.elements['claims-list'].querySelector('.card');
    expect(row2.querySelector('.mark').textContent).toBe('Failed');
    expect(buttonNamed(panel(page), 'Check again').disabled).toBe(false);
    await buttonNamed(panel(page), 'Check again').fire('click');
    await page.flush();
    expect(freedomAPI.aquaVerifyDns).toHaveBeenCalledTimes(2);
    expect(panel(page).querySelector('.dns-result').textContent).toContain(HOSTILE);
    expect(page.document.htmlWrites).toHaveLength(0);
  });
});

describe('freedom://identity node change', () => {
  test('a claim made on another node says so and offers neither ask, pull nor DNS check', async () => {
    const page = await run(
      api({
        aquaListClaims: async () => ({
          success: true,
          claims: [
            claim({ id: 'far', nodeUrl: 'https://aquafire.inblock.io' }),
            claim({ id: 'near', nodeUrl: 'https://aqua.test/' }),
            claim({ id: 'old' }),
          ],
        }),
      })
    );
    const rows = page.elements['claims-list'].querySelectorAll('.card');
    const far = rows.find((c) => c.dataset.id === 'far');
    await far.fire('click');
    expect(panel(page).textContent).toContain('Made on aquafire.inblock.io');
    // A name has no check anywhere, so its shield stays quiet even elsewhere.
    expect(far.querySelector('.mark').classList.contains('tone-quiet')).toBe(true);
    expect(buttonNamed(panel(page), 'Ask someone to vouch').disabled).toBe(true);
    expect(buttonNamed(panel(page), 'Check for new vouches').disabled).toBe(true);
    expect(buttonNamed(panel(page), 'Import a vouch').disabled).toBeFalsy();
    for (const id of ['near', 'old']) {
      await rows.find((c) => c.dataset.id === id).fire('click');
      expect(panel(page).textContent).not.toContain('Made on');
      expect(buttonNamed(panel(page), 'Ask someone to vouch').disabled).toBeFalsy();
    }
  });
});

describe('freedom://identity attestation', () => {
  test('a pending peer attestation says Freedom fetches it once shared back, with its source', async () => {
    const pending = claim({
      attestations: [
        {
          tip: '0x1',
          attesterDid: 'did:pkh:eip155:1:0xpeer',
          context: HOSTILE,
          source: 'peer',
          pending: true,
          verification: { isValid: false, status: 'held' },
        },
      ],
    });
    const page = await run(
      api({ aquaListClaims: async () => ({ success: true, claims: [pending] }) })
    );
    const box = panel(page).querySelector('.attestation');
    expect(box.querySelector('.source').textContent).toBe('Person');
    expect(box.querySelector('.source').querySelector('.ico-user')).not.toBeNull();
    expect(box.classList.contains('pending')).toBe(true);
    expect(box.querySelector('.badge').textContent).toBe('On its way');
    expect(box.textContent).toContain('once they share it back');
    expect(page.elements['claims-list'].querySelector('.badge').textContent).toBe(
      'Not yet verified'
    );
  });

  test('asking sends the attester address from the panel view and pulling refreshes', async () => {
    const freedomAPI = api({ aquaListClaims: async () => ({ success: true, claims: [claim()] }) });
    const page = await run(freedomAPI);
    await buttonNamed(panel(page), 'Ask someone to vouch').fire('click');
    expect(shown(page.elements['ask-view'])).toBe(true);
    expect(shown(page.elements['claim-detail'])).toBe(false);
    expect(page.elements['ask-title'].textContent).toBe('Ask someone to vouch for your name');
    expect(page.elements['share-summary'].textContent).toContain(`${HOSTILE} Freedom`);
    await page.elements['share-btn'].fire('click');
    expect(freedomAPI.aquaShareClaim).not.toHaveBeenCalled();
    expect(shown(page.elements['share-error'])).toBe(true);
    page.elements['share-address'].value = ' 0xC412d3047AffD97dC51C5C52E2588Ae4238CbF88 ';
    await page.elements['share-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaShareClaim).toHaveBeenCalledWith(
      'c1',
      '0xC412d3047AffD97dC51C5C52E2588Ae4238CbF88'
    );
    expect(shown(page.elements['ask-view'])).toBe(false);
    expect(shown(page.elements['claim-detail'])).toBe(true);
    expect(page.elements['status-notice'].textContent).toContain('Shared');
    await buttonNamed(panel(page), 'Check for new vouches').fire('click');
    expect(freedomAPI.aquaPullAttestations).toHaveBeenCalledWith('c1');
    // Back leaves the view without sending.
    await buttonNamed(panel(page), 'Ask someone to vouch').fire('click');
    await page.elements['share-cancel'].fire('click');
    expect(shown(page.elements['ask-view'])).toBe(false);
  });

  test('importing pastes the tree text through to main and reports a refusal as text in the view', async () => {
    const freedomAPI = api({
      aquaListClaims: async () => ({ success: true, claims: [claim()] }),
      aquaImportAttestation: jest.fn(async () => ({
        success: false,
        error: { code: 'INVALID_INPUT', message: HOSTILE },
      })),
    });
    const page = await run(freedomAPI);
    await buttonNamed(panel(page), 'Import a vouch').fire('click');
    expect(shown(page.elements['import-view'])).toBe(true);
    await page.elements['import-btn'].fire('click');
    expect(freedomAPI.aquaImportAttestation).not.toHaveBeenCalled();
    expect(page.elements['import-error'].textContent).toContain('Paste or choose');
    page.elements['import-text'].value = '{"revisions":{}}';
    await page.elements['import-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaImportAttestation).toHaveBeenCalledWith('c1', '{"revisions":{}}');
    expect(page.elements['import-error'].textContent).toBe(HOSTILE);
    expect(shown(page.elements['import-view'])).toBe(true);
  });

  test("a shared claim is vouched for with the user's words through the wallet", async () => {
    const freedomAPI = api({
      aquaListShared: async () => ({
        success: true,
        shared: [
          {
            contractHash: 'h1',
            tip: '0xt',
            sender: 'did:pkh:eip155:1:0xowner',
            templateName: 'name_claim',
            payload: {
              signer_did: 'did:pkh:eip155:1:0xowner',
              given_name: HOSTILE,
              family_name: 'Probe',
            },
            sharedAt: '2026-10-25T09:30:00Z',
          },
        ],
      }),
    });
    const page = await run(freedomAPI);
    expect(page.elements['shared-count'].textContent).toBe('1');
    expect(page.elements['shared-line'].textContent).toBe('1 waiting · newest first');
    const row = page.elements['shared-claims'].querySelector('.card');
    expect(row.querySelector('.row-value').textContent).toBe(`${HOSTILE} Probe`);
    expect(row.querySelector('.claim-icon').querySelector('.ico-user')).not.toBeNull();
    expect(row.querySelector('.badge').textContent).toBe('Waiting for you');
    const labels = Array.from(
      page.elements['shared-tech'].querySelector('.tech-rows').querySelectorAll('.label')
    ).map((n) => n.textContent);
    expect(labels).toEqual(['Subject', 'Shared by', 'Shared on', 'Revision']);
    expect(page.elements['shared-tech'].querySelector('.tech-rows').textContent).toContain(
      new Date('2026-10-25T09:30:00Z').toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    );
    // The vouch form is right there, no dialog.
    expect(shown(page.elements['attest-view'])).toBe(true);
    await page.elements['attest-btn'].fire('click');
    expect(freedomAPI.aquaAttestShared).not.toHaveBeenCalled();
    expect(page.elements['attest-error'].textContent).toContain('your own words');
    page.elements['attest-words'].value = 'I know this person';
    await page.elements['attest-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaAttestShared).toHaveBeenCalledWith({
      contractHash: 'h1',
      tip: '0xt',
      context: 'I know this person',
    });
    expect(freedomAPI.aquaListIssued).toHaveBeenCalledTimes(2);
    expect(page.elements['status-notice'].textContent).toContain('Done');
  });

  test('a share this wallet already vouched for says so and does not offer the form again', async () => {
    const shared = [
      {
        contractHash: 'h1',
        tip: '0xt',
        sender: 'did:pkh:eip155:1:0xowner',
        templateName: 'name_claim',
        payload: {
          signer_did: 'did:pkh:eip155:1:0xowner',
          given_name: 'Ada',
          family_name: 'Probe',
        },
      },
    ];
    const issued = [];
    const freedomAPI = api({
      aquaListShared: async () => ({ success: true, shared }),
      aquaListIssued: async () => ({ success: true, issued }),
      aquaAttestShared: jest.fn(async () => {
        issued.push({
          id: 'a1',
          tip: '0xa',
          claimTip: '0xt',
          subjectDid: 'did:pkh:eip155:1:0xowner',
          context: HOSTILE,
          createdAt: '2026-10-26T10:00:00Z',
          verification: { isValid: true },
        });
        return { success: true };
      }),
    });
    const page = await run(freedomAPI);
    let row = page.elements['shared-claims'].querySelector('.card');
    expect(row.querySelector('.badge').textContent).toBe('Waiting for you');
    expect(shown(page.elements['attest-view'])).toBe(true);
    page.elements['attest-words'].value = 'I know this person';
    await page.elements['attest-btn'].fire('click');
    await page.flush();
    row = page.elements['shared-claims'].querySelector('.card');
    expect(row.querySelector('.badge').textContent).toBe('Vouched by you');
    expect(shown(page.elements['attest-view'])).toBe(false);
    const detail = page.elements['shared-detail'];
    expect(detail.querySelector('.status-line').textContent).toContain('You vouched for this');
    // What you signed: words, state, hash, Copy as file.
    const block = detail.querySelector('.attestation');
    expect(block.querySelector('.words').textContent).toBe(HOSTILE);
    expect(block.querySelector('.badge').textContent).toBe('Signed');
    expect(block.textContent).toContain('0xa');
    expect(Array.from(detail.querySelectorAll('.btn')).map((b) => b.textContent)).toEqual([
      'Copy as file',
    ]);
    expect(page.elements['shared-count'].textContent).toBe('0'); // nothing waiting for you
    expect(page.document.htmlWrites).toHaveLength(0);
  });

  test('a share the service lists but cannot show is said with its reason, not dropped', async () => {
    const freedomAPI = api({
      aquaListShared: async () => ({
        success: true,
        shared: [
          {
            contractHash: 'freedom-attest-1',
            sender: 'did:pkh:eip155:1:0xowner',
            fileName: 'email_claim',
            tip: null,
            payload: null,
            unavailable: true,
            reason: HOSTILE,
          },
        ],
      }),
    });
    const page = await run(freedomAPI);
    expect(page.elements['shared-count'].textContent).toBe('0'); // nothing waiting for you
    const row = page.elements['shared-claims'].querySelector('.card');
    expect(row.querySelector('.row-value').textContent).toBe('email_claim');
    expect(row.querySelector('.badge').textContent).toBe('Could not be read');
    const detail = page.elements['shared-detail'];
    expect(detail.querySelector('.status-line').textContent).toBe(HOSTILE);
    expect(detail.querySelectorAll('.btn')).toHaveLength(0);
    expect(shown(page.elements['attest-view'])).toBe(false);
    expect(
      Array.from(
        page.elements['shared-tech'].querySelector('.tech-rows').querySelectorAll('.label')
      ).map((n) => n.textContent)
    ).toEqual(['Shared by', 'Share']);
    expect(page.document.htmlWrites).toHaveLength(0);
  });

  test('an attestation issued for a claim no longer shared is its own row in the same list, and copies as a file', async () => {
    const freedomAPI = api({
      aquaListIssued: async () => ({
        success: true,
        issued: [
          {
            id: 'a1',
            tip: '0xa',
            claimTip: '0xt',
            subjectDid: 'did:pkh:eip155:1:0xowner',
            context: HOSTILE,
            createdAt: '2026-10-22T12:00:00Z',
            verification: { isValid: true },
            templateName: 'email_claim',
            subjectPayload: { email: 's@p.q' },
          },
        ],
      }),
    });
    const page = await run(freedomAPI);
    expect(page.elements['shared-count'].textContent).toBe('0'); // nothing waiting for you
    const row = page.elements['shared-claims'].querySelector('.card');
    expect(row.querySelector('.row-value').textContent).toBe('s@p.q');
    expect(row.querySelector('.claim-icon').querySelector('.ico-mail')).not.toBeNull();
    expect(row.querySelector('.badge').textContent).toBe('Vouched by you');
    const detail = page.elements['shared-detail'];
    expect(detail.textContent).toContain(HOSTILE);
    expect(detail.textContent).toContain('no longer shared with you');
    await buttonNamed(detail, 'Copy as file').fire('click');
    await page.flush();
    expect(freedomAPI.aquaExportIssued).toHaveBeenCalledWith('a1');
    expect(freedomAPI.copyText).toHaveBeenCalledWith('{"revisions":{}}');
  });

  test('an empty Vouches I give list shows an icon and one line', async () => {
    const page = await run(api());
    expect(page.elements['shared-claims'].children).toHaveLength(0);
    expect(page.elements['shared-detail'].querySelector('.empty').textContent).toContain(
      'Nobody has asked you to vouch'
    );
    expect(
      page.elements['shared-detail'].querySelector('.empty').querySelector('.ico')
    ).not.toBeNull();
  });

  test('the same claim shared twice is one row, with its latest share, and every attestation issued for it', async () => {
    const freedomAPI = api({
      aquaListShared: async () => ({
        success: true,
        shared: [
          {
            contractHash: 'h1',
            tip: '0xt',
            sender: 'did:pkh:eip155:1:0xowner',
            templateName: 'phone_claim',
            payload: { signer_did: 'did:pkh:eip155:1:0xowner', phone_number: '+10000000000' },
            sharedAt: '2026-10-23T13:03:00Z',
          },
          {
            contractHash: 'h2',
            tip: '0xt',
            sender: 'did:pkh:eip155:1:0xowner',
            templateName: 'phone_claim',
            payload: { signer_did: 'did:pkh:eip155:1:0xowner', phone_number: '+10000000000' },
            sharedAt: '2026-10-26T14:21:00Z',
          },
        ],
      }),
      aquaListIssued: async () => ({
        success: true,
        issued: [
          {
            id: 'a1',
            tip: '0xa1',
            claimTip: '0xt',
            subjectDid: 'did:pkh:eip155:1:0xowner',
            context: 'first',
            createdAt: '2026-10-26T14:25:00Z',
            verification: { isValid: true },
          },
          {
            id: 'a2',
            tip: '0xa2',
            claimTip: '0xt',
            subjectDid: 'did:pkh:eip155:1:0xowner',
            context: 'second',
            createdAt: '2026-10-26T14:26:00Z',
            verification: { isValid: false },
          },
        ],
      }),
    });
    const page = await run(freedomAPI);
    const rows = page.elements['shared-claims'].querySelectorAll('.card');
    expect(rows).toHaveLength(1);
    expect(rows[0].dataset.contract).toBe('h2');
    expect(page.elements['shared-count'].textContent).toBe('0'); // nothing waiting for you
    const detail = page.elements['shared-detail'];
    expect(page.elements['shared-tech'].querySelector('.tech-rows').textContent).toContain(
      new Date('2026-10-26T14:21:00Z').toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    );
    const blocks = detail.querySelectorAll('.attestation');
    expect(blocks.map((b) => b.querySelector('.words').textContent)).toEqual(['first', 'second']);
    expect(blocks.map((b) => b.querySelector('.badge').textContent)).toEqual([
      'Signed',
      'Does not verify',
    ]);
    expect(detail.querySelectorAll('.btn').map((b) => b.textContent)).toEqual([
      'Copy as file',
      'Copy as file',
    ]);
  });

  test('a node without out-of-band verification withholds email and phone claims', async () => {
    const page = await run(
      api({
        aquaStatus: async () => ({
          success: true,
          nodeUrl: 'u',
          wallet: { address: '0xabc' },
          vaultUnlocked: true,
          hasVault: true,
          signedIn: true,
          service: { reachable: true, serviceDid: null, outOfBandVerification: false },
        }),
      })
    );
    expect(page.elements['wallet-line'].textContent).toContain('no email or phone verification');
    expect(page.elements['status-caps'].textContent).toBe('Signed in · checks domain only');
    expect(page.elements['kind-email'].disabled).toBe(true);
    expect(page.elements['kind-phone'].disabled).toBe(true);
    expect(page.elements['kind-domain'].disabled).toBeFalsy();
    expect(shown(page.elements['kinds-note'])).toBe(true);
    // The slots say so too, and do not open the composer.
    const slots = page.elements['claims-slots'].querySelectorAll('.slot');
    expect(slots.find((s) => s.dataset.kind === 'email').disabled).toBe(true);
    expect(slots.find((s) => s.dataset.kind === 'email').textContent).toContain(
      'does not send codes'
    );
    await page.elements['add-claim-btn'].fire('click');
    await page.elements['kind-email'].fire('click');
    expect(page.elements['kind-email'].getAttribute('aria-pressed')).toBe('false');
    expect(shown(page.elements['fields-name'])).toBe(true);
    expect(page.elements['shared-detail'].textContent).toContain('Nobody has asked you to vouch');
  });
});

describe('freedom://identity trust list', () => {
  const ALICE = 'did:pkh:eip155:1:0xA11cA11cA11cA11cA11cA11cA11cA11cA11cA11c';
  const MALLORY = 'did:pkh:eip155:1:0x3a1103a1103a1103a1103a1103a1103a1103a110';
  const SERVICE = 'did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp';
  const vouch = (tip, attesterDid, trust, extra = {}) => ({
    tip,
    attesterDid,
    source: 'peer',
    context: 'I know them',
    issuedAt: '2026-11-01T10:00:00Z',
    trust,
    verification: { isValid: true },
    ...extra,
  });
  const badgeOf = (page, id) =>
    page.elements['claims-list']
      .querySelectorAll('.card')
      .find((c) => c.dataset.id === id)
      .querySelector('.badge').textContent;

  test('the four badges: trusted signer, untrusted or rejected vouchers, own signature only, broken chain', async () => {
    const claims = [
      claim({ id: 'trusted', attestations: [vouch('0x1', ALICE, 'trusted')] }),
      claim({
        id: 'vouched',
        tip: '0x2',
        attestations: [vouch('0x2', MALLORY, 'unknown'), vouch('0x3', ALICE, 'rejected')],
      }),
      claim({ id: 'own', tip: '0x3' }),
      claim({
        id: 'broken',
        tip: '0x4',
        verification: { isValid: false, status: 'FAILED' },
        attestations: [vouch('0x4', ALICE, 'trusted')],
      }),
    ];
    const page = await run(api({ aquaListClaims: async () => ({ success: true, claims }) }));
    expect(badgeOf(page, 'trusted')).toBe('Verified');
    expect(badgeOf(page, 'vouched')).toBe('Vouched by 2');
    expect(badgeOf(page, 'own')).toBe('Not yet verified');
    expect(badgeOf(page, 'broken')).toBe('Does not verify');
  });

  test('a vouch without a trust state from main is treated as not trusted', async () => {
    const stranger = claim({
      attestations: [{ tip: '0x1', attesterDid: MALLORY, verification: { isValid: true } }],
    });
    const page = await run(
      api({ aquaListClaims: async () => ({ success: true, claims: [stranger] }) })
    );
    expect(badgeOf(page, 'c1')).toBe('Vouched by 1');
  });

  test("the identity service's attestation reads Verified and the line names the node", async () => {
    const email = claim({
      type: 'email',
      payload: { email: 'a@b.c' },
      attestations: [vouch('0x1', SERVICE, 'trusted', { source: 'service' })],
    });
    const page = await run(
      api({ aquaListClaims: async () => ({ success: true, claims: [email] }) })
    );
    expect(badgeOf(page, 'c1')).toBe('Verified');
    expect(panel(page).querySelector('.trust-line').textContent).toBe(
      'Verified: aqua.test checked it.'
    );
  });

  test('accepting a voucher turns the card Verified and rejecting turns it back, without asking the node', async () => {
    const trust = {};
    const listed = () => [
      claim({ attestations: [vouch('0x1', MALLORY, trust[MALLORY] || 'unknown')] }),
    ];
    const fx = api({
      aquaListClaims: jest.fn(async () => ({ success: true, claims: listed() })),
      aquaPullAttestations: jest.fn(async () => ({ success: true, claim: listed()[0] })),
      aquaSetTrust: jest.fn(async (did, state) => {
        trust[did] = state;
        return { success: true, entry: { did, state } };
      }),
    });
    const page = await run(fx);
    expect(badgeOf(page, 'c1')).toBe('Vouched by 1');
    const line = panel(page).querySelector('.trust-line');
    expect(line.textContent).toContain(
      'Vouched by 0x3a11…a110, not trusted by you. Accept them to count it.'
    );
    const pulls = fx.aquaPullAttestations.mock.calls.length;

    // The line opens the dialog: who, when, their words, and the choice.
    await line.querySelector('.link-btn').fire('click');
    const dialog = page.elements['vouches-dialog'];
    expect(isOpen(dialog)).toBe(true);
    let first = page.elements['vouches-list'].querySelectorAll('.vouch')[0];
    expect(first.querySelector('.badge').textContent).toBe('Not trusted by you');
    expect(first.querySelector('.words').textContent).toBe('I know them');
    expect(first.querySelector('.trust-text').textContent).toContain('not on your trust list');

    await buttonNamed(first, 'Accept').fire('click');
    expect(fx.aquaSetTrust).toHaveBeenLastCalledWith(MALLORY, 'trusted');
    expect(badgeOf(page, 'c1')).toBe('Verified');
    expect(panel(page).querySelector('.trust-line').textContent).toBe(
      'Verified: 0x3a11…a110 vouches for it, and you trust them.'
    );
    // The dialog stays open on the same claim, now offering the way back.
    expect(isOpen(dialog)).toBe(true);
    first = page.elements['vouches-list'].querySelectorAll('.vouch')[0];
    expect(first.querySelector('.badge').textContent).toBe('Trusted by you');
    expect(buttonNamed(first, 'Accept')).toBeUndefined();

    await buttonNamed(first, 'Reject').fire('click');
    expect(fx.aquaSetTrust).toHaveBeenLastCalledWith(MALLORY, 'rejected');
    expect(badgeOf(page, 'c1')).toBe('Vouched by 1');
    expect(panel(page).querySelector('.trust-line').textContent).toContain(
      'Vouched by 0x3a11…a110, rejected by you.'
    );
    first = page.elements['vouches-list'].querySelectorAll('.vouch')[0];
    expect(first.querySelector('.badge').textContent).toBe('Rejected by you');
    // The vouch stays visible, with its words, and can be accepted again.
    expect(first.querySelector('.words').textContent).toBe('I know them');
    await buttonNamed(first, 'Accept again').fire('click');
    expect(badgeOf(page, 'c1')).toBe('Verified');

    // Neither transition needed the node: no pull, no refresh, no new vouch.
    expect(fx.aquaPullAttestations.mock.calls.length).toBe(pulls);
    expect(fx.aquaRefreshClaim).not.toHaveBeenCalled();
    expect(fx.aquaImportAttestation).not.toHaveBeenCalled();
    expect(page.document.htmlWrites).toHaveLength(0);
  });

  test('a refused trust change is said as text and the badge stays', async () => {
    const fx = api({
      aquaListClaims: async () => ({
        success: true,
        claims: [claim({ attestations: [vouch('0x1', MALLORY, 'unknown')] })],
      }),
      aquaSetTrust: jest.fn(async () => ({ success: false, error: { message: HOSTILE } })),
    });
    const page = await run(fx);
    await panel(page).querySelector('.trust-line').querySelector('.link-btn').fire('click');
    const first = page.elements['vouches-list'].querySelectorAll('.vouch')[0];
    await buttonNamed(first, 'Accept').fire('click');
    expect(page.elements['status-notice'].textContent).toContain(HOSTILE);
    expect(badgeOf(page, 'c1')).toBe('Vouched by 1');
    expect(page.document.htmlWrites).toHaveLength(0);
  });

  test('a vouch that does not verify or is still on its way offers no trust choice', async () => {
    const mixed = claim({
      attestations: [
        vouch('0x1', MALLORY, 'unknown', { verification: { isValid: false, status: 'FAILED' } }),
        vouch('0x2', ALICE, 'unknown', { pending: true, verification: { isValid: false } }),
      ],
    });
    const page = await run(
      api({ aquaListClaims: async () => ({ success: true, claims: [mixed] }) })
    );
    expect(badgeOf(page, 'c1')).toBe('Not yet verified');
    expect(panel(page).querySelector('.trust-line')).toBeNull();
    await panel(page).querySelector('.link-btn').fire('click');
    expect(page.elements['vouches-list'].querySelectorAll('.trust-row')).toHaveLength(0);
  });
});

describe('freedom://identity disclosure', () => {
  test('a pasted request goes to main and the response comes back as text to copy', async () => {
    const freedomAPI = api({
      aquaRespondToRequest: jest.fn(async () => ({
        success: true,
        response: { aqua: 1, claims: [{ type: 'name' }], missing: [] },
      })),
    });
    const page = await run(freedomAPI);
    expect(shown(page.elements['response-box'])).toBe(false);
    await page.elements['request-btn'].fire('click');
    expect(freedomAPI.aquaRespondToRequest).not.toHaveBeenCalled();
    expect(page.elements['request-status'].textContent).toContain('Paste the request first');
    page.elements['request-input'].value = ' {"aqua":1,"need":["name"]} ';
    await page.elements['request-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaRespondToRequest).toHaveBeenCalledWith('{"aqua":1,"need":["name"]}');
    // The answer sits beside the request, and the aside makes room for it.
    expect(shown(page.elements['response-box'])).toBe(true);
    expect(shown(page.elements['request-aside'])).toBe(false);
    expect(JSON.parse(page.elements['response-output'].value).claims).toHaveLength(1);
    expect(page.elements['request-status'].textContent).toContain('1 claim released');
    await page.elements['response-copy'].fire('click');
    expect(freedomAPI.copyText).toHaveBeenCalledWith(page.elements['response-output'].value);
    await page.elements['request-cancel'].fire('click');
    expect(page.elements['request-input'].value).toBe('');
    expect(shown(page.elements['response-box'])).toBe(false);
    expect(shown(page.elements['request-aside'])).toBe(true);
  });

  test('a refused request is reported as text', async () => {
    const freedomAPI = api({
      aquaRespondToRequest: jest.fn(async () => ({
        success: false,
        error: { code: 'INVALID_REQUEST', message: HOSTILE },
      })),
    });
    const page = await run(freedomAPI);
    page.elements['request-input'].value = '{}';
    await page.elements['request-btn'].fire('click');
    await page.flush();
    expect(page.elements['request-status'].textContent).toBe(HOSTILE);
    expect(shown(page.elements['response-box'])).toBe(false);
    expect(page.document.htmlWrites).toHaveLength(0);
  });
});

describe('freedom://identity tabs', () => {
  test('opens on Me, switches panels on click, and follows the hash', async () => {
    const page = await run(api());
    expect(page.elements['panel-claims'].classList.contains('active')).toBe(true);
    expect(page.elements['panel-attest'].classList.contains('active')).toBe(false);
    await page.elements['nav-attest'].fire('click');
    expect(page.elements['nav-attest'].classList.contains('active')).toBe(true);
    expect(page.elements['panel-attest'].classList.contains('active')).toBe(true);
    expect(page.elements['panel-claims'].classList.contains('active')).toBe(false);
    const deep = await run(api(), { location: { href: 'x', search: '', hash: '#requests' } });
    expect(deep.elements['panel-requests'].classList.contains('active')).toBe(true);
    const old = await run(api(), { location: { href: 'x', search: '', hash: '#issued' } });
    expect(old.elements['panel-attest'].classList.contains('active')).toBe(true);
    expect(old.elements['nav-attest'].classList.contains('active')).toBe(true);
  });

  test('opening the page pulls new attestations for every claim, and a failed pull keeps the claim as listed', async () => {
    const peer = {
      tip: '0xa1',
      attesterDid: 'did:pkh:eip155:1:0xpeer',
      context: HOSTILE,
      source: 'peer',
      issuedAt: '2026-10-26T10:00:00Z',
      verification: { isValid: true, status: 'OK' },
    };
    const freedomAPI = api({
      aquaListClaims: async () => ({
        success: true,
        claims: [claim(), claim({ id: 'c2', tip: '0x2' })],
      }),
      aquaPullAttestations: jest.fn(async (id) =>
        id === 'c1'
          ? { success: true, claim: claim({ attestations: [peer] }) }
          : { success: false, error: 'service down' }
      ),
    });
    const page = await run(freedomAPI);
    expect(freedomAPI.aquaPullAttestations.mock.calls.map((c) => c[0]).sort()).toEqual([
      'c1',
      'c2',
    ]);
    const rows = page.elements['claims-list'].querySelectorAll('.card');
    expect(rows).toHaveLength(2);
    const first = rows.find((c) => c.dataset.id === 'c1');
    expect(first.querySelector('.badge').textContent).toBe('Vouched by 1');
    expect(first.textContent).toContain(HOSTILE);
    expect(rows.find((c) => c.dataset.id === 'c2').querySelector('.badge').textContent).toBe(
      'Not yet verified'
    );
    expect(shown(page.elements['status-notice'])).toBe(false);
    expect(page.document.htmlWrites).toHaveLength(0);
  });
});
