/**
 * freedom://identity renders service and user strings as text, drives the
 * one-time-code flow in order, never labels a self-signed claim as verified,
 * and opens every multi-field action as a modal dialog.
 */
const { runPageScript } = require('../../../test/helpers/page-script-harness');

const HOSTILE = `"><img src=x onerror=alert(1) data-xss="1">'<b>&amp;`;
const IDS = {
  'claims-list': 'div', 'claims-empty': 'div', 'shared-claims': 'div', 'issued-list': 'div',
  'status-wallet': 'span', 'status-service': 'span', 'status-caps': 'span', 'claims-count': 'span', 'shared-count': 'span', 'issued-count': 'span',
  'status-lock': 'span', 'signin-card': 'div', 'signin-text': 'div', 'signin-btn': 'button', 'signin-error': 'div', 'service-down': 'div', 'service-down-text': 'div', 'service-retry-btn': 'button', 'service-settings-btn': 'button', 'locked-card': 'div', 'locked-title': 'div', 'locked-text': 'div', 'unlock-btn': 'button', 'status-notice': 'div', 'wallet-line': 'p',
  'nav-claims': 'button', 'nav-attest': 'button', 'nav-issued': 'button', 'nav-requests': 'button', 'panel-claims': 'section', 'panel-attest': 'section', 'panel-issued': 'section', 'panel-requests': 'section',
  // Add a claim
  'add-claim-btn': 'button', 'add-claim-dialog': 'dialog', 'add-claim-close': 'button', 'claim-form': 'form', 'claim-kind': 'div',
  'kind-name': 'button', 'kind-email': 'button', 'kind-phone': 'button', 'kind-domain': 'button',
  'fields-name': 'div', 'fields-email': 'div', 'fields-phone': 'div', 'fields-domain': 'div',
  'given-name': 'input', 'family-name': 'input', 'middle-name': 'input', nickname: 'input', email: 'input',
  'phone-number': 'input', domain: 'input', code: 'input', 'code-section': 'div', 'send-code-btn': 'button',
  'verify-code-btn': 'button', 'code-status': 'span', 'form-error': 'div', 'create-btn': 'button', 'cancel-btn': 'button',
  // Per-claim modals
  'share-dialog': 'dialog', 'share-summary': 'div', 'share-address': 'input', 'share-btn': 'button', 'share-error': 'div', 'share-cancel': 'button', 'share-close': 'button',
  'import-dialog': 'dialog', 'import-summary': 'div', 'import-text': 'textarea', 'import-file': 'input', 'import-btn': 'button', 'import-error': 'div', 'import-cancel': 'button', 'import-close': 'button',
  'attest-dialog': 'dialog', 'attest-summary': 'div', 'attest-words': 'input', 'attest-btn': 'button', 'attest-error': 'div', 'attest-cancel': 'button', 'attest-close': 'button',
  'dns-dialog': 'dialog', 'dns-summary': 'div', 'dns-body': 'div', 'dns-check-btn': 'button', 'dns-cancel': 'button', 'dns-close': 'button',
  'remove-dialog': 'dialog', 'remove-summary': 'div', 'remove-btn': 'button', 'remove-error': 'div', 'remove-cancel': 'button', 'remove-close': 'button',
  // Requests
  'request-open-btn': 'button', 'request-dialog': 'dialog', 'request-box': 'div', 'request-input': 'textarea', 'request-btn': 'button', 'request-status': 'span',
  'request-cancel': 'button', 'request-close': 'button', 'response-box': 'div', 'response-output': 'textarea', 'response-copy': 'button',
};

function claim(overrides = {}) {
  return {
    id: 'c1', type: 'name', signerDid: 'did:pkh:eip155:1:0xabc', tip: '0x1620' + '1'.repeat(64),
    payload: { given_name: HOSTILE, family_name: 'Freedom' }, createdAt: '2026-10-22T12:00:00Z', signedAt: '2026-10-22T12:00:00Z',
    verification: { isValid: true, status: 'OK', checkedAt: '2026-10-22T12:00:00Z' }, attestations: [], ...overrides,
  };
}

function api(overrides = {}) {
  return {
    aquaStatus: jest.fn(async () => ({ success: true, nodeUrl: 'https://aqua.test', wallet: { address: '0xabc', canSign: true }, vaultUnlocked: true, hasVault: true, signedIn: true })),
    aquaSignIn: jest.fn(async () => ({ success: true, signedIn: true, did: 'did:pkh:eip155:1:0xabc' })),
    aquaListClaims: jest.fn(async () => ({ success: true, claims: [] })),
    aquaCreateClaim: jest.fn(async () => ({ success: true, claim: claim() })),
    aquaRemoveClaim: jest.fn(async () => ({ success: true, removed: true })),
    aquaRefreshClaim: jest.fn(async () => ({ success: true, claim: claim() })),
    aquaSendCode: jest.fn(async ({ target }) => ({ success: true, target, message: 'sent' })),
    aquaVerifyCode: jest.fn(async () => ({ success: true, verificationToken: 'vt' })),
    aquaDnsInstructions: jest.fn(async () => ({ success: true, record_name: '_aqua.example.com', record_value: HOSTILE })),
    aquaVerifyDns: jest.fn(async () => ({ success: true, claim: claim({ type: 'domain' }) })),
    aquaShareClaim: jest.fn(async () => ({ success: true, claim: claim() })),
    aquaPullAttestations: jest.fn(async () => ({ success: true, claim: claim() })),
    aquaImportAttestation: jest.fn(async () => ({ success: true, claim: claim() })),
    aquaListShared: jest.fn(async () => ({ success: true, shared: [] })),
    aquaAttestShared: jest.fn(async () => ({ success: true, issued: { id: 'a1' } })),
    aquaListIssued: jest.fn(async () => ({ success: true, issued: [] })),
    aquaExportIssued: jest.fn(async () => ({ success: true, json: '{"revisions":{}}' })),
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
  // Add-a-claim dialog closes.
  page.elements['claim-form'].reset = () => {};
  return page;
};

// The fake elements have no showModal(), so the page falls back to the
// `open` property the browser would set itself.
const isOpen = (dialog) => dialog.open === true;
const buttonNamed = (root, text) => root.querySelectorAll('.btn').find((b) => b.textContent === text);

describe('freedom://identity', () => {
  test('shows the empty state and the wallet line', async () => {
    const page = await run(api());
    expect(page.elements['claims-empty'].classList.contains('hidden')).toBe(false);
    expect(page.elements['claims-list'].children).toHaveLength(0);
    expect(page.elements['claims-count'].textContent).toBe('0');
    expect(page.elements['wallet-line'].textContent).toContain('Wallet 0xabc');
    expect(page.elements['wallet-line'].textContent).toContain('https://aqua.test');
    expect(page.elements['status-wallet'].textContent).toBe('0xabc');
  });

  test('a locked vault is said once, on the card with the Unlock button, and the lists stay empty', async () => {
    const locked = { success: false, error: { code: 'VAULT_LOCKED', message: 'Unlock your vault' } };
    const lockedApi = api({
      aquaStatus: async () => ({ success: true, nodeUrl: 'u', wallet: { address: '0xabc' }, vaultUnlocked: false, hasVault: true }),
      aquaListClaims: async () => locked,
      aquaListIssued: async () => locked,
    });
    const page = await run(lockedApi);
    expect(page.elements['locked-card'].classList.contains('hidden')).toBe(false);
    expect(page.elements['locked-title'].textContent).toContain('locked');
    expect(page.elements['unlock-btn'].classList.contains('hidden')).toBe(false);
    // The address is public and still shown, marked as locked.
    expect(page.elements['status-wallet'].textContent).toBe('0xabc');
    expect(page.elements['status-lock'].classList.contains('hidden')).toBe(false);
    // Nowhere else repeats it.
    expect(page.elements['status-notice'].classList.contains('hidden')).toBe(true);
    expect(page.elements['claims-list'].children).toHaveLength(0);
    expect(page.elements['claims-empty'].classList.contains('hidden')).toBe(true);
    expect(page.elements['shared-claims'].children).toHaveLength(0);
    expect(page.elements['issued-list'].children).toHaveLength(0);
    expect(page.elements['add-claim-btn'].disabled).toBe(true);
    expect(page.elements['request-open-btn'].disabled).toBe(true);
    // The page polls for an unlock made elsewhere while the vault is locked.
    expect(page.timers.length).toBeGreaterThan(0);
    await page.elements['unlock-btn'].fire('click');
    expect(lockedApi.aquaUnlock).toHaveBeenCalled();
  });

  test('a missing vault is said on the same card, without an Unlock button', async () => {
    const locked = { success: false, error: { code: 'VAULT_LOCKED', message: 'Unlock your vault' } };
    const page = await run(api({
      aquaStatus: async () => ({ success: true, nodeUrl: 'u', wallet: null, vaultUnlocked: false, hasVault: false }),
      aquaListClaims: async () => locked,
    }));
    expect(page.elements['locked-card'].classList.contains('hidden')).toBe(false);
    expect(page.elements['locked-text'].textContent).toContain('Set up your wallet');
    expect(page.elements['unlock-btn'].classList.contains('hidden')).toBe(true);
    expect(page.elements['status-lock'].classList.contains('hidden')).toBe(true);
    expect(page.elements['claims-list'].children).toHaveLength(0);
    expect(page.elements['add-claim-btn'].disabled).toBe(true);
  });

  test('an open wallet with no service session shows the sign-in card and loads nothing until signed', async () => {
    let signedIn = false;
    const freedomAPI = api({
      aquaStatus: jest.fn(async () => ({ success: true, nodeUrl: 'https://aqua.test', wallet: { address: '0xabc', canSign: true }, vaultUnlocked: true, hasVault: true, signedIn })),
      aquaSignIn: jest.fn(async () => {
        signedIn = true;
        return { success: true, signedIn: true };
      }),
      aquaListClaims: jest.fn(async () => ({ success: true, claims: [claim()] })),
    });
    const page = await run(freedomAPI);
    expect(page.elements['signin-card'].classList.contains('hidden')).toBe(false);
    expect(page.elements['signin-text'].textContent).toContain('https://aqua.test');
    expect(page.elements['add-claim-btn'].disabled).toBe(true);
    // Nothing that needs a session was fetched, and no claims are shown.
    expect(freedomAPI.aquaListClaims).not.toHaveBeenCalled();
    expect(freedomAPI.aquaListShared).not.toHaveBeenCalled();
    expect(page.elements['claims-list'].children).toHaveLength(0);

    await page.elements['signin-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaSignIn).toHaveBeenCalledTimes(1);
    expect(page.elements['signin-card'].classList.contains('hidden')).toBe(true);
    expect(page.elements['claims-list'].children).toHaveLength(1);
    expect(page.elements['add-claim-btn'].disabled).toBe(false);
  });

  test('a refused sign-in keeps the card up with the reason, as text', async () => {
    const freedomAPI = api({
      aquaStatus: jest.fn(async () => ({ success: true, nodeUrl: 'u', wallet: { address: '0xabc' }, vaultUnlocked: true, hasVault: true, signedIn: false })),
      aquaSignIn: jest.fn(async () => ({ success: false, error: { code: 'ERROR', message: HOSTILE } })),
    });
    const page = await run(freedomAPI);
    await page.elements['signin-btn'].fire('click');
    await page.flush();
    expect(page.elements['signin-card'].classList.contains('hidden')).toBe(false);
    expect(page.elements['signin-error'].textContent).toBe(HOSTILE);
    expect(page.document.htmlWrites).toHaveLength(0);
  });

  test('unlocking from the page goes straight on to the sign-in signature, and only then to the claims', async () => {
    let unlocked = false;
    let signedIn = false;
    const calls = [];
    const freedomAPI = api({
      aquaStatus: jest.fn(async () => ({ success: true, nodeUrl: 'u', wallet: { address: '0xabc' }, vaultUnlocked: unlocked, hasVault: true, signedIn })),
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
    expect(page.elements['locked-card'].classList.contains('hidden')).toBe(false);
    await page.elements['unlock-btn'].fire('click');
    await page.flush();
    expect(calls).toEqual(['unlock', 'sign-in', 'claims']);
    expect(page.elements['signin-card'].classList.contains('hidden')).toBe(true);
    expect(page.elements['locked-card'].classList.contains('hidden')).toBe(true);
  });

  test('a service that does not answer is said once, with Try again and the way to Settings', async () => {
    const freedomAPI = api({
      aquaStatus: jest.fn(async () => ({ success: true, nodeUrl: 'https://down.test', wallet: { address: '0xabc' }, vaultUnlocked: true, hasVault: true, service: { reachable: false, serviceDid: null, outOfBandVerification: false } })),
    });
    const page = await run(freedomAPI);
    expect(page.elements['service-down'].classList.contains('hidden')).toBe(false);
    expect(page.elements['service-down-text'].textContent).toContain('https://down.test');
    expect(page.elements['status-caps'].textContent).toBe('unreachable');
    await page.elements['service-settings-btn'].fire('click');
    expect(freedomAPI.openInNewTab).toHaveBeenCalledWith('freedom://settings/identity');
    await page.elements['service-retry-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaStatus).toHaveBeenCalledTimes(2);

    const up = await run(api());
    expect(up.elements['service-down'].classList.contains('hidden')).toBe(true);
  });

  test('an unlocked wallet shows no lock anywhere and enables the actions', async () => {
    const page = await run(api());
    expect(page.elements['locked-card'].classList.contains('hidden')).toBe(true);
    expect(page.elements['status-lock'].classList.contains('hidden')).toBe(true);
    expect(page.elements['add-claim-btn'].disabled).toBe(false);
    expect(page.elements['request-open-btn'].disabled).toBe(false);
  });

  test('renders a claim with hostile payload as text and labels it Self-signed, never verified', async () => {
    const page = await run(api({ aquaListClaims: async () => ({ success: true, claims: [claim()] }) }));
    expect(page.elements['claims-empty'].classList.contains('hidden')).toBe(true);
    expect(page.elements['claims-count'].textContent).toBe('1');
    const card = page.elements['claims-list'].querySelector('.card');
    expect(card.querySelector('.claim-value').textContent).toBe(`${HOSTILE} Freedom`);
    expect(card.querySelector('.claim-icon').querySelector('.ico-user')).not.toBeNull();
    expect(card.querySelector('.badge').textContent).toBe('Self-signed');
    expect(card.querySelector('.badge').querySelector('.ico-pen')).not.toBeNull();
    expect(page.elements['claims-list'].textContent).not.toMatch(/verified by|Verified$/);
    expect(page.elements['claims-list'].textContent).toContain('Only you have signed this claim');
    expect(card.querySelector('.tech-rows').textContent).toContain('did:pkh:eip155:1:0xabc');
    // Nothing on the page went through an HTML sink (#432).
    expect(page.document.htmlWrites).toHaveLength(0);
  });

  test('each claim kind carries its own icon', async () => {
    const claims = [
      claim({ id: 'n', type: 'name' }),
      claim({ id: 'e', type: 'email', payload: { email: 'a@b.c' } }),
      claim({ id: 'p', type: 'phone', payload: { phone_number: '+1' } }),
      claim({ id: 'd', type: 'domain', payload: { domain_name: 'example.com' } }),
    ];
    const page = await run(api({ aquaListClaims: async () => ({ success: true, claims }) }));
    const icons = page.elements['claims-list'].querySelectorAll('.claim-icon').map((box) => box.querySelector('.ico').className);
    expect(icons).toEqual(['ico ico-user', 'ico ico-mail', 'ico ico-phone', 'ico ico-globe']);
  });

  test('an attested claim lists the attester and their words, as text, with the source icon', async () => {
    const attested = claim({ attestations: [{ tip: '0x1', attesterDid: 'did:pkh:eip155:1:0xserver', context: HOSTILE, source: 'service', verification: { isValid: true } }] });
    const page = await run(api({ aquaListClaims: async () => ({ success: true, claims: [attested] }) }));
    const card = page.elements['claims-list'].querySelector('.card');
    expect(card.querySelector('.badge').textContent).toBe('Attested');
    expect(card.querySelector('.badge').classList.contains('attested')).toBe(true);
    const box = card.querySelector('.attestation');
    // The attester is shortened to its address, with the whole DID on hover.
    expect(box.querySelector('.who').textContent).toBe('0xserver');
    expect(box.querySelector('.who').title).toBe('did:pkh:eip155:1:0xserver');
    expect(box.querySelector('.badge').textContent).toBe('Verified');
    expect(box.querySelector('.words').textContent).toBe(HOSTILE);
    // The words fold to two lines and open on click.
    await box.querySelector('.words').fire('click');
    expect(box.querySelector('.words').classList.contains('expanded')).toBe(true);
    expect(box.querySelector('.source').textContent).toBe('Service');
    expect(box.querySelector('.source').querySelector('.ico-server')).not.toBeNull();
    expect(page.document.htmlWrites).toHaveLength(0);
  });

  test('a failed attestation carries one Not verified chip and its reason, and does not count', async () => {
    const failed = claim({ attestations: [{ tip: '0x1', attesterDid: 'did:pkh:eip155:1:0x0ca27C8a817291673dce4020BAd3b5dc1DDE1109', context: 'words', source: 'service', verification: { isValid: false, status: 'FAILED' } }] });
    const page = await run(api({ aquaListClaims: async () => ({ success: true, claims: [failed] }) }));
    const card = page.elements['claims-list'].querySelector('.card');
    expect(card.querySelector('.badge').textContent).toBe('Self-signed');
    const box = card.querySelector('.attestation');
    expect(box.classList.contains('invalid')).toBe(true);
    expect(box.querySelector('.who').textContent).toBe('0x0ca2…1109');
    expect(box.querySelector('.badge').textContent).toBe('Not verified');
    expect(box.querySelector('.state').textContent).toBe('Not verified: FAILED');
  });

  test('two valid attestations are counted on the badge', async () => {
    const two = claim({ attestations: [
      { tip: '0x1', attesterDid: 'a', verification: { isValid: true } },
      { tip: '0x2', attesterDid: 'b', verification: { isValid: true } },
      { tip: '0x3', attesterDid: 'c', verification: { isValid: false, status: 'bad' } },
    ] });
    const page = await run(api({ aquaListClaims: async () => ({ success: true, claims: [two] }) }));
    expect(page.elements['claims-list'].querySelector('.badge').textContent).toBe('Attested ×2');
  });

  test('a failed verification is flagged on the badge', async () => {
    const page = await run(api({ aquaListClaims: async () => ({ success: true, claims: [claim({ verification: { isValid: false, status: 'Chain broken' } })] }) }));
    const badge = page.elements['claims-list'].querySelector('.badge');
    expect(badge.textContent).toBe('Verification failed');
    expect(badge.classList.contains('invalid')).toBe(true);
    expect(page.elements['claims-list'].textContent).toContain('Not verified: Chain broken');
  });

  test('Add a claim opens a dialog, and Cancel closes it', async () => {
    const page = await run(api());
    expect(isOpen(page.elements['add-claim-dialog'])).toBe(false);
    await page.elements['add-claim-btn'].fire('click');
    expect(isOpen(page.elements['add-claim-dialog'])).toBe(true);
    expect(page.elements['kind-name'].getAttribute('aria-pressed')).toBe('true');
    expect(page.elements['fields-name'].classList.contains('hidden')).toBe(false);
    await page.elements['cancel-btn'].fire('click');
    expect(isOpen(page.elements['add-claim-dialog'])).toBe(false);
  });

  test('creating a name claim sends the fields, closes the dialog and reloads', async () => {
    const freedomAPI = api();
    const page = await run(freedomAPI);
    await page.elements['add-claim-btn'].fire('click');
    page.elements['given-name'].value = 'Probe';
    page.elements['family-name'].value = 'Freedom';
    await page.elements['create-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaCreateClaim).toHaveBeenCalledWith({
      type: 'name', fields: { given_name: 'Probe', family_name: 'Freedom', middle_name: '', nickname: '' },
    });
    expect(freedomAPI.aquaListClaims).toHaveBeenCalledTimes(2);
    expect(isOpen(page.elements['add-claim-dialog'])).toBe(false);
  });

  test('an email claim needs the code verified first, for the same address', async () => {
    const freedomAPI = api();
    const page = await run(freedomAPI);
    await page.elements['add-claim-btn'].fire('click');
    await page.elements['kind-email'].fire('click');
    expect(page.elements['kind-email'].getAttribute('aria-pressed')).toBe('true');
    expect(page.elements['kind-name'].getAttribute('aria-pressed')).toBe('false');
    expect(page.elements['fields-email'].classList.contains('hidden')).toBe(false);
    expect(page.elements['fields-name'].classList.contains('hidden')).toBe(true);
    expect(page.elements['code-section'].classList.contains('hidden')).toBe(false);

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

    page.elements.code.value = '123456';
    await page.elements['verify-code-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaVerifyCode).toHaveBeenCalledWith({ target: 'a@b.c', code: '123456' });

    // Changing the address after verification asks for a new code.
    page.elements.email.value = 'x@b.c';
    await page.elements['create-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaCreateClaim).not.toHaveBeenCalled();
    expect(page.elements['form-error'].textContent).toContain('Send a new code');

    page.elements.email.value = 'a@b.c';
    await page.elements['create-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaCreateClaim).toHaveBeenCalledWith({ type: 'email', fields: { email: 'a@b.c', verification_token: 'vt' } });
  });

  test('a service error lands in the form as text', async () => {
    const page = await run(api({ aquaCreateClaim: async () => ({ success: false, error: { code: 'INVALID_INPUT', message: HOSTILE } }) }));
    await page.elements['add-claim-btn'].fire('click');
    page.elements['given-name'].value = 'A';
    page.elements['family-name'].value = 'B';
    await page.elements['create-btn'].fire('click');
    await page.flush();
    expect(page.elements['form-error'].textContent).toBe(HOSTILE);
    expect(page.elements['form-error'].classList.contains('hidden')).toBe(false);
    expect(isOpen(page.elements['add-claim-dialog'])).toBe(true);
  });

  test('Remove asks in a dialog and keeps the claim until confirmed', async () => {
    const freedomAPI = api({ aquaListClaims: async () => ({ success: true, claims: [claim()] }) });
    const page = await run(freedomAPI);
    const dialog = page.elements['remove-dialog'];
    await page.elements['claims-list'].querySelector('.btn.danger').fire('click');
    expect(isOpen(dialog)).toBe(true);
    expect(page.elements['remove-summary'].textContent).toContain(`${HOSTILE} Freedom`);
    await page.elements['remove-cancel'].fire('click');
    await page.flush();
    expect(isOpen(dialog)).toBe(false);
    expect(freedomAPI.aquaRemoveClaim).not.toHaveBeenCalled();

    await page.elements['claims-list'].querySelector('.btn.danger').fire('click');
    await page.elements['remove-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaRemoveClaim).toHaveBeenCalledWith('c1');
    expect(isOpen(dialog)).toBe(false);
    expect(page.document.htmlWrites).toHaveLength(0);
  });

  test('a domain claim shows its DNS record in a dialog, as text, and Check DNS runs from it', async () => {
    const freedomAPI = api({ aquaListClaims: async () => ({ success: true, claims: [claim({ type: 'domain', payload: { domain_name: 'example.com' }, domainVerification: 'pending' })] }) });
    const page = await run(freedomAPI);
    const card = page.elements['claims-list'].querySelector('.card');
    expect(card.textContent).toContain('DNS check: pending');
    await buttonNamed(card, 'DNS record').fire('click');
    await page.flush();
    expect(freedomAPI.aquaDnsInstructions).toHaveBeenCalledWith('c1');
    expect(isOpen(page.elements['dns-dialog'])).toBe(true);
    expect(page.elements['dns-body'].textContent).toContain('_aqua.example.com');
    expect(page.elements['dns-body'].textContent).toContain(HOSTILE);
    await page.elements['dns-check-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaVerifyDns).toHaveBeenCalledWith('c1');
    expect(isOpen(page.elements['dns-dialog'])).toBe(false);
    await buttonNamed(page.elements['claims-list'].querySelector('.card'), 'Check DNS').fire('click');
    expect(freedomAPI.aquaVerifyDns).toHaveBeenCalledTimes(2);
  });
});

describe('freedom://identity attestation', () => {
  test('a pending peer attestation says the attester holds the tree, with its source', async () => {
    const pending = claim({ attestations: [{ tip: '0x1', attesterDid: 'did:pkh:eip155:1:0xpeer', context: HOSTILE, source: 'peer', pending: true, verification: { isValid: false, status: 'held' } }] });
    const page = await run(api({ aquaListClaims: async () => ({ success: true, claims: [pending] }) }));
    const box = page.elements['claims-list'].querySelector('.attestation');
    expect(box.querySelector('.source').textContent).toBe('Peer');
    expect(box.querySelector('.source').querySelector('.ico-user')).not.toBeNull();
    expect(box.classList.contains('pending')).toBe(true);
    expect(box.querySelector('.badge').textContent).toBe('Pending');
    expect(box.textContent).toContain('Import it to verify');
    expect(page.elements['claims-list'].querySelector('.badge').textContent).toBe('Self-signed');
  });

  test('sharing sends the attester address from the dialog and pulling refreshes', async () => {
    const freedomAPI = api({ aquaListClaims: async () => ({ success: true, claims: [claim()] }) });
    const page = await run(freedomAPI);
    const card = page.elements['claims-list'].querySelector('.card');
    await buttonNamed(card, 'Share for attestation').fire('click');
    expect(isOpen(page.elements['share-dialog'])).toBe(true);
    expect(page.elements['share-summary'].textContent).toContain(`${HOSTILE} Freedom`);
    await page.elements['share-btn'].fire('click');
    expect(freedomAPI.aquaShareClaim).not.toHaveBeenCalled();
    expect(page.elements['share-error'].classList.contains('hidden')).toBe(false);
    page.elements['share-address'].value = ' 0xC412d3047AffD97dC51C5C52E2588Ae4238CbF88 ';
    await page.elements['share-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaShareClaim).toHaveBeenCalledWith('c1', '0xC412d3047AffD97dC51C5C52E2588Ae4238CbF88');
    expect(isOpen(page.elements['share-dialog'])).toBe(false);
    expect(page.elements['status-notice'].textContent).toContain('Shared');
    const fresh = page.elements['claims-list'].querySelector('.card');
    await buttonNamed(fresh, 'Pull attestations').fire('click');
    expect(freedomAPI.aquaPullAttestations).toHaveBeenCalledWith('c1');
  });

  test('importing pastes the tree text through to main and reports a refusal as text in the dialog', async () => {
    const freedomAPI = api({
      aquaListClaims: async () => ({ success: true, claims: [claim()] }),
      aquaImportAttestation: jest.fn(async () => ({ success: false, error: { code: 'INVALID_INPUT', message: HOSTILE } })),
    });
    const page = await run(freedomAPI);
    const card = page.elements['claims-list'].querySelector('.card');
    await buttonNamed(card, 'Import attestation').fire('click');
    expect(isOpen(page.elements['import-dialog'])).toBe(true);
    await page.elements['import-btn'].fire('click');
    expect(freedomAPI.aquaImportAttestation).not.toHaveBeenCalled();
    expect(page.elements['import-error'].textContent).toContain('Paste or choose');
    page.elements['import-text'].value = '{"revisions":{}}';
    await page.elements['import-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaImportAttestation).toHaveBeenCalledWith('c1', '{"revisions":{}}');
    expect(page.elements['import-error'].textContent).toBe(HOSTILE);
    expect(isOpen(page.elements['import-dialog'])).toBe(true);
  });

  test('a shared claim is attested with the user\'s words through the wallet', async () => {
    const freedomAPI = api({
      aquaListShared: async () => ({ success: true, shared: [{ contractHash: 'h1', tip: '0xt', sender: 'did:pkh:eip155:1:0xowner', templateName: 'name_claim', payload: { signer_did: 'did:pkh:eip155:1:0xowner', given_name: HOSTILE, family_name: 'Probe' } }] }),
    });
    const page = await run(freedomAPI);
    expect(page.elements['shared-count'].textContent).toBe('1');
    const card = page.elements['shared-claims'].querySelector('.card');
    expect(card.querySelector('.claim-value').textContent).toBe(`${HOSTILE} Probe`);
    expect(card.querySelector('.claim-icon').querySelector('.ico-user')).not.toBeNull();
    await buttonNamed(card, 'Attest').fire('click');
    expect(isOpen(page.elements['attest-dialog'])).toBe(true);
    expect(page.elements['attest-summary'].textContent).toContain(`${HOSTILE} Probe`);
    await page.elements['attest-btn'].fire('click');
    expect(freedomAPI.aquaAttestShared).not.toHaveBeenCalled();
    expect(page.elements['attest-error'].textContent).toContain('your own words');
    page.elements['attest-words'].value = 'I know this person';
    await page.elements['attest-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaAttestShared).toHaveBeenCalledWith({ contractHash: 'h1', tip: '0xt', context: 'I know this person' });
    expect(freedomAPI.aquaListIssued).toHaveBeenCalledTimes(2);
    expect(isOpen(page.elements['attest-dialog'])).toBe(false);
    expect(page.elements['status-notice'].textContent).toContain('Attested');
  });

  test('an issued attestation can be copied as JSON for the owner', async () => {
    const freedomAPI = api({
      aquaListIssued: async () => ({ success: true, issued: [{ id: 'a1', tip: '0xa', claimTip: '0xt', subjectDid: 'did:pkh:eip155:1:0xowner', context: HOSTILE, createdAt: '2026-10-22T12:00:00Z', verification: { isValid: true }, templateName: 'email_claim', subjectPayload: { email: 's@p.q' } }] }),
    });
    const page = await run(freedomAPI);
    expect(page.elements['issued-count'].textContent).toBe('1');
    const card = page.elements['issued-list'].querySelector('.card');
    expect(card.textContent).toContain(HOSTILE);
    expect(card.querySelector('.claim-value').textContent).toBe('s@p.q');
    expect(card.querySelector('.claim-icon').querySelector('.ico-mail')).not.toBeNull();
    expect(card.querySelector('.badge').textContent).toBe('Signed');
    await buttonNamed(card, 'Copy JSON').fire('click');
    await page.flush();
    expect(freedomAPI.aquaExportIssued).toHaveBeenCalledWith('a1');
    expect(freedomAPI.copyText).toHaveBeenCalledWith('{"revisions":{}}');
  });

  test('empty shared and issued lists show an icon and one line', async () => {
    const page = await run(api());
    expect(page.elements['shared-claims'].querySelector('.empty').textContent).toContain('Nothing has been shared');
    expect(page.elements['shared-claims'].querySelector('.empty').querySelector('.ico')).not.toBeNull();
    expect(page.elements['issued-list'].querySelector('.empty').textContent).toContain('not attested');
  });

  test('a service without out-of-band verification withholds email and phone claims', async () => {
    const page = await run(api({ aquaStatus: async () => ({ success: true, nodeUrl: 'u', wallet: { address: '0xabc' }, vaultUnlocked: true, hasVault: true, signedIn: true, service: { reachable: true, serviceDid: null, outOfBandVerification: false } }) }));
    expect(page.elements['wallet-line'].textContent).toContain('no email or phone verification');
    expect(page.elements['kind-email'].disabled).toBe(true);
    expect(page.elements['kind-phone'].disabled).toBe(true);
    expect(page.elements['kind-domain'].disabled).toBeFalsy();
    await page.elements['add-claim-btn'].fire('click');
    await page.elements['kind-email'].fire('click');
    expect(page.elements['kind-email'].getAttribute('aria-pressed')).toBe('false');
    expect(page.elements['fields-name'].classList.contains('hidden')).toBe(false);
    expect(page.elements['shared-claims'].textContent).toContain('Nothing has been shared');
  });
});

describe('freedom://identity disclosure', () => {
  test('a pasted request goes to main and the response comes back as text to copy', async () => {
    const freedomAPI = api({ aquaRespondToRequest: jest.fn(async () => ({ success: true, response: { aqua: 1, claims: [{ type: 'name' }], missing: [] } })) });
    const page = await run(freedomAPI);
    await page.elements['request-open-btn'].fire('click');
    expect(isOpen(page.elements['request-dialog'])).toBe(true);
    await page.elements['request-btn'].fire('click');
    expect(freedomAPI.aquaRespondToRequest).not.toHaveBeenCalled();
    expect(page.elements['request-status'].textContent).toContain('Paste the request first');
    page.elements['request-input'].value = ' {"aqua":1,"need":["name"]} ';
    await page.elements['request-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaRespondToRequest).toHaveBeenCalledWith('{"aqua":1,"need":["name"]}');
    expect(page.elements['response-box'].classList.contains('hidden')).toBe(false);
    expect(page.elements['request-box'].classList.contains('hidden')).toBe(true);
    expect(JSON.parse(page.elements['response-output'].value).claims).toHaveLength(1);
    expect(page.elements['request-status'].textContent).toContain('1 claim shared');
    await page.elements['response-copy'].fire('click');
    expect(freedomAPI.copyText).toHaveBeenCalledWith(page.elements['response-output'].value);
    await page.elements['request-cancel'].fire('click');
    expect(isOpen(page.elements['request-dialog'])).toBe(false);
    expect(page.elements['request-input'].value).toBe('');
  });

  test('a refused request is reported as text', async () => {
    const freedomAPI = api({ aquaRespondToRequest: jest.fn(async () => ({ success: false, error: { code: 'INVALID_REQUEST', message: HOSTILE } })) });
    const page = await run(freedomAPI);
    await page.elements['request-open-btn'].fire('click');
    page.elements['request-input'].value = '{}';
    await page.elements['request-btn'].fire('click');
    await page.flush();
    expect(page.elements['request-status'].textContent).toBe(HOSTILE);
    expect(page.elements['response-box'].classList.contains('hidden')).toBe(true);
    expect(page.document.htmlWrites).toHaveLength(0);
  });
});

describe('freedom://identity left nav', () => {
  test('opens on claims, switches panels on click, and follows the hash', async () => {
    const page = await run(api());
    expect(page.elements['panel-claims'].classList.contains('active')).toBe(true);
    expect(page.elements['panel-attest'].classList.contains('active')).toBe(false);
    await page.elements['nav-attest'].fire('click');
    expect(page.elements['nav-attest'].classList.contains('active')).toBe(true);
    expect(page.elements['panel-attest'].classList.contains('active')).toBe(true);
    expect(page.elements['panel-claims'].classList.contains('active')).toBe(false);
    const deep = await run(api(), { location: { href: 'x', search: '', hash: '#requests' } });
    expect(deep.elements['panel-requests'].classList.contains('active')).toBe(true);
  });
});
