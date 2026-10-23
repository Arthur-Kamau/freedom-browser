const { createDocument, createElement } = require('../../../../test/helpers/fake-dom.js');

const originalWindow = global.window;
const originalDocument = global.document;

const ELEMENT_IDS = [
  'sidebar-dapp-sign', 'dapp-sign-back', 'dapp-sign-site', 'dapp-sign-action', 'dapp-sign-message',
  'dapp-sign-typed-data-section', 'dapp-sign-typed-data', 'dapp-sign-unlock', 'dapp-sign-touchid-btn',
  'dapp-sign-password-link', 'dapp-sign-password-section', 'dapp-sign-password-input',
  'dapp-sign-password-submit', 'dapp-sign-error', 'dapp-sign-reject', 'dapp-sign-approve',
  'dapp-sign-auto-approve', 'dapp-sign-safe-note',
];

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function load({ executeSign = jest.fn(async () => '0x' + 'ab'.repeat(65)) } = {}) {
  jest.resetModules();
  const elements = Object.fromEntries(ELEMENT_IDS.map((id) => [id, createElement('button')]));
  elements['dapp-sign-auto-approve'].checked = false;
  const checkboxLabel = createElement('label');
  checkboxLabel.classList.add('auto-approve-checkbox');
  checkboxLabel.appendChild(elements['dapp-sign-auto-approve']);
  const messageParent = createElement('div');
  messageParent.appendChild(elements['dapp-sign-message']);
  global.document = createDocument({ elementsById: elements });
  const setSigningAutoApprove = jest.fn();
  global.window = {
    identity: { getStatus: jest.fn(async () => ({ isUnlocked: true })) },
    dappPermissions: { setSigningAutoApprove },
  };
  jest.doMock('../dapp-provider.js', () => ({ executeSign }));
  jest.doMock('./wallet-utils.js', () => ({
    bypassUnlockGateForDevice: jest.fn(() => false),
    bypassUnlockGateForSafe: jest.fn(() => false),
    isSafeAccount: jest.fn(() => false),
    signingButtonLabel: jest.fn(() => 'Signing…'),
  }));
  jest.doMock('./safe-signing.js', () => ({ isSafeSigningBoardOpen: jest.fn(() => false) }));
  jest.doMock('./wallet-state.js', () => ({
    walletState: { identityView: createElement('div') },
    registerScreenHider: jest.fn(),
    hideAllSubscreens: jest.fn(),
  }));
  const open = jest.fn();
  jest.doMock('../sidebar.js', () => ({ open }));
  const openOrFocusInternalPage = jest.fn();
  jest.doMock('../tabs.js', () => ({ openOrFocusInternalPage }));
  const dappSign = await import('./dapp-sign.js');
  dappSign.initDappSign();
  const aquaSign = await import('./aqua-sign.js');
  return { dappSign, aquaSign, elements, executeSign, setSigningAutoApprove, open, checkboxLabel, openOrFocusInternalPage };
}

afterEach(() => {
  global.window = originalWindow;
  global.document = originalDocument;
  jest.restoreAllMocks();
});

const PRE_IMAGE = '{"hash_codec":22,"method":"scalar","signer":"did:pkh:eip155:1:0xabc"}';

describe('showFirstPartySignApproval', () => {
  test('names the feature instead of a site, hides auto-approve, and signs through executeSign', async () => {
    const { dappSign, elements, executeSign, setSigningAutoApprove, open, checkboxLabel } = await load();
    const promise = dappSign.showFirstPartySignApproval({
      walletIndex: 2,
      label: 'Identity claim · aqua.test',
      action: 'asks you to sign this claim',
      message: '0x7b7d',
      display: 'hash_codec: 22',
    });
    await flush();
    expect(elements['dapp-sign-site'].textContent).toBe('Identity claim · aqua.test');
    expect(elements['dapp-sign-action'].textContent).toBe('asks you to sign this claim');
    expect(elements['dapp-sign-message'].textContent).toBe('hash_codec: 22');
    expect(checkboxLabel.classList.contains('hidden')).toBe(true);
    expect(open).toHaveBeenCalled();
    expect(elements['sidebar-dapp-sign'].classList.contains('hidden')).toBe(false);

    elements['dapp-sign-auto-approve'].checked = true; // must be ignored
    elements['dapp-sign-approve'].dispatch('click');
    await expect(promise).resolves.toBe('0x' + 'ab'.repeat(65));
    expect(executeSign).toHaveBeenCalledWith('personal_sign', ['0x7b7d'], 2, null, null);
    expect(setSigningAutoApprove).not.toHaveBeenCalled();
    // The screen is handed back to dApps as it was.
    expect(elements['dapp-sign-action'].textContent).toBe('requests your signature');
    expect(checkboxLabel.classList.contains('hidden')).toBe(false);
  });

  test('Reject settles the request with code 4001', async () => {
    const { dappSign, elements, executeSign } = await load();
    const promise = dappSign.showFirstPartySignApproval({ walletIndex: 0, label: 'x', action: 'y', message: 'm' });
    await flush();
    elements['dapp-sign-reject'].dispatch('click');
    await expect(promise).rejects.toMatchObject({ code: 4001 });
    expect(executeSign).not.toHaveBeenCalled();
  });

  test('refuses without a wallet index', async () => {
    const { dappSign } = await load();
    await expect(dappSign.showFirstPartySignApproval({ label: 'x', action: 'y', message: 'm' })).rejects.toThrow('wallet index');
  });
});

describe('aqua-sign', () => {
  test('displayTextFor lays a claim pre-image out one field per line and leaves a sign-in message alone', async () => {
    const { aquaSign } = await load();
    expect(aquaSign.displayTextFor({ purpose: 'claim', message: '0x7b', display: PRE_IMAGE })).toBe(
      'hash_codec: 22\nmethod: scalar\nsigner: did:pkh:eip155:1:0xabc'
    );
    const siwe = 'aqua.test wants you to sign in with your Ethereum account:\n0xabc';
    expect(aquaSign.displayTextFor({ purpose: 'login', message: siwe })).toBe(siwe);
    expect(aquaSign.displayTextFor({ purpose: 'claim', message: 'not json' })).toBe('not json');
  });

  test('handleAquaSignRequest answers main with the signature, or with the rejection', async () => {
    const { aquaSign, elements } = await load();
    const responses = [];
    const respond = (payload) => responses.push(payload);
    const request = { requestId: 'r-1', walletIndex: 0, purpose: 'claim', message: '0x7b7d', display: PRE_IMAGE, nodeUrl: 'https://aqua.test' };
    const done = aquaSign.handleAquaSignRequest(request, respond);
    await flush();
    expect(elements['dapp-sign-site'].textContent).toBe('Identity claim · aqua.test');
    elements['dapp-sign-approve'].dispatch('click');
    await done;
    expect(responses).toEqual([{ requestId: 'r-1', signature: '0x' + 'ab'.repeat(65) }]);

    const rejected = aquaSign.handleAquaSignRequest({ ...request, requestId: 'r-2', purpose: 'login', message: 'siwe' }, respond);
    await flush();
    expect(elements['dapp-sign-site'].textContent).toBe('Identity service · aqua.test');
    elements['dapp-sign-reject'].dispatch('click');
    await rejected;
    expect(responses[1]).toEqual({ requestId: 'r-2', error: { code: 4001, message: 'User rejected the request' } });
  });

  test('initAquaSign subscribes to main and wires the Manage link to freedom://identity', async () => {
    const { aquaSign, openOrFocusInternalPage } = await load();
    const handlers = [];
    global.window.aqua = { onSignRequest: jest.fn((cb) => handlers.push(cb)), respondToSignRequest: jest.fn() };
    const manage = createElement('a');
    global.document = createDocument({ elementsById: { 'identity-claims-manage': manage } });
    aquaSign.initAquaSign();
    expect(handlers).toHaveLength(1);
    manage.dispatch('click', { preventDefault: () => {} });
    expect(openOrFocusInternalPage).toHaveBeenCalledWith('identity');
  });
});
