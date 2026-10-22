/**
 * freedom://identity renders service and user strings as text, drives the
 * one-time-code flow in order, and never labels a self-signed claim as
 * verified.
 */
const { runPageScript } = require('../../../test/helpers/page-script-harness');

const HOSTILE = `"><img src=x onerror=alert(1) data-xss="1">'<b>&amp;`;
const IDS = {
  claims: 'div', 'claims-empty': 'div', 'status-notice': 'div', 'wallet-line': 'p', 'claim-form': 'form', 'claim-type': 'select',
  'fields-name': 'div', 'fields-email': 'div', 'fields-phone': 'div', 'fields-domain': 'div',
  'given-name': 'input', 'family-name': 'input', 'middle-name': 'input', nickname: 'input', email: 'input',
  'phone-number': 'input', domain: 'input', code: 'input', 'code-section': 'div', 'send-code-btn': 'button',
  'verify-code-btn': 'button', 'code-status': 'span', 'form-error': 'div', 'create-btn': 'button', 'cancel-btn': 'button',
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
    aquaStatus: jest.fn(async () => ({ success: true, nodeUrl: 'https://aqua.test', wallet: { address: '0xabc', canSign: true }, vaultUnlocked: true, hasVault: true })),
    aquaListClaims: jest.fn(async () => ({ success: true, claims: [] })),
    aquaCreateClaim: jest.fn(async () => ({ success: true, claim: claim() })),
    aquaRemoveClaim: jest.fn(async () => ({ success: true, removed: true })),
    aquaRefreshClaim: jest.fn(async () => ({ success: true, claim: claim() })),
    aquaSendCode: jest.fn(async ({ target }) => ({ success: true, target, message: 'sent' })),
    aquaVerifyCode: jest.fn(async () => ({ success: true, verificationToken: 'vt' })),
    aquaDnsInstructions: jest.fn(async () => ({ success: true, record_name: '_aqua.example.com', record_value: HOSTILE })),
    aquaVerifyDns: jest.fn(async () => ({ success: true, claim: claim({ type: 'domain' }) })),
    onAquaClaimsChanged: jest.fn(),
    ...overrides,
  };
}

const run = async (freedomAPI, confirm) => {
  const page = await runPageScript('identity', { ids: IDS, freedomAPI, confirm });
  // The harness element has no form API; the page calls reset() after a
  // successful create and on Cancel.
  page.elements['claim-form'].reset = () => {};
  return page;
};

describe('freedom://identity', () => {
  test('shows the empty state and the wallet line', async () => {
    const page = await run(api());
    expect(page.elements['claims-empty'].classList.contains('hidden')).toBe(false);
    expect(page.elements.claims.children).toHaveLength(0);
    expect(page.elements['wallet-line'].textContent).toContain('Wallet 0xabc');
    expect(page.elements['wallet-line'].textContent).toContain('https://aqua.test');
  });

  test('a locked vault is said plainly, and a missing one differently', async () => {
    const locked = { success: false, error: { code: 'VAULT_LOCKED', message: 'Unlock your vault' } };
    const page = await run(api({
      aquaStatus: async () => ({ success: true, nodeUrl: 'u', wallet: null, vaultUnlocked: false, hasVault: true }),
      aquaListClaims: async () => locked,
    }));
    expect(page.elements['status-notice'].textContent).toContain('locked');
    expect(page.elements['status-notice'].classList.contains('hidden')).toBe(false);
    expect(page.elements.claims.textContent).toContain('Unlock your wallet');

    const fresh = await run(api({
      aquaStatus: async () => ({ success: true, nodeUrl: 'u', wallet: null, vaultUnlocked: false, hasVault: false }),
      aquaListClaims: async () => locked,
    }));
    expect(fresh.elements.claims.textContent).toContain('Set up your wallet');
  });

  test('renders a claim with hostile payload as text and labels it Self-signed, never verified', async () => {
    const page = await run(api({ aquaListClaims: async () => ({ success: true, claims: [claim()] }) }));
    expect(page.elements['claims-empty'].classList.contains('hidden')).toBe(true);
    const card = page.elements.claims.querySelector('.card');
    expect(card.querySelector('.claim-value').textContent).toBe(`${HOSTILE} Freedom`);
    expect(card.querySelector('.pill').textContent).toBe('Self-signed');
    expect(page.elements.claims.textContent).not.toMatch(/verified by|Verified$/);
    expect(page.elements.claims.textContent).toContain('Only you have signed this claim');
  });

  test('an attested claim lists the attester and their words, as text', async () => {
    const attested = claim({ attestations: [{ tip: '0x1', attesterDid: 'did:pkh:eip155:1:0xserver', context: HOSTILE, verification: { isValid: true } }] });
    const page = await run(api({ aquaListClaims: async () => ({ success: true, claims: [attested] }) }));
    const card = page.elements.claims.querySelector('.card');
    expect(card.querySelector('.pill').textContent).toBe('Attested');
    expect(card.querySelector('.attestation').textContent).toContain('did:pkh:eip155:1:0xserver');
    expect(card.querySelector('.attestation').textContent).toContain(HOSTILE);
  });

  test('a failed verification is flagged on the pill', async () => {
    const page = await run(api({ aquaListClaims: async () => ({ success: true, claims: [claim({ verification: { isValid: false, status: 'Chain broken' } })] }) }));
    expect(page.elements.claims.querySelector('.pill').textContent).toBe('Verification failed');
    expect(page.elements.claims.textContent).toContain('Not verified: Chain broken');
  });

  test('creating a name claim sends the fields and reloads', async () => {
    const freedomAPI = api();
    const page = await run(freedomAPI);
    page.elements['given-name'].value = 'Probe';
    page.elements['family-name'].value = 'Freedom';
    await page.elements['create-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaCreateClaim).toHaveBeenCalledWith({
      type: 'name', fields: { given_name: 'Probe', family_name: 'Freedom', middle_name: '', nickname: '' },
    });
    expect(freedomAPI.aquaListClaims).toHaveBeenCalledTimes(2);
  });

  test('an email claim needs the code verified first, for the same address', async () => {
    const freedomAPI = api();
    const page = await run(freedomAPI);
    page.elements['claim-type'].value = 'email';
    await page.elements['claim-type'].fire('change');
    expect(page.elements['fields-email'].classList.contains('hidden')).toBe(false);
    expect(page.elements['code-section'].classList.contains('hidden')).toBe(false);

    await page.elements['create-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaCreateClaim).not.toHaveBeenCalled();
    expect(page.elements['form-error'].textContent).toContain('Verify the code');

    page.elements.email.value = 'a@b.c';
    await page.elements['send-code-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaSendCode).toHaveBeenCalledWith({ channel: 'email', target: 'a@b.c' });
    expect(page.elements['code-status'].textContent).toContain('Code sent to a@b.c');

    page.elements.code.value = '123456';
    await page.elements['verify-code-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaVerifyCode).toHaveBeenCalledWith({ target: 'a@b.c', code: '123456' });

    await page.elements['create-btn'].fire('click');
    await page.flush();
    expect(freedomAPI.aquaCreateClaim).toHaveBeenCalledWith({ type: 'email', fields: { email: 'a@b.c', verification_token: 'vt' } });
  });

  test('a service error lands in the form as text', async () => {
    const page = await run(api({ aquaCreateClaim: async () => ({ success: false, error: { code: 'INVALID_INPUT', message: HOSTILE } }) }));
    page.elements['given-name'].value = 'A';
    page.elements['family-name'].value = 'B';
    await page.elements['create-btn'].fire('click');
    await page.flush();
    expect(page.elements['form-error'].textContent).toBe(HOSTILE);
    expect(page.elements['form-error'].classList.contains('hidden')).toBe(false);
  });

  test('Remove asks first and keeps the claim when declined', async () => {
    const freedomAPI = api({ aquaListClaims: async () => ({ success: true, claims: [claim()] }) });
    const page = await run(freedomAPI, () => false);
    await page.elements.claims.querySelector('.btn.danger').fire('click');
    await page.flush();
    expect(freedomAPI.aquaRemoveClaim).not.toHaveBeenCalled();
  });

  test('a domain claim shows its DNS record as text', async () => {
    const freedomAPI = api({ aquaListClaims: async () => ({ success: true, claims: [claim({ type: 'domain', payload: { domain_name: 'example.com' }, domainVerification: 'pending' })] }) });
    const page = await run(freedomAPI);
    const card = page.elements.claims.querySelector('.card');
    expect(card.textContent).toContain('pending');
    const dnsBtn = card.querySelectorAll('.btn').find((b) => b.textContent === 'DNS record');
    await dnsBtn.fire('click');
    await page.flush();
    expect(freedomAPI.aquaDnsInstructions).toHaveBeenCalledWith('c1');
    expect(card.querySelector('.dns-box').textContent).toContain(HOSTILE);
  });
});
