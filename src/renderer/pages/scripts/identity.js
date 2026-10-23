// Identity claims — freedom://identity
//
// freedomAPI is exposed by webview-preload.js via contextBridge. Every value
// shown here came from the identity service or the user, so rows are built
// with DOM APIs and textContent, never HTML strings (#432).

const claimsEl = document.getElementById('claims');
const claimsEmpty = document.getElementById('claims-empty');
const statusNotice = document.getElementById('status-notice');
const walletLine = document.getElementById('wallet-line');
const form = document.getElementById('claim-form');
const typeSelect = document.getElementById('claim-type');
const fieldGroups = {
  name: document.getElementById('fields-name'),
  email: document.getElementById('fields-email'),
  phone: document.getElementById('fields-phone'),
  domain: document.getElementById('fields-domain'),
};
const inputs = {
  givenName: document.getElementById('given-name'),
  familyName: document.getElementById('family-name'),
  middleName: document.getElementById('middle-name'),
  nickname: document.getElementById('nickname'),
  email: document.getElementById('email'),
  phone: document.getElementById('phone-number'),
  domain: document.getElementById('domain'),
  code: document.getElementById('code'),
};
const codeSection = document.getElementById('code-section');
const sendCodeBtn = document.getElementById('send-code-btn');
const verifyCodeBtn = document.getElementById('verify-code-btn');
const codeStatus = document.getElementById('code-status');
const formError = document.getElementById('form-error');
const createBtn = document.getElementById('create-btn');
const cancelBtn = document.getElementById('cancel-btn');

const TYPE_LABELS = { name: 'Name', email: 'Email', phone: 'Phone', domain: 'Domain' };
const OTP_TYPES = new Set(['email', 'phone']);

// One-time-code state for the email/phone flow: the target the code was
// sent to and the token the service handed back once it was entered.
let verification = { target: null, token: null };
let busy = false;
// From the last status read: whether this profile has a wallet at all, so a
// locked-store answer reads as "set one up" rather than "unlock it".
let hasVault = true;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function shortHash(hash) {
  if (typeof hash !== 'string' || hash.length < 20) return hash || '';
  return `${hash.slice(0, 12)}…${hash.slice(-8)}`;
}

function claimValue(claim) {
  const p = claim.payload || {};
  switch (claim.type) {
    case 'name':
      return [p.given_name, p.middle_name, p.family_name].filter(Boolean).join(' ') || '(no name)';
    case 'email':
      return p.email || '';
    case 'phone':
      return p.phone_number || '';
    case 'domain':
      return p.domain_name || p.provider_id || p.domain || '';
    default:
      return '';
  }
}

function formatTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? String(iso) : date.toLocaleString();
}

function showNotice(kind, message) {
  statusNotice.className = `notice ${kind}`;
  statusNotice.textContent = message;
  statusNotice.classList.remove('hidden');
}

function hideNotice() {
  statusNotice.classList.add('hidden');
}

function setFormError(message) {
  if (!message) {
    formError.textContent = '';
    formError.classList.add('hidden');
    return;
  }
  formError.textContent = message;
  formError.classList.remove('hidden');
}

function setBusy(on) {
  busy = on;
  createBtn.disabled = on;
  sendCodeBtn.disabled = on;
  verifyCodeBtn.disabled = on || !verification.target || Boolean(verification.token);
}

function errorText(result, fallback) {
  const err = result && result.error;
  if (!err) return fallback;
  if (err.code === 'VAULT_LOCKED') {
    return hasVault
      ? 'Unlock your wallet in the sidebar, then try again.'
      : 'Set up your wallet in the sidebar to keep claims in this profile.';
  }
  if (err.code === 'DISABLED') return 'Enable Identity & Wallet under Settings → Advanced to use identity claims.';
  return err.message || fallback;
}

// ── Claims list ──────────────────────────────────────────────────────────

function renderEmpty() {
  claimsEl.replaceChildren();
  claimsEmpty.classList.remove('hidden');
}

function statusPill(claim) {
  const attested = (claim.attestations || []).filter((a) => a.verification?.isValid !== false);
  if (claim.verification && claim.verification.isValid === false) {
    return el('span', 'pill invalid', 'Verification failed');
  }
  if (attested.length > 0) {
    return el('span', 'pill attested', attested.length === 1 ? 'Attested' : `Attested ×${attested.length}`);
  }
  return el('span', 'pill', 'Self-signed');
}

function row(label, valueNode) {
  const r = el('div', 'claim-row');
  r.appendChild(el('span', 'label', label));
  if (typeof valueNode === 'string') r.appendChild(el('span', null, valueNode));
  else r.appendChild(valueNode);
  return r;
}

function renderClaim(claim) {
  const card = el('div', 'card');
  card.dataset.id = claim.id;

  const head = el('div', 'claim-head');
  head.appendChild(el('span', 'claim-type', TYPE_LABELS[claim.type] || claim.type));
  head.appendChild(el('span', 'claim-value', claimValue(claim)));
  head.appendChild(statusPill(claim));
  card.appendChild(head);

  const rows = el('div', 'claim-rows');
  const verification = claim.verification || {};
  const verificationText = verification.isValid
    ? `Chain and signature verified (${verification.status || 'OK'}), ${formatTime(verification.checkedAt)}`
    : `Not verified: ${verification.status || 'unknown'}`;
  rows.appendChild(row('Verification', verificationText));
  rows.appendChild(row('Signer', el('span', 'mono', claim.signerDid || '')));
  const tip = el('span', 'mono', shortHash(claim.tip));
  tip.title = claim.tip || '';
  rows.appendChild(row('Revision', tip));
  rows.appendChild(row('Signed', formatTime(claim.signedAt)));
  if (claim.type === 'domain') {
    rows.appendChild(row('DNS check', claim.domainVerification || 'pending'));
  }

  const attestations = claim.attestations || [];
  if (attestations.length === 0) {
    rows.appendChild(row('Attestations', 'None yet. Only you have signed this claim.'));
  } else {
    const list = el('div', null);
    for (const a of attestations) {
      const box = el('div', a.verification?.isValid === false ? 'attestation invalid' : 'attestation');
      box.appendChild(el('div', 'mono', a.attesterDid || '(unknown attester)'));
      if (a.context) box.appendChild(el('div', 'meta', a.context));
      box.appendChild(
        el('div', 'meta', a.verification?.isValid ? 'Attestation verified' : `Attestation not verified: ${a.verification?.status || 'unknown'}`)
      );
      list.appendChild(box);
    }
    rows.appendChild(row('Attestations', list));
  }
  card.appendChild(rows);

  const actions = el('div', 'actions');
  if (claim.type === 'domain') {
    const dnsBtn = el('button', 'btn', 'DNS record');
    dnsBtn.type = 'button';
    dnsBtn.addEventListener('click', () => showDnsInstructions(claim, card));
    actions.appendChild(dnsBtn);
    const checkBtn = el('button', 'btn', 'Check DNS');
    checkBtn.type = 'button';
    checkBtn.addEventListener('click', () => verifyDns(claim));
    actions.appendChild(checkBtn);
  }
  const refreshBtn = el('button', 'btn', 'Re-verify');
  refreshBtn.type = 'button';
  refreshBtn.addEventListener('click', () => refreshClaim(claim));
  actions.appendChild(refreshBtn);
  const removeBtn = el('button', 'btn danger', 'Remove');
  removeBtn.type = 'button';
  removeBtn.addEventListener('click', () => removeClaim(claim));
  actions.appendChild(removeBtn);
  card.appendChild(actions);

  return card;
}

async function loadClaims() {
  const result = await window.freedomAPI.aquaListClaims();
  if (!result?.success) {
    claimsEmpty.classList.add('hidden');
    claimsEl.replaceChildren(el('div', 'meta', errorText(result, 'Claims could not be loaded.')));
    return;
  }
  const claims = result.claims || [];
  if (claims.length === 0) {
    renderEmpty();
    return;
  }
  claimsEmpty.classList.add('hidden');
  const sorted = [...claims].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  claimsEl.replaceChildren(...sorted.map(renderClaim));
}

async function loadStatus() {
  const result = await window.freedomAPI.aquaStatus();
  if (!result?.success) {
    showNotice('warn', errorText(result, 'Identity claims are unavailable.'));
    walletLine.textContent = '';
    return;
  }
  hideNotice();
  hasVault = result.hasVault !== false;
  const parts = [];
  if (result.wallet?.address) parts.push(`Wallet ${result.wallet.address}`);
  parts.push(`Identity service ${result.nodeUrl}`);
  walletLine.textContent = parts.join(' · ');
  if (!result.hasVault) {
    showNotice('warn', 'Set up your wallet in the sidebar before creating identity claims.');
  } else if (!result.vaultUnlocked) {
    showNotice('warn', 'Your wallet is locked. Unlock it in the sidebar to see and create claims.');
  } else if (result.wallet && result.wallet.canSign === false) {
    showNotice('warn', 'A multi-owner account cannot sign identity claims. Switch to another wallet.');
  }
}

async function refreshClaim(claim) {
  const result = await window.freedomAPI.aquaRefreshClaim(claim.id);
  if (!result?.success) showNotice('error', errorText(result, 'Could not re-verify the claim.'));
  await loadClaims();
}

async function removeClaim(claim) {
  const label = claimValue(claim);
  if (!confirm(`Remove the ${TYPE_LABELS[claim.type] || claim.type} claim "${label}" from this profile? The identity service keeps its copy.`)) {
    return;
  }
  const result = await window.freedomAPI.aquaRemoveClaim(claim.id);
  if (!result?.success) showNotice('error', errorText(result, 'Could not remove the claim.'));
  await loadClaims();
}

async function showDnsInstructions(claim, card) {
  const result = await window.freedomAPI.aquaDnsInstructions(claim.id);
  const existing = card.querySelector('.dns-box');
  if (existing) existing.remove();
  const box = el('div', 'dns-box');
  if (!result?.success) {
    box.appendChild(el('div', 'meta', errorText(result, 'DNS instructions are unavailable.')));
  } else {
    const name = result.record_name || result.name || result.host || '';
    const value = result.record_value || result.value || result.txt || '';
    box.appendChild(el('div', 'meta', 'Add this TXT record at your DNS provider, then press Check DNS.'));
    box.appendChild(row('Name', el('span', 'mono', name)));
    box.appendChild(row('Value', el('span', 'mono', value)));
  }
  card.appendChild(box);
}

async function verifyDns(claim) {
  const result = await window.freedomAPI.aquaVerifyDns(claim.id);
  if (!result?.success) showNotice('error', errorText(result, 'The DNS check failed.'));
  else hideNotice();
  await loadClaims();
}

// ── Form ─────────────────────────────────────────────────────────────────

function selectedType() {
  return typeSelect.value || 'name';
}

function syncTypeFields() {
  const type = selectedType();
  for (const [key, group] of Object.entries(fieldGroups)) {
    group.classList.toggle('hidden', key !== type);
  }
  codeSection.classList.toggle('hidden', !OTP_TYPES.has(type));
  resetVerification();
  setFormError('');
}

function resetVerification() {
  verification = { target: null, token: null };
  inputs.code.value = '';
  codeStatus.textContent = '';
  verifyCodeBtn.disabled = true;
}

function otpTarget() {
  return selectedType() === 'email' ? inputs.email.value.trim() : inputs.phone.value.trim();
}

async function sendCode() {
  if (busy) return;
  const type = selectedType();
  const target = otpTarget();
  if (!target) {
    setFormError(type === 'email' ? 'Enter the email address first.' : 'Enter the phone number first.');
    return;
  }
  setFormError('');
  setBusy(true);
  try {
    const result = await window.freedomAPI.aquaSendCode({ channel: type, target });
    if (!result?.success) {
      setFormError(errorText(result, 'The code could not be sent.'));
      return;
    }
    verification = { target: result.target || target, token: null };
    codeStatus.textContent = `Code sent to ${verification.target}. Enter it and press Verify code.`;
  } finally {
    setBusy(false);
  }
}

async function verifyCode() {
  if (busy || !verification.target) return;
  const code = inputs.code.value.trim();
  if (!code) {
    setFormError('Enter the code you received.');
    return;
  }
  setFormError('');
  setBusy(true);
  try {
    const result = await window.freedomAPI.aquaVerifyCode({ target: verification.target, code });
    if (!result?.success) {
      setFormError(errorText(result, 'The code was not accepted.'));
      return;
    }
    verification.token = result.verificationToken;
    codeStatus.textContent = `${verification.target} verified. Press Create and sign.`;
  } finally {
    setBusy(false);
  }
}

function collectFields() {
  switch (selectedType()) {
    case 'name':
      return {
        given_name: inputs.givenName.value,
        family_name: inputs.familyName.value,
        middle_name: inputs.middleName.value,
        nickname: inputs.nickname.value,
      };
    case 'email':
      return { email: verification.target || inputs.email.value, verification_token: verification.token };
    case 'phone':
      return { phone_number: verification.target || inputs.phone.value, verification_token: verification.token };
    case 'domain':
      return { domain: inputs.domain.value };
    default:
      return {};
  }
}

async function createClaim() {
  if (busy) return;
  const type = selectedType();
  if (OTP_TYPES.has(type)) {
    if (!verification.token) {
      setFormError('Verify the code the service sent before creating this claim.');
      return;
    }
    if (otpTarget() !== verification.target) {
      setFormError(`The code was verified for ${verification.target}. Send a new code for the changed value.`);
      return;
    }
  }
  setFormError('');
  setBusy(true);
  createBtn.textContent = 'Waiting for your signature…';
  try {
    const result = await window.freedomAPI.aquaCreateClaim({ type, fields: collectFields() });
    if (!result?.success) {
      setFormError(errorText(result, 'The claim could not be created.'));
      return;
    }
    cancelForm();
    hideNotice();
    await loadClaims();
  } finally {
    createBtn.textContent = 'Create and sign';
    setBusy(false);
  }
}

function cancelForm() {
  form.reset();
  syncTypeFields();
}

// Enter in a field submits the form; the work hangs off the button so the
// two paths are one.
function onSubmit(event) {
  event.preventDefault();
  createClaim();
}

typeSelect.addEventListener('change', syncTypeFields);
inputs.email.addEventListener('input', resetVerification);
inputs.phone.addEventListener('input', resetVerification);
sendCodeBtn.addEventListener('click', sendCode);
verifyCodeBtn.addEventListener('click', verifyCode);
form.addEventListener('submit', onSubmit);
createBtn.addEventListener('click', createClaim);
cancelBtn.addEventListener('click', cancelForm);

if (typeof window.freedomAPI.onAquaClaimsChanged === 'function') {
  window.freedomAPI.onAquaClaimsChanged(() => {
    loadStatus().then(loadClaims);
  });
}

syncTypeFields();
loadStatus().then(loadClaims);
