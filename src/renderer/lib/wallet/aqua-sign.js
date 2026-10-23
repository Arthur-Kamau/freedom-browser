/**
 * Aqua identity claims: the chrome side of main's signing requests.
 *
 * Main (src/main/aqua/aqua-ipc.js) cannot sign; when a claim's EIP-191
 * pre-image or the identity service's sign-in message needs the wallet, it
 * publishes an `aqua:sign-request` here. The request is shown on the Sign
 * Message screen in its first-party mode and the answer goes back on
 * `aqua:sign-response`, signature or rejection. Also owns the "Identity
 * claims → Manage" deep link in the wallet tab.
 */
import { showFirstPartySignApproval } from './dapp-sign.js';
import { openOrFocusInternalPage } from '../tabs.js';

const PURPOSE_COPY = {
  login: { action: 'asks you to sign in', labelPrefix: 'Identity service' },
  claim: { action: 'asks you to sign this claim', labelPrefix: 'Identity claim' },
  attestation: { action: 'asks you to attest this claim', labelPrefix: 'Attestation' },
};

function labelFor(request) {
  const copy = PURPOSE_COPY[request.purpose] || PURPOSE_COPY.claim;
  let host;
  try {
    host = new URL(request.nodeUrl).host;
  } catch {
    host = '';
  }
  return { action: copy.action, label: host ? `${copy.labelPrefix} · ${host}` : copy.labelPrefix };
}

/**
 * Pretty-print a claim pre-image for the screen: it is canonical JSON on
 * one line, which reads badly in the message box.
 */
export function displayTextFor(request) {
  const text = typeof request.display === 'string' && request.display ? request.display : request.message;
  if (request.purpose === 'claim' || request.purpose === 'attestation') {
    try {
      const parsed = JSON.parse(text);
      return Object.entries(parsed)
        .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
        .join('\n');
    } catch {
      return text;
    }
  }
  return text;
}

export async function handleAquaSignRequest(request, respond) {
  const { label, action } = labelFor(request);
  try {
    const signature = await showFirstPartySignApproval({
      walletIndex: request.walletIndex,
      label,
      action,
      message: request.message,
      display: displayTextFor(request),
    });
    respond({ requestId: request.requestId, signature });
  } catch (err) {
    respond({
      requestId: request.requestId,
      error: { code: err?.code || 'SIGN_FAILED', message: err?.message || 'The signature request was rejected' },
    });
  }
}

export function initAquaSign() {
  const aqua = window.aqua;
  if (aqua?.onSignRequest) {
    aqua.onSignRequest((request) => handleAquaSignRequest(request, aqua.respondToSignRequest));
  }
  const manage = document.getElementById('identity-claims-manage');
  if (manage) {
    manage.addEventListener('click', (event) => {
      event.preventDefault();
      openOrFocusInternalPage('identity');
    });
  }
}
