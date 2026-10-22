// Identity claims — freedom://identity
//
// freedomAPI is exposed by webview-preload.js via contextBridge. Every value
// shown here came from the identity service or the user, so rows are built
// with DOM APIs and textContent, never HTML strings (#432).

const claimsEl = document.getElementById('claims');
const claimsEmpty = document.getElementById('claims-empty');
const sharedEl = document.getElementById('shared-claims');
const issuedEl = document.getElementById('issued');
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
// Whether the configured service runs the email/phone code round trip; a
// bare node does not, so those claim kinds are offered only when it does.
let outOfBandVerification = true;
let activeAddress = '';

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
  statusNotice.className = kind ? `notice ${kind}` : 'notice';
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
      const who = el('div', null);
      who.appendChild(el('span', 'source', a.source === 'service' ? 'Service' : 'Peer'));
      who.appendChild(el('span', 'mono', a.attesterDid || '(unknown attester)'));
      box.appendChild(who);
      if (a.context) box.appendChild(el('div', 'meta', a.context));
      box.appendChild(
        el(
          'div',
          'meta',
          a.verification?.isValid
            ? 'Attestation verified'
            : a.pending
              ? 'Recorded by the service; the attester holds the tree. Import it below to verify.'
              : `Attestation not verified: ${a.verification?.status || 'unknown'}`
        )
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
  const shareBtn = el('button', 'btn', 'Share for attestation');
  shareBtn.type = 'button';
  shareBtn.addEventListener('click', () => toggleShareForm(claim, card));
  actions.appendChild(shareBtn);
  const pullBtn = el('button', 'btn', 'Pull attestations');
  pullBtn.type = 'button';
  pullBtn.addEventListener('click', () => pullAttestations(claim));
  actions.appendChild(pullBtn);
  const importBtn = el('button', 'btn', 'Import attestation');
  importBtn.type = 'button';
  importBtn.addEventListener('click', () => toggleImportForm(claim, card));
  actions.appendChild(importBtn);
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
  activeAddress = (result.vaultUnlocked && result.wallet?.address) || '';
  outOfBandVerification = result.service ? result.service.outOfBandVerification !== false : true;
  for (const option of typeSelect.querySelectorAll('option')) {
    if (option.value === 'email' || option.value === 'phone') option.disabled = !outOfBandVerification;
  }
  const parts = [];
  if (result.wallet?.address) parts.push(`Wallet ${result.wallet.address}`);
  parts.push(`Identity service ${result.nodeUrl}`);
  if (result.service && result.service.reachable === false) parts.push('unreachable');
  else if (!outOfBandVerification) parts.push('no email or phone verification on this service');
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

// ── Attestation: owner side ──────────────────────────────────────────────

function removeForms(card) {
  for (const form of card.querySelectorAll('.inline-form')) form.remove();
}

function toggleShareForm(claim, card) {
  const existing = card.querySelector('.inline-form.share');
  removeForms(card);
  if (existing) return;
  const form = el('div', 'inline-form share');
  const input = el('input', 'mono-input');
  input.type = 'text';
  input.placeholder = "Attester's wallet address (0x…)";
  input.setAttribute('aria-label', "Attester's wallet address");
  form.appendChild(input);
  const btn = el('button', 'btn primary', 'Share');
  btn.type = 'button';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const result = await window.freedomAPI.aquaShareClaim(claim.id, input.value.trim());
    btn.disabled = false;
    if (!result?.success) {
      showNotice('error', errorText(result, 'The claim could not be shared.'));
      return;
    }
    hideNotice();
    showNotice('', `Shared. Ask the attester to open freedom://identity, attest it under "Attest for someone else", and send you the attestation.`);
    await loadClaims();
  });
  form.appendChild(btn);
  form.appendChild(
    el('span', 'inline-note', 'The attester needs an account on the same identity service, under that wallet.')
  );
  card.appendChild(form);
  input.autofocus = true;
}

async function pullAttestations(claim) {
  const result = await window.freedomAPI.aquaPullAttestations(claim.id);
  if (!result?.success) showNotice('error', errorText(result, 'Attestations could not be fetched.'));
  else hideNotice();
  await loadClaims();
}

function toggleImportForm(claim, card) {
  const existing = card.querySelector('.inline-form.import');
  removeForms(card);
  if (existing) return;
  const form = el('div', 'inline-form import');
  const area = el('textarea', null);
  area.placeholder = 'Paste the attestation tree JSON the attester sent you';
  area.setAttribute('aria-label', 'Attestation tree JSON');
  form.appendChild(area);
  const file = el('input', null);
  file.type = 'file';
  file.accept = '.json,application/json';
  file.setAttribute('aria-label', 'Attestation file');
  file.addEventListener('change', () => {
    const chosen = file.files && file.files[0];
    if (!chosen) return;
    const reader = new FileReader();
    reader.onload = () => {
      area.value = String(reader.result || '');
    };
    reader.readAsText(chosen);
  });
  form.appendChild(file);
  const btn = el('button', 'btn primary', 'Import');
  btn.type = 'button';
  btn.addEventListener('click', async () => {
    const json = area.value.trim();
    if (!json) {
      showNotice('error', 'Paste or choose the attestation first.');
      return;
    }
    btn.disabled = true;
    const result = await window.freedomAPI.aquaImportAttestation(claim.id, json);
    btn.disabled = false;
    if (!result?.success) {
      showNotice('error', errorText(result, 'The attestation could not be imported.'));
      return;
    }
    hideNotice();
    await loadClaims();
  });
  form.appendChild(btn);
  card.appendChild(form);
  area.autofocus = true;
}

// ── Attestation: attester side ───────────────────────────────────────────

function sharedValue(entry) {
  const p = entry.payload || {};
  return (
    [p.given_name, p.middle_name, p.family_name].filter(Boolean).join(' ') ||
    p.email ||
    p.phone_number ||
    p.domain_name ||
    p.provider_id ||
    entry.fileName ||
    ''
  );
}

function renderShared(entry) {
  const card = el('div', 'card');
  card.dataset.tip = entry.tip;
  const head = el('div', 'claim-head');
  head.appendChild(el('span', 'claim-type', entry.templateName || 'claim'));
  head.appendChild(el('span', 'claim-value', sharedValue(entry)));
  card.appendChild(head);
  const rows = el('div', 'claim-rows');
  rows.appendChild(row('Subject', el('span', 'mono', (entry.payload && entry.payload.signer_did) || '')));
  rows.appendChild(row('Shared by', el('span', 'mono', entry.sender || '')));
  const tip = el('span', 'mono', shortHash(entry.tip));
  tip.title = entry.tip;
  rows.appendChild(row('Revision', tip));
  card.appendChild(rows);
  const form = el('div', 'inline-form attest');
  const input = el('input', null);
  input.type = 'text';
  input.placeholder = 'What you vouch for, in your words';
  input.setAttribute('aria-label', 'Attestation words');
  input.maxLength = 1200;
  form.appendChild(input);
  const btn = el('button', 'btn primary', 'Attest with my wallet');
  btn.type = 'button';
  btn.addEventListener('click', async () => {
    const context = input.value.trim();
    if (!context) {
      showNotice('error', 'Say in your own words what you are vouching for.');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Waiting for your signature…';
    const result = await window.freedomAPI.aquaAttestShared({ contractHash: entry.contractHash, tip: entry.tip, context });
    btn.disabled = false;
    btn.textContent = 'Attest with my wallet';
    if (!result?.success) {
      showNotice('error', errorText(result, 'The attestation could not be made.'));
      return;
    }
    hideNotice();
    showNotice('', 'Attested. Send the attestation under "Attestations you issued" to the claim\'s owner.');
    await loadIssued();
  });
  form.appendChild(btn);
  card.appendChild(form);
  return card;
}

async function loadShared() {
  if (!activeAddress) {
    sharedEl.replaceChildren(el('div', 'meta', 'Set up and unlock your wallet to see claims shared with you.'));
    return;
  }
  const result = await window.freedomAPI.aquaListShared();
  if (!result?.success) {
    sharedEl.replaceChildren(el('div', 'meta', errorText(result, 'Shared claims could not be loaded.')));
    return;
  }
  const shared = result.shared || [];
  if (shared.length === 0) {
    sharedEl.replaceChildren(el('div', 'meta', 'Nothing has been shared with this wallet.'));
    return;
  }
  sharedEl.replaceChildren(...shared.map(renderShared));
}

function renderIssued(entry) {
  const card = el('div', 'card');
  card.dataset.id = entry.id;
  const head = el('div', 'claim-head');
  head.appendChild(el('span', 'claim-type', entry.templateName || 'attestation'));
  const p = entry.subjectPayload || {};
  head.appendChild(el('span', 'claim-value', sharedValue({ payload: p, fileName: '' }) || shortHash(entry.claimTip)));
  head.appendChild(el('span', entry.verification?.isValid ? 'pill attested' : 'pill', entry.verification?.isValid ? 'Signed' : 'Not verified'));
  card.appendChild(head);
  const rows = el('div', 'claim-rows');
  rows.appendChild(row('Subject', el('span', 'mono', entry.subjectDid || '')));
  rows.appendChild(row('Your words', entry.context || ''));
  const tip = el('span', 'mono', shortHash(entry.tip));
  tip.title = entry.tip || '';
  rows.appendChild(row('Attestation', tip));
  rows.appendChild(row('Issued', formatTime(entry.createdAt)));
  card.appendChild(rows);
  const actions = el('div', 'actions');
  const copyBtn = el('button', 'btn', 'Copy JSON');
  copyBtn.type = 'button';
  copyBtn.addEventListener('click', async () => {
    const result = await window.freedomAPI.aquaExportIssued(entry.id);
    if (!result?.success) {
      showNotice('error', errorText(result, 'The attestation could not be exported.'));
      return;
    }
    await window.freedomAPI.copyText(result.json);
    showNotice('', "Copied. Send it to the claim's owner; they import it under the claim.");
  });
  actions.appendChild(copyBtn);
  card.appendChild(actions);
  return card;
}

async function loadIssued() {
  const result = await window.freedomAPI.aquaListIssued();
  if (!result?.success) {
    issuedEl.replaceChildren(el('div', 'meta', errorText(result, 'Issued attestations could not be loaded.')));
    return;
  }
  const issued = result.issued || [];
  if (issued.length === 0) {
    issuedEl.replaceChildren(el('div', 'meta', 'You have not attested anyone\'s claim yet.'));
    return;
  }
  issuedEl.replaceChildren(...issued.map(renderIssued));
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
    loadStatus().then(() => Promise.all([loadClaims(), loadShared(), loadIssued()]));
  });
}

syncTypeFields();
loadStatus().then(() => Promise.all([loadClaims(), loadShared(), loadIssued()]));
