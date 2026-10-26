const { createDocument, createElement } = require('../../../../test/helpers/fake-dom.js');

const originalWindow = global.window;
const originalDocument = global.document;
const IDS = ['sidebar-aqua-disclose', 'aqua-disclose-back', 'aqua-disclose-site', 'aqua-disclose-purpose', 'aqua-disclose-list', 'aqua-disclose-error', 'aqua-disclose-reject', 'aqua-disclose-share'];

const flush = () => new Promise((resolve) => setImmediate(resolve));

const ENTRIES = [
  { type: 'name', required: true, fields: ['given_name', 'family_name'], claimId: 'c1', summary: { payload: { given_name: 'Probe', family_name: 'Freedom' }, attested: 1 } },
  { type: 'email', required: true, fields: null, claimId: null, summary: null },
  { type: 'domain', required: false, fields: null, claimId: 'c3', summary: { payload: { domain_name: 'example.com' }, attested: 0 } },
];

async function load({ prepared, built } = {}) {
  jest.resetModules();
  const elements = Object.fromEntries(IDS.map((id) => [id, createElement('div')]));
  global.document = createDocument({ elementsById: elements });
  const onDisclosureRequest = jest.fn();
  const respondToDisclosureRequest = jest.fn();
  global.window = {
    aqua: {
      prepareDisclosure: jest.fn(async () => prepared || { success: true, request: { purpose: 'To ship', nonce: 'n' }, entries: ENTRIES }),
      buildDisclosure: jest.fn(async () => built || { success: true, response: { aqua: 1, claims: [{ type: 'name' }], missing: [] } }),
      onDisclosureRequest,
      respondToDisclosureRequest,
    },
  };
  jest.doMock('./wallet-state.js', () => ({ walletState: { identityView: createElement('div') }, registerScreenHider: jest.fn(), hideAllSubscreens: jest.fn() }));
  jest.doMock('./signature-flight.js', () => ({ assertNoSignatureInFlight: jest.fn() }));
  const open = jest.fn();
  jest.doMock('../sidebar.js', () => ({ open }));
  const showVaultUnlock = jest.fn(async () => {});
  jest.doMock('./vault-unlock.js', () => ({ showVaultUnlock }));
  const mod = await import('./aqua-disclose.js');
  mod.initAquaDisclose();
  return { mod, elements, open, onDisclosureRequest, respondToDisclosureRequest, showVaultUnlock };
}

afterEach(() => {
  global.window = originalWindow;
  global.document = originalDocument;
  jest.restoreAllMocks();
});

describe('Share Identity screen', () => {
  test('lists the matched claims: required ticked, optional unticked, missing disabled; Share sends the ticks', async () => {
    const { mod, elements, open } = await load();
    const promise = mod.showAquaDisclosure({ label: 'shop.example', address: '0xabc', request: { aqua: 1, need: ['name', 'email'], optional: ['domain'] } });
    await flush();
    expect(window.aqua.prepareDisclosure).toHaveBeenCalledWith({ request: { aqua: 1, need: ['name', 'email'], optional: ['domain'] }, address: '0xabc' });
    expect(elements['aqua-disclose-site'].textContent).toBe('shop.example');
    expect(elements['aqua-disclose-purpose'].textContent).toBe('“To ship”');
    expect(open).toHaveBeenCalled();
    const rows = elements['aqua-disclose-list'].querySelectorAll('.aqua-disclose-row');
    expect(rows).toHaveLength(3);
    const boxes = rows.map((r) => r.querySelector('.aqua-disclose-check'));
    expect(boxes.map((b) => [b.checked, b.disabled])).toEqual([[true, false], [false, true], [false, false]]);
    expect(rows[0].querySelector('.aqua-disclose-value').textContent).toBe('Given name: Probe · Family name: Freedom');
    expect(rows[0].querySelector('.aqua-disclose-meta').textContent).toBe('Attested by 1');
    expect(rows[1].querySelector('.aqua-disclose-meta').textContent).toBe('You have no such claim');
    expect(rows[2].querySelector('.aqua-disclose-meta').textContent).toContain('Self-signed');
    // Hold back the family name, add the optional domain.
    rows[0].querySelectorAll('.aqua-disclose-field-check').find((b) => b.dataset.field === 'family_name').checked = false;
    boxes[2].checked = true;
    elements['aqua-disclose-share'].dispatch('click');
    await expect(promise).resolves.toEqual({ aqua: 1, claims: [{ type: 'name' }], missing: [] });
    expect(window.aqua.buildDisclosure).toHaveBeenCalledWith({
      request: { aqua: 1, need: ['name', 'email'], optional: ['domain'] },
      selections: [{ type: 'name', claimId: 'c1', fields: ['given_name'] }, { type: 'domain', claimId: 'c3' }],
      address: '0xabc',
    });
    expect(elements['sidebar-aqua-disclose'].classList.contains('hidden')).toBe(true);
  });

  test('a locked vault asks for the unlock on the sidebar, then looks at the claims again', async () => {
    const locked = { success: false, error: { code: 'VAULT_LOCKED', message: 'Unlock your vault to access identity claims' } };
    const { mod, elements, showVaultUnlock } = await load({ prepared: locked });
    window.aqua.prepareDisclosure
      .mockResolvedValueOnce(locked)
      .mockResolvedValueOnce({ success: true, request: { purpose: 'To ship', nonce: 'n' }, entries: ENTRIES });
    const promise = mod.showAquaDisclosure({ label: 'shop.example', address: '0xabc', request: { aqua: 1, need: ['name'] } });
    await flush();
    expect(showVaultUnlock).toHaveBeenCalledWith('shop.example');
    expect(window.aqua.prepareDisclosure).toHaveBeenCalledTimes(2);
    expect(elements['sidebar-aqua-disclose'].classList.contains('hidden')).toBe(false);
    expect(elements['aqua-disclose-list'].querySelectorAll('.aqua-disclose-row')).toHaveLength(3);
    elements['aqua-disclose-reject'].dispatch('click');
    await expect(promise).rejects.toMatchObject({ code: 4001 });
  });

  test('a dismissed unlock prompt is the user\'s cancel: nothing is looked at again and the screen stays closed', async () => {
    const locked = { success: false, error: { code: 'VAULT_LOCKED', message: 'Unlock your vault to access identity claims' } };
    const { mod, elements, open, showVaultUnlock } = await load({ prepared: locked });
    showVaultUnlock.mockRejectedValueOnce({ code: 4001, message: 'User cancelled unlock' });
    await expect(mod.showAquaDisclosure({ label: 'x', address: '0xabc', request: { aqua: 1, need: ['name'] } })).rejects.toMatchObject({ code: 4001 });
    expect(window.aqua.prepareDisclosure).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    expect(elements['aqua-disclose-list'].querySelectorAll('.aqua-disclose-row')).toHaveLength(0);
  });

  test('Reject and Back settle with 4001 and nothing is built', async () => {
    const { mod, elements } = await load();
    const promise = mod.showAquaDisclosure({ label: 'x', address: '0xabc', request: {} });
    await flush();
    elements['aqua-disclose-reject'].dispatch('click');
    await expect(promise).rejects.toMatchObject({ code: 4001 });
    expect(window.aqua.buildDisclosure).not.toHaveBeenCalled();
    const second = mod.showAquaDisclosure({ label: 'x', address: '0xabc', request: {} });
    await flush();
    elements['aqua-disclose-back'].dispatch('click');
    await expect(second).rejects.toMatchObject({ code: 4001 });
  });

  test('a malformed request never opens the screen, and a claim with no field ticked cannot be shared', async () => {
    const { mod, open } = await load({ prepared: { success: false, error: { message: 'Request names nothing it needs' } } });
    await expect(mod.showAquaDisclosure({ label: 'x', address: '0xabc', request: {} })).rejects.toMatchObject({ code: -32602 });
    expect(open).not.toHaveBeenCalled();

    const fresh = await load();
    const promise = fresh.mod.showAquaDisclosure({ label: 'x', address: '0xabc', request: {} });
    await flush();
    const [row] = fresh.elements['aqua-disclose-list'].querySelectorAll('.aqua-disclose-row');
    for (const b of row.querySelectorAll('.aqua-disclose-field-check')) b.checked = false;
    fresh.elements['aqua-disclose-share'].dispatch('click');
    await flush();
    expect(fresh.elements['aqua-disclose-error'].textContent).toContain('at least one field');
    expect(window.aqua.buildDisclosure).not.toHaveBeenCalled();
    fresh.elements['aqua-disclose-reject'].dispatch('click');
    await expect(promise).rejects.toMatchObject({ code: 4001 });
  });

  test('a pasted request from main runs through the same screen and answers main', async () => {
    const { elements, onDisclosureRequest, respondToDisclosureRequest } = await load();
    expect(onDisclosureRequest).toHaveBeenCalledTimes(1);
    const handler = onDisclosureRequest.mock.calls[0][0];
    const done = handler({ requestId: 'r-1', address: '0xabc', requester: { label: 'Pasted request' }, request: { aqua: 1, need: ['name'] } });
    await flush();
    expect(elements['aqua-disclose-site'].textContent).toBe('Pasted request');
    elements['aqua-disclose-share'].dispatch('click');
    await done;
    await flush();
    expect(respondToDisclosureRequest).toHaveBeenCalledWith({ requestId: 'r-1', response: { aqua: 1, claims: [{ type: 'name' }], missing: [] } });
  });
});
