// Identity claims — freedom://identity
//
// freedomAPI is exposed by webview-preload.js via contextBridge. Every value
// shown here came from the identity service or the user, so rows are built
// with DOM APIs and textContent, never HTML strings (#432). Icons are spans
// the stylesheet masks (`.ico.ico-<name>`), so no SVG is built here either.

const $ = (id) => document.getElementById(id);

const claimsEl = $('claims-list');
const claimsEmpty = $('claims-empty');
const sharedEl = $('shared-claims');
const issuedEl = $('issued-list');
const statusNotice = $('status-notice');
const walletLine = $('wallet-line');
const statusWallet = $('status-wallet');
const statusService = $('status-service');
const statusCaps = $('status-caps');
const claimsCount = $('claims-count');
const sharedCount = $('shared-count');
const issuedCount = $('issued-count');
const statusLock = $('status-lock');
const signinCard = $('signin-card');
const signinText = $('signin-text');
const signinBtn = $('signin-btn');
const signinError = $('signin-error');
const serviceDown = $('service-down');
const serviceDownText = $('service-down-text');
const serviceRetryBtn = $('service-retry-btn');
const serviceSettingsBtn = $('service-settings-btn');
const SETTINGS_IDENTITY_URL = 'freedom://settings/identity';
const lockedCard = $('locked-card');
const lockedTitle = $('locked-title');
const lockedText = $('locked-text');
const unlockBtn = $('unlock-btn');

// Add a claim
const addClaimBtn = $('add-claim-btn');
const addClaimDialog = $('add-claim-dialog');
const form = $('claim-form');
const kindButtons = {
  name: $('kind-name'),
  email: $('kind-email'),
  phone: $('kind-phone'),
  domain: $('kind-domain'),
};
const fieldGroups = {
  name: $('fields-name'),
  email: $('fields-email'),
  phone: $('fields-phone'),
  domain: $('fields-domain'),
};
const inputs = {
  givenName: $('given-name'),
  familyName: $('family-name'),
  middleName: $('middle-name'),
  nickname: $('nickname'),
  email: $('email'),
  phone: $('phone-number'),
  domain: $('domain'),
  code: $('code'),
};
const codeSection = $('code-section');
const sendCodeBtn = $('send-code-btn');
const verifyCodeBtn = $('verify-code-btn');
const codeStatus = $('code-status');
const formError = $('form-error');
const createBtn = $('create-btn');

// Per-claim modals
const shareDialog = $('share-dialog');
const shareSummary = $('share-summary');
const shareAddress = $('share-address');
const shareBtn = $('share-btn');
const shareError = $('share-error');
const importDialog = $('import-dialog');
const importSummary = $('import-summary');
const importText = $('import-text');
const importFile = $('import-file');
const importBtn = $('import-btn');
const importError = $('import-error');
const dnsDialog = $('dns-dialog');
const dnsSummary = $('dns-summary');
const dnsBody = $('dns-body');
const dnsCheckBtn = $('dns-check-btn');
const removeDialog = $('remove-dialog');
const removeSummary = $('remove-summary');
const removeBtn = $('remove-btn');
const removeError = $('remove-error');
const attestDialog = $('attest-dialog');
const attestSummary = $('attest-summary');
const attestWords = $('attest-words');
const attestBtn = $('attest-btn');
const attestError = $('attest-error');

// Requests
const requestOpenBtn = $('request-open-btn');
const requestDialog = $('request-dialog');
const requestInput = $('request-input');
const requestBtn = $('request-btn');
const requestStatus = $('request-status');
const requestCancel = $('request-cancel');
const responseBox = $('response-box');
const responseOutput = $('response-output');
const responseCopy = $('response-copy');

const TYPE_LABELS = { name: 'Name', email: 'Email', phone: 'Phone', domain: 'Domain' };
const TYPE_ICONS = { name: 'user', email: 'mail', phone: 'phone', domain: 'globe' };
const OTP_TYPES = new Set(['email', 'phone']);

// One-time-code state for the email/phone flow: the target the code was
// sent to and the token the service handed back once it was entered.
let verification = { target: null, token: null };
let busy = false;
let selectedKind = 'name';
// From the last status read: whether this profile has a wallet at all, so a
// locked-store answer reads as "set one up" rather than "unlock it".
let hasVault = true;
// Whether the configured service runs the email/phone code round trip; a
// bare node does not, so those claim kinds are offered only when it does.
let outOfBandVerification = true;
let activeAddress = '';
// Whether the service holds a session for the active wallet. Until it does
// the page shows the sign-in card and loads nothing that would need one.
let signedIn = false;
let serviceReachable = true;
// The claim or shared entry a modal is open for.
let current = null;
// Attestations this wallet issued, by the revision they vouch for: a share
// already attested says so instead of offering Attest again.
let issuedByClaimTip = new Map();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function icon(name) {
  const node = el('span', `ico ico-${name}`);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

function button(className, iconName, label) {
  const btn = el('button', className);
  btn.type = 'button';
  if (iconName) btn.appendChild(icon(iconName));
  btn.appendChild(document.createTextNode(label));
  return btn;
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

// The kind of a claim another wallet shared or that an attestation was
// issued for, from the template name or the payload's shape.
function sharedType(templateName, payload) {
  const tn = String(templateName || '').toLowerCase();
  const p = payload || {};
  if (tn.includes('email') || p.email) return 'email';
  if (tn.includes('phone') || p.phone_number) return 'phone';
  if (tn.includes('dns') || tn.includes('domain') || p.domain_name) return 'domain';
  return 'name';
}

function formatTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// A DID shown in a row: its address part, with the whole DID on hover.
function shortDid(did) {
  const s = String(did || '');
  const addr = s.slice(s.lastIndexOf(':') + 1);
  return addr.length > 14 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr || s;
}

function showNotice(kind, message) {
  statusNotice.className = kind ? `notice ${kind}` : 'notice';
  statusNotice.replaceChildren(icon(kind === 'error' ? 'x-circle' : kind === 'warn' ? 'alert' : 'check-circle'), el('span', null, message));
  statusNotice.classList.remove('hidden');
}

function hideNotice() {
  statusNotice.classList.add('hidden');
}

function setError(node, message) {
  node.textContent = message || '';
  node.classList.toggle('hidden', !message);
}

function setFormError(message) {
  setError(formError, message);
}

function setBusy(on) {
  busy = on;
  createBtn.disabled = on;
  sendCodeBtn.disabled = on;
  verifyCodeBtn.disabled = on || !verification.target || Boolean(verification.token);
}

function setLabel(btn, iconName, label) {
  btn.replaceChildren(icon(iconName), document.createTextNode(label));
}

function errorText(result, fallback) {
  const err = result && result.error;
  if (!err) return fallback;
  if (err.code === 'VAULT_LOCKED') {
    return hasVault ? 'Unlock your wallet first.' : 'Set up your wallet in the sidebar first.';
  }
  if (err.code === 'DISABLED') return 'Enable Identity & Wallet under Settings → Identity to use identity claims.';
  return err.message || fallback;
}

// ── Modals ───────────────────────────────────────────────────────────────
// Native <dialog>s. The test harness's fake elements have no showModal, so
// the open state falls back to the `open` property the browser would set
// itself.

const onClose = new Map();

function openDialog(dialog, focusTarget) {
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.open = true;
  }
  if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus();
}

function closeDialog(dialog) {
  if (typeof dialog.close === 'function') {
    dialog.close();
  } else {
    dialog.open = false;
    const reset = onClose.get(dialog);
    if (reset) reset();
  }
}

// Wire a dialog's close buttons and its reset, which runs on Escape too.
function wireDialog(dialog, closeIds, reset) {
  if (reset) {
    onClose.set(dialog, reset);
    dialog.addEventListener('close', reset);
  }
  for (const id of closeIds) $(id)?.addEventListener('click', () => closeDialog(dialog));
}

function emptyState(iconName, title) {
  const box = el('div', 'empty');
  box.appendChild(icon(iconName));
  box.appendChild(el('div', 'empty-title', title));
  return box;
}

// A claim quoted inside a modal: icon, value, kind and signer.
function summaryOf(type, value, sub) {
  const box = el('div', 'summary');
  const ic = el('span', 'claim-icon');
  ic.appendChild(icon(TYPE_ICONS[type] || 'shield'));
  box.appendChild(ic);
  const title = el('div', 'claim-title');
  title.appendChild(el('div', 'claim-value', value));
  const line = el('div', 'claim-sub');
  line.appendChild(el('span', null, TYPE_LABELS[type] || type));
  if (sub) line.appendChild(el('span', 'mono', sub));
  title.appendChild(line);
  box.appendChild(title);
  return box;
}

// ── Claims list ──────────────────────────────────────────────────────────

function renderEmpty() {
  claimsEl.replaceChildren();
  claimsEmpty.classList.remove('hidden');
}

function badge(className, iconName, label) {
  const b = el('span', `badge ${className}`.trim());
  b.appendChild(icon(iconName));
  b.appendChild(document.createTextNode(label));
  return b;
}

function statusBadge(claim) {
  const attested = (claim.attestations || []).filter((a) => a.verification?.isValid !== false);
  if (claim.verification && claim.verification.isValid === false) {
    return badge('invalid', 'x-circle', 'Verification failed');
  }
  if (attested.length > 0) {
    return badge('attested', 'check-circle', attested.length === 1 ? 'Attested' : `Attested ×${attested.length}`);
  }
  return badge('', 'pen', 'Self-signed');
}

function statusLine(state, iconName, text) {
  const line = el('div', `status-line ${state}`);
  line.appendChild(icon(iconName));
  line.appendChild(el('span', null, text));
  return line;
}

function techRow(rows, label, value) {
  rows.appendChild(el('span', 'label', label));
  if (typeof value === 'string') rows.appendChild(el('span', 'mono', value));
  else rows.appendChild(value);
}

function claimHead(type, value, subParts, badgeNode) {
  const head = el('div', 'claim-head');
  const ic = el('span', 'claim-icon');
  ic.appendChild(icon(TYPE_ICONS[type] || 'shield'));
  head.appendChild(ic);
  const title = el('div', 'claim-title');
  title.appendChild(el('div', 'claim-value', value));
  const sub = el('div', 'claim-sub');
  for (const part of subParts) sub.appendChild(typeof part === 'string' ? el('span', null, part) : part);
  title.appendChild(sub);
  head.appendChild(title);
  if (badgeNode) head.appendChild(badgeNode);
  return head;
}

// One attestation: who, a state chip, and their words folded to two lines
// until clicked. The failure reason or the pending hint is one small line.
function renderAttestation(a) {
  const state = a.verification?.isValid ? 'ok' : a.pending ? 'wait' : 'bad';
  const box = el('div', state === 'ok' ? 'attestation' : state === 'wait' ? 'attestation pending' : 'attestation invalid');
  const source = el('span', 'source');
  const service = a.source === 'service';
  source.appendChild(icon(service ? 'server' : 'user'));
  source.appendChild(document.createTextNode(service ? 'Service' : 'Peer'));
  box.appendChild(source);
  const who = el('span', 'who mono', a.attesterDid ? shortDid(a.attesterDid) : '(unknown attester)');
  who.title = a.attesterDid || '';
  box.appendChild(who);
  box.appendChild(
    state === 'ok'
      ? badge('attested', 'check-circle', 'Verified')
      : state === 'wait'
        ? badge('pending', 'clock', 'Pending')
        : badge('invalid', 'x-circle', 'Not verified')
  );
  if (a.context) {
    const words = el('div', 'words', a.context);
    words.title = 'Show more';
    words.addEventListener('click', () => {
      const open = words.classList.toggle('expanded');
      words.title = open ? 'Show less' : 'Show more';
    });
    box.appendChild(words);
  }
  if (state === 'wait') {
    box.appendChild(el('div', 'state wait', 'Recorded by the service. Freedom fetches it once the attester shares it back; or import it here.'));
  } else if (state === 'bad') {
    box.appendChild(el('div', 'state bad', `Not verified: ${a.verification?.status || 'unknown'}`));
  }
  return box;
}

function renderClaim(claim) {
  const card = el('div', 'card');
  card.dataset.id = claim.id;

  card.appendChild(
    claimHead(claim.type, claimValue(claim), [TYPE_LABELS[claim.type] || claim.type, '·', `signed ${formatTime(claim.signedAt)}`], statusBadge(claim))
  );

  const body = el('div', 'claim-body');
  const verification = claim.verification || {};
  if (verification.isValid) {
    const status = verification.status && verification.status !== 'OK' ? ` (${verification.status})` : '';
    body.appendChild(
      statusLine('ok', 'check-circle', `Chain and signature verified${status} · ${formatTime(verification.checkedAt)}`)
    );
  } else {
    body.appendChild(statusLine('bad', 'x-circle', `Not verified: ${verification.status || 'unknown'}`));
  }
  if (claim.type === 'domain') {
    const dns = claim.domainVerification || 'pending';
    const said = claim.dnsCheck?.message ? `DNS check: ${dns} · ${claim.dnsCheck.message}` : `DNS check: ${dns}`;
    body.appendChild(statusLine(dns === 'verified' ? 'ok' : dns === 'pending' ? 'wait' : 'bad', 'globe', said));
  }

  body.appendChild(el('div', 'att-title', 'Attestations'));
  const attestations = claim.attestations || [];
  if (attestations.length === 0) {
    body.appendChild(statusLine('', 'pen', 'None yet. Only you have signed this claim.'));
  } else {
    for (const a of attestations) body.appendChild(renderAttestation(a));
  }

  const tech = el('details', 'tech');
  tech.appendChild(el('summary', null, 'Technical details'));
  const rows = el('div', 'tech-rows');
  techRow(rows, 'Signer', claim.signerDid || '');
  techRow(rows, 'Revision', claim.tip || '');
  techRow(rows, 'Created', el('span', null, formatTime(claim.createdAt)));
  tech.appendChild(rows);
  body.appendChild(tech);
  card.appendChild(body);

  const actions = el('div', 'actions');
  if (claim.type === 'domain') {
    const dnsBtn = button('btn small', 'globe', 'DNS record');
    dnsBtn.addEventListener('click', () => openDnsDialog(claim));
    actions.appendChild(dnsBtn);
    const checkBtn = button('btn small', 'check', 'Check DNS');
    checkBtn.addEventListener('click', () => openDnsDialog(claim, { check: true }));
    actions.appendChild(checkBtn);
  }
  const share = button('btn small', 'share', 'Share for attestation');
  share.addEventListener('click', () => openShareDialog(claim));
  actions.appendChild(share);
  const pull = button('btn small', 'pull', 'Pull attestations');
  pull.addEventListener('click', () => pullAttestations(claim));
  actions.appendChild(pull);
  const imp = button('btn small', 'import', 'Import attestation');
  imp.addEventListener('click', () => openImportDialog(claim));
  actions.appendChild(imp);
  actions.appendChild(el('span', 'spacer'));
  const refresh = button('btn small', 'refresh', 'Re-verify');
  refresh.addEventListener('click', () => refreshClaim(claim));
  actions.appendChild(refresh);
  const remove = button('btn small danger', 'trash', 'Remove');
  remove.addEventListener('click', () => openRemoveDialog(claim));
  actions.appendChild(remove);
  card.appendChild(actions);

  return card;
}

// A locked store is already said once, on the locked card: a list that
// cannot be read stays empty rather than repeating it.
function isLocked(result) {
  return result?.error?.code === 'VAULT_LOCKED';
}

// Attestations recorded on the identity service since the claim was last
// looked at (a peer's, or the service's own): pulled for every claim when
// the page opens, so they show up without a click. A pull that fails
// leaves that claim as listed.
async function pullAll(claims) {
  return Promise.all(
    claims.map(async (claim) => {
      try {
        const result = await window.freedomAPI.aquaPullAttestations(claim.id);
        return result?.success && result.claim?.id === claim.id ? result.claim : claim;
      } catch {
        return claim;
      }
    })
  );
}

async function loadClaims({ pull = false } = {}) {
  const result = await window.freedomAPI.aquaListClaims();
  if (!result?.success) {
    claimsEmpty.classList.add('hidden');
    claimsCount.textContent = '0';
    claimsEl.replaceChildren();
    if (!isLocked(result)) claimsEl.appendChild(el('div', 'meta', errorText(result, 'Claims could not be loaded.')));
    return;
  }
  const listed = result.claims || [];
  claimsCount.textContent = String(listed.length);
  if (listed.length === 0) {
    renderEmpty();
    return;
  }
  const claims = pull ? await pullAll(listed) : listed;
  claimsEmpty.classList.add('hidden');
  const sorted = [...claims].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  claimsEl.replaceChildren(...sorted.map(renderClaim));
}

async function loadStatus() {
  const result = await window.freedomAPI.aquaStatus();
  if (!result?.success) {
    showNotice('warn', errorText(result, 'Identity claims are unavailable.'));
    showLocked(false, false);
    walletLine.textContent = '';
    statusWallet.textContent = '—';
    statusService.textContent = '—';
    statusCaps.textContent = '';
    return;
  }
  hideNotice();
  hasVault = result.hasVault !== false;
  activeAddress = (result.vaultUnlocked && result.wallet?.address) || '';
  outOfBandVerification = result.service ? result.service.outOfBandVerification !== false : true;
  kindButtons.email.disabled = !outOfBandVerification;
  kindButtons.phone.disabled = !outOfBandVerification;
  if (!outOfBandVerification && OTP_TYPES.has(selectedKind)) selectKind('name');
  const parts = [];
  if (result.wallet?.address) parts.push(`Wallet ${result.wallet.address}`);
  parts.push(`Identity service ${result.nodeUrl}`);
  let caps = '';
  const down = Boolean(result.service && result.service.reachable === false);
  serviceReachable = !down;
  showServiceDown(down, result.nodeUrl);
  if (down) caps = 'unreachable';
  else if (!outOfBandVerification) caps = 'no email or phone verification on this service';
  signedIn = result.signedIn === true;
  if (caps) parts.push(caps);
  walletLine.textContent = parts.join(' · ');
  statusWallet.textContent = result.wallet?.address || 'none';
  statusWallet.title = result.wallet?.address || '';
  statusService.textContent = result.nodeUrl || '';
  statusCaps.textContent = caps;
  const locked = Boolean(result.hasVault && !result.vaultUnlocked);
  showLocked(!result.hasVault, locked);
  showSignIn(Boolean(result.hasVault && result.vaultUnlocked && activeAddress && !down && !signedIn), result.nodeUrl);
  watchLock(locked);
  if (result.hasVault && result.vaultUnlocked && result.wallet && result.wallet.canSign === false) {
    showNotice('warn', 'A multi-owner account cannot sign identity claims. Switch to another wallet.');
  }
}

// The wallet is open but the service holds no session for it yet. The
// page stays on this card until the sign-in message is signed, so the
// sidebar's signature screen is never something the page has moved on from.
function showSignIn(needed, nodeUrl) {
  signinCard.classList.toggle('hidden', !needed);
  if (needed) {
    signinText.textContent = `Your wallet signs a message to sign in to ${nodeUrl || 'the identity service'}. Confirm it in the sidebar; nothing else is sent.`;
    setError(signinError, '');
  }
  addClaimBtn.disabled = addClaimBtn.disabled || needed;
  requestOpenBtn.disabled = requestOpenBtn.disabled || needed;
}

// Everything the page lists needs the vault open and, for the service's
// side, a session: load only once both are there.
// `pull` asks the service for new attestations on every claim. Only the
// page's own open does that: a pull is a mutation and is broadcast as a
// claims change, so pulling again on that event would never stop.
async function loadAll({ pull = false } = {}) {
  if (!signedIn) {
    claimsEl.replaceChildren();
    claimsEmpty.classList.add('hidden');
    sharedEl.replaceChildren();
    issuedEl.replaceChildren();
    return;
  }
  await Promise.all([loadClaims({ pull }), loadIssued()]);
  await loadShared();
}

async function signIn() {
  signinBtn.disabled = true;
  setLabel(signinBtn, 'clock', 'Waiting for your signature…');
  setError(signinError, '');
  try {
    const result = await window.freedomAPI.aquaSignIn();
    if (!result?.success) {
      setError(signinError, errorText(result, 'The sign-in was not confirmed.'));
      return;
    }
  } finally {
    signinBtn.disabled = false;
    setLabel(signinBtn, 'pen', 'Sign in with my wallet');
  }
  await loadStatus();
  await loadAll();
}

// The service did not answer: one card, with the setting that changes it.
function showServiceDown(down, nodeUrl) {
  serviceDown.classList.toggle('hidden', !down);
  if (down) {
    serviceDownText.textContent = `Freedom could not reach ${nodeUrl || 'the identity service'}. Claims cannot be created, verified or shared until it answers. Change the service under Settings → Identity.`;
  }
}

// The one place a missing or locked wallet is said. While it is, the lists
// stay empty and the actions that need the vault are disabled. They start
// disabled in the markup, so nothing is clickable before the first status
// answer either.
function showLocked(missing, locked) {
  const blocked = missing || locked;
  lockedCard.classList.toggle('hidden', !blocked);
  statusLock.classList.toggle('hidden', !locked);
  unlockBtn.classList.toggle('hidden', !locked);
  addClaimBtn.disabled = blocked || !serviceReachable;
  requestOpenBtn.disabled = blocked || !serviceReachable;
  if (missing) {
    lockedTitle.textContent = 'No wallet yet';
    lockedText.textContent = 'Set up your wallet in the sidebar before creating identity claims.';
  } else if (locked) {
    lockedTitle.textContent = 'Your wallet is locked';
    lockedText.textContent = 'Claims are kept encrypted with your wallet seed, so they are readable only while it is unlocked.';
  }
}

async function refreshClaim(claim) {
  const result = await window.freedomAPI.aquaRefreshClaim(claim.id);
  if (!result?.success) showNotice('error', errorText(result, 'Could not re-verify the claim.'));
  await loadClaims();
}

// ── Remove ───────────────────────────────────────────────────────────────

function openRemoveDialog(claim) {
  current = claim;
  removeSummary.replaceChildren(summaryOf(claim.type, claimValue(claim), claim.signerDid));
  setError(removeError, '');
  openDialog(removeDialog, $('remove-cancel'));
}

async function removeClaim() {
  if (!current) return;
  const claim = current;
  removeBtn.disabled = true;
  const result = await window.freedomAPI.aquaRemoveClaim(claim.id);
  removeBtn.disabled = false;
  if (!result?.success) {
    setError(removeError, errorText(result, 'Could not remove the claim.'));
    return;
  }
  closeDialog(removeDialog);
  await loadClaims();
}

// ── DNS ──────────────────────────────────────────────────────────────────

function dnsRow(label, value) {
  const row = el('div', 'dns-row');
  row.appendChild(el('span', 'label', label));
  row.appendChild(el('span', 'mono', value));
  const copy = button('btn small', 'copy', 'Copy');
  copy.addEventListener('click', async () => {
    await window.freedomAPI.copyText(value);
    setLabel(copy, 'check', 'Copied');
  });
  row.appendChild(copy);
  return row;
}

// The DNS dialog: the record to publish, and under it the outcome of the
// last check. Both Check DNS buttons run the check here, so the result is
// read next to the record it is about; the dialog stays open.
const dnsResult = el('div', 'dns-result');

function renderDnsResult(check) {
  if (!check || !check.status) {
    dnsResult.replaceChildren();
    return;
  }
  const ok = check.status === 'verified';
  const text = check.message || `DNS check: ${check.status}`;
  dnsResult.replaceChildren(statusLine(ok ? 'ok' : 'bad', ok ? 'check-circle' : 'x-circle', text));
  if (check.checkedAt) dnsResult.appendChild(el('div', 'meta', `Checked ${formatTime(check.checkedAt)}`));
}

async function openDnsDialog(claim, { check = false } = {}) {
  current = claim;
  dnsSummary.replaceChildren(summaryOf(claim.type, claimValue(claim), claim.signerDid));
  dnsBody.replaceChildren(el('p', 'meta', 'Fetching the record…'));
  dnsCheckBtn.disabled = false;
  setLabel(dnsCheckBtn, 'check', claim.dnsCheck ? 'Check again' : 'Check DNS');
  openDialog(dnsDialog, $('dns-cancel'));
  const result = await window.freedomAPI.aquaDnsInstructions(claim.id);
  if (current !== claim) return;
  if (!result?.success) {
    dnsBody.replaceChildren(el('div', 'field-error', errorText(result, 'DNS instructions are unavailable.')));
    return;
  }
  // The identity service answers `txt_name` / `txt_value` (plus `domain`).
  const name = result.txt_name || result.record_name || result.name || '';
  const value = result.txt_value || result.record_value || result.value || '';
  renderDnsResult(claim.dnsCheck);
  dnsBody.replaceChildren(
    el('p', 'meta', 'Add this TXT record at your DNS provider, then press Check DNS.'),
    dnsRow('Name', name),
    dnsRow('Value', value),
    dnsResult
  );
  if (check) await verifyDns(claim);
}

// Ask the service to look the record up now; the outcome goes under the
// record in the dialog and onto the claim card.
async function verifyDns(claim) {
  dnsCheckBtn.disabled = true;
  setLabel(dnsCheckBtn, 'clock', 'Checking…');
  dnsResult.replaceChildren(el('div', 'meta', 'Looking the record up…'));
  const result = await window.freedomAPI.aquaVerifyDns(claim.id);
  dnsCheckBtn.disabled = false;
  setLabel(dnsCheckBtn, 'check', 'Check again');
  if (!result?.success) {
    dnsResult.replaceChildren(statusLine('bad', 'x-circle', errorText(result, 'The DNS check failed.')));
    return;
  }
  renderDnsResult(result.claim?.dnsCheck || { status: result.claim?.domainVerification || 'pending' });
  await loadClaims();
}

// ── Attestation: owner side ──────────────────────────────────────────────

function openShareDialog(claim) {
  current = claim;
  shareSummary.replaceChildren(summaryOf(claim.type, claimValue(claim), claim.signerDid));
  shareAddress.value = '';
  setError(shareError, '');
  openDialog(shareDialog, shareAddress);
}

async function shareClaim() {
  if (!current) return;
  const claim = current;
  const address = shareAddress.value.trim();
  if (!address) {
    setError(shareError, "Enter the attester's wallet address.");
    return;
  }
  shareBtn.disabled = true;
  const result = await window.freedomAPI.aquaShareClaim(claim.id, address);
  shareBtn.disabled = false;
  if (!result?.success) {
    setError(shareError, errorText(result, 'The claim could not be shared.'));
    return;
  }
  closeDialog(shareDialog);
  showNotice('', 'Shared. Ask the attester to open freedom://identity#attest, attest it there, and send you the attestation.');
  await loadClaims();
}

async function pullAttestations(claim) {
  const result = await window.freedomAPI.aquaPullAttestations(claim.id);
  if (!result?.success) showNotice('error', errorText(result, 'Attestations could not be fetched.'));
  else hideNotice();
  await loadClaims();
}

function openImportDialog(claim) {
  current = claim;
  importSummary.replaceChildren(summaryOf(claim.type, claimValue(claim), claim.signerDid));
  importText.value = '';
  importFile.value = '';
  setError(importError, '');
  openDialog(importDialog, importText);
}

importFile.addEventListener('change', () => {
  const chosen = importFile.files && importFile.files[0];
  if (!chosen) return;
  const reader = new FileReader();
  reader.onload = () => {
    importText.value = String(reader.result || '');
  };
  reader.readAsText(chosen);
});

async function importAttestation() {
  if (!current) return;
  const claim = current;
  const json = importText.value.trim();
  if (!json) {
    setError(importError, 'Paste or choose the attestation first.');
    return;
  }
  importBtn.disabled = true;
  const result = await window.freedomAPI.aquaImportAttestation(claim.id, json);
  importBtn.disabled = false;
  if (!result?.success) {
    setError(importError, errorText(result, 'The attestation could not be imported.'));
    return;
  }
  closeDialog(importDialog);
  hideNotice();
  await loadClaims();
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

// When the owner shared the claim, as the service recorded it. Left out
// when the service did not say, rather than shown as an empty row.
function sharedOnRow(rows, entry) {
  if (!entry.sharedAt) return;
  techRow(rows, 'Shared on', el('span', null, formatTime(entry.sharedAt)));
}

// A share the service lists but cannot show: said on its own card, with
// the reason, instead of vanishing from the list.
function renderUnreadableShare(entry) {
  const card = el('div', 'card');
  card.dataset.contract = entry.contractHash || '';
  card.appendChild(claimHead('shared', entry.fileName || 'Shared claim', ['Shared with you', '·', 'could not be read']));
  const body = el('div', 'claim-body');
  body.appendChild(statusLine('bad', 'x-circle', entry.reason || 'The service could not show this share.'));
  const tech = el('div', 'tech-rows');
  techRow(tech, 'Shared by', entry.sender || '');
  sharedOnRow(tech, entry);
  techRow(tech, 'Share', entry.contractHash || '');
  body.appendChild(tech);
  card.appendChild(body);
  return card;
}

function renderShared(entry) {
  if (entry.unavailable) return renderUnreadableShare(entry);
  const card = el('div', 'card');
  card.dataset.tip = entry.tip;
  const type = sharedType(entry.templateName, entry.payload);
  const mine = issuedByClaimTip.get(entry.tip);
  card.appendChild(
    claimHead(type, sharedValue(entry), [TYPE_LABELS[type], '·', 'shared with you'], mine ? badge('attested', 'check-circle', 'Attested by you') : null)
  );
  const body = el('div', 'claim-body');
  if (mine) {
    body.appendChild(
      statusLine('ok', 'check-circle', `You attested this ${formatTime(mine.createdAt)}. The owner's Freedom picks it up from the identity service; it is listed below.`)
    );
  }
  const tech = el('div', 'tech-rows');
  techRow(tech, 'Subject', (entry.payload && entry.payload.signer_did) || '');
  techRow(tech, 'Shared by', entry.sender || '');
  sharedOnRow(tech, entry);
  techRow(tech, 'Revision', entry.tip || '');
  body.appendChild(tech);
  card.appendChild(body);
  if (mine) return card;
  const actions = el('div', 'actions');
  actions.appendChild(el('span', 'spacer'));
  const attest = button('btn small primary', 'shield', 'Attest');
  attest.addEventListener('click', () => openAttestDialog(entry));
  actions.appendChild(attest);
  card.appendChild(actions);
  return card;
}

function openAttestDialog(entry) {
  current = entry;
  const type = sharedType(entry.templateName, entry.payload);
  attestSummary.replaceChildren(summaryOf(type, sharedValue(entry), (entry.payload && entry.payload.signer_did) || entry.sender || ''));
  attestWords.value = '';
  setError(attestError, '');
  openDialog(attestDialog, attestWords);
}

async function attestShared() {
  if (!current) return;
  const entry = current;
  const context = attestWords.value.trim();
  if (!context) {
    setError(attestError, 'Say in your own words what you are vouching for.');
    return;
  }
  attestBtn.disabled = true;
  setLabel(attestBtn, 'clock', 'Waiting for your signature…');
  const result = await window.freedomAPI.aquaAttestShared({ contractHash: entry.contractHash, tip: entry.tip, context });
  attestBtn.disabled = false;
  setLabel(attestBtn, 'pen', 'Attest with my wallet');
  if (!result?.success) {
    setError(attestError, errorText(result, 'The attestation could not be made.'));
    return;
  }
  closeDialog(attestDialog);
  showNotice('', "Attested. The owner's Freedom picks it up from the identity service; copy it as JSON below if they need it another way.");
  await loadIssued();
  await loadShared();
}

async function loadShared() {
  if (!activeAddress) {
    sharedEl.replaceChildren();
    return;
  }
  const result = await window.freedomAPI.aquaListShared();
  if (!result?.success) {
    sharedEl.replaceChildren();
    if (!isLocked(result)) sharedEl.appendChild(el('div', 'meta', errorText(result, 'Shared claims could not be loaded.')));
    return;
  }
  const shared = result.shared || [];
  sharedCount.textContent = String(shared.length);
  if (shared.length === 0) {
    sharedEl.replaceChildren(emptyState('inbox', 'Nothing has been shared with this wallet'));
    return;
  }
  sharedEl.replaceChildren(...shared.map(renderShared));
}

function renderIssued(entry) {
  const card = el('div', 'card');
  card.dataset.id = entry.id;
  const p = entry.subjectPayload || {};
  const type = sharedType(entry.templateName, p);
  const valid = Boolean(entry.verification?.isValid);
  card.appendChild(
    claimHead(
      type,
      sharedValue({ payload: p, fileName: '' }) || shortHash(entry.claimTip),
      [TYPE_LABELS[type], '·', `issued ${formatTime(entry.createdAt)}`],
      valid ? badge('attested', 'check-circle', 'Signed') : badge('', 'x-circle', 'Not verified')
    )
  );
  const body = el('div', 'claim-body');
  if (entry.context) body.appendChild(statusLine('', 'pen', entry.context));
  const tech = el('div', 'tech-rows');
  techRow(tech, 'Subject', entry.subjectDid || '');
  techRow(tech, 'Attestation', entry.tip || '');
  body.appendChild(tech);
  card.appendChild(body);
  const actions = el('div', 'actions');
  actions.appendChild(el('span', 'spacer'));
  const copyBtn = button('btn small', 'copy', 'Copy JSON');
  copyBtn.addEventListener('click', async () => {
    const result = await window.freedomAPI.aquaExportIssued(entry.id);
    if (!result?.success) {
      showNotice('error', errorText(result, 'The attestation could not be exported.'));
      return;
    }
    await window.freedomAPI.copyText(result.json);
    showNotice('', "Copied. The owner can import it under the claim if their Freedom has not picked it up.");
  });
  actions.appendChild(copyBtn);
  card.appendChild(actions);
  return card;
}

async function loadIssued() {
  const result = await window.freedomAPI.aquaListIssued();
  issuedByClaimTip = new Map();
  if (!result?.success) {
    issuedEl.replaceChildren();
    if (!isLocked(result)) issuedEl.appendChild(el('div', 'meta', errorText(result, 'Issued attestations could not be loaded.')));
    return;
  }
  const issued = result.issued || [];
  for (const entry of issued) if (entry.claimTip && !issuedByClaimTip.has(entry.claimTip)) issuedByClaimTip.set(entry.claimTip, entry);
  issuedCount.textContent = String(issued.length);
  if (issued.length === 0) {
    issuedEl.replaceChildren(emptyState('file', "You have not attested anyone's claim yet"));
    return;
  }
  issuedEl.replaceChildren(...issued.map(renderIssued));
}

// ── Disclosure: a request pasted by the user ─────────────────────────────

function resetRequestDialog() {
  requestInput.value = '';
  requestStatus.textContent = '';
  responseOutput.value = '';
  responseBox.classList.add('hidden');
  responseCopy.classList.add('hidden');
  $('request-box').classList.remove('hidden');
  requestBtn.classList.remove('hidden');
  requestCancel.textContent = 'Cancel';
}

function openRequestDialog() {
  resetRequestDialog();
  openDialog(requestDialog, requestInput);
}

async function reviewRequest() {
  const text = requestInput.value.trim();
  if (!text) {
    requestStatus.textContent = 'Paste the request first.';
    return;
  }
  requestBtn.disabled = true;
  requestStatus.textContent = 'Decide in the sidebar…';
  responseBox.classList.add('hidden');
  try {
    const result = await window.freedomAPI.aquaRespondToRequest(text);
    if (!result?.success) {
      requestStatus.textContent = errorText(result, 'The request could not be answered.');
      return;
    }
    responseOutput.value = JSON.stringify(result.response, null, 2);
    $('request-box').classList.add('hidden');
    responseBox.classList.remove('hidden');
    responseCopy.classList.remove('hidden');
    requestBtn.classList.add('hidden');
    requestCancel.textContent = 'Close';
    const count = (result.response.claims || []).length;
    requestStatus.textContent = count === 0 ? 'No claims shared' : `${count} claim${count === 1 ? '' : 's'} shared. Send the response to whoever asked.`;
  } finally {
    requestBtn.disabled = false;
  }
}

// ── Left nav: one panel at a time, addressed by hash (freedom://identity#attest) ──

const NAV_TARGETS = ['claims', 'attest', 'requests'];
// The Issued list used to be its own panel; its links land on Attest others.
const PANEL_ALIASES = { issued: 'attest' };

// The hash names a panel, never an element: no element carries one of
// these ids, so a hash navigation never scrolls to an anchor. The content
// column starts at the top on every switch regardless.
function showPanel(target) {
  const wanted = PANEL_ALIASES[target] || target;
  const name = NAV_TARGETS.includes(wanted) ? wanted : 'claims';
  for (const t of NAV_TARGETS) {
    $(`panel-${t}`)?.classList.toggle('active', t === name);
    $(`nav-${t}`)?.classList.toggle('active', t === name);
  }
  const layout = document.querySelector('.layout');
  if (layout && typeof layout.scrollTop === 'number') layout.scrollTop = 0;
  return name;
}

function routeFromHash() {
  const hash = typeof window.location?.hash === 'string' ? window.location.hash.replace(/^#/, '') : '';
  showPanel(hash);
}

for (const t of NAV_TARGETS) {
  $(`nav-${t}`)?.addEventListener('click', () => {
    showPanel(t);
    if (window.location && typeof window.location.hash === 'string') window.location.hash = t;
  });
}
if (typeof window.addEventListener === 'function') window.addEventListener('hashchange', routeFromHash);
routeFromHash();

async function unlockWallet() {
  unlockBtn.disabled = true;
  try {
    const result = await window.freedomAPI.aquaUnlock();
    if (!result?.success) showNotice('error', errorText(result, 'The wallet was not unlocked.'));
    else hideNotice();
  } finally {
    unlockBtn.disabled = false;
  }
  await loadStatus();
  // The unlock came from this page, so the sign-in message follows at once:
  // password, then signature, and only then the claims.
  if (!signedIn && !signinCard.classList.contains('hidden')) {
    await signIn();
    return;
  }
  await loadAll();
}
unlockBtn.addEventListener('click', unlockWallet);
signinBtn.addEventListener('click', signIn);
serviceRetryBtn.addEventListener('click', () => {
  serviceRetryBtn.disabled = true;
  loadStatus()
    .then(loadAll)
    .finally(() => {
      serviceRetryBtn.disabled = false;
    });
});
serviceSettingsBtn.addEventListener('click', () => {
  window.freedomAPI.openInNewTab?.(SETTINGS_IDENTITY_URL);
});

// An unlock made elsewhere (the sidebar's own prompts, a signing flow) is
// not announced to pages, so while the vault is locked the page re-reads
// its status every few seconds and fills in once it opens.
let lockPoll = null;
function watchLock(locked) {
  if (locked && !lockPoll) {
    lockPoll = setInterval(async () => {
      const result = await window.freedomAPI.aquaStatus();
      if (result?.success && result.vaultUnlocked) {
        clearInterval(lockPoll);
        lockPoll = null;
        await loadStatus();
        await loadAll();
      }
    }, 3000);
  } else if (!locked && lockPoll) {
    clearInterval(lockPoll);
    lockPoll = null;
  }
}

// ── Add a claim ──────────────────────────────────────────────────────────

function selectedType() {
  return selectedKind;
}

function selectKind(kind) {
  if (!fieldGroups[kind] || kindButtons[kind].disabled) return;
  selectedKind = kind;
  for (const [key, btn] of Object.entries(kindButtons)) btn.setAttribute('aria-pressed', key === kind ? 'true' : 'false');
  syncTypeFields();
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
  setLabel(createBtn, 'clock', 'Waiting for your signature…');
  try {
    const result = await window.freedomAPI.aquaCreateClaim({ type, fields: collectFields() });
    if (!result?.success) {
      setFormError(errorText(result, 'The claim could not be created.'));
      return;
    }
    closeDialog(addClaimDialog);
    hideNotice();
    await loadClaims();
  } finally {
    setLabel(createBtn, 'pen', 'Create and sign');
    setBusy(false);
  }
}

function resetForm() {
  if (typeof form.reset === 'function') form.reset();
  syncTypeFields();
}

function openAddClaim() {
  resetForm();
  selectKind(selectedKind);
  openDialog(addClaimDialog, inputs[selectedKind === 'name' ? 'givenName' : selectedKind]);
}

// Enter in a field submits the form; the work hangs off the button so the
// two paths are one.
function onSubmit(event) {
  event.preventDefault();
  createClaim();
}

for (const [kind, btn] of Object.entries(kindButtons)) btn.addEventListener('click', () => selectKind(kind));
inputs.email.addEventListener('input', resetVerification);
inputs.phone.addEventListener('input', resetVerification);
sendCodeBtn.addEventListener('click', sendCode);
verifyCodeBtn.addEventListener('click', verifyCode);
form.addEventListener('submit', onSubmit);
createBtn.addEventListener('click', createClaim);
addClaimBtn.addEventListener('click', openAddClaim);

wireDialog(addClaimDialog, ['cancel-btn', 'add-claim-close'], resetForm);
wireDialog(shareDialog, ['share-cancel', 'share-close']);
wireDialog(importDialog, ['import-cancel', 'import-close']);
wireDialog(attestDialog, ['attest-cancel', 'attest-close']);
wireDialog(dnsDialog, ['dns-cancel', 'dns-close']);
wireDialog(removeDialog, ['remove-cancel', 'remove-close']);
wireDialog(requestDialog, ['request-cancel', 'request-close'], resetRequestDialog);

shareBtn.addEventListener('click', shareClaim);
importBtn.addEventListener('click', importAttestation);
attestBtn.addEventListener('click', attestShared);
removeBtn.addEventListener('click', removeClaim);
dnsCheckBtn.addEventListener('click', () => {
  if (current && current.type === 'domain') verifyDns(current);
});
requestOpenBtn.addEventListener('click', openRequestDialog);
requestBtn.addEventListener('click', reviewRequest);
responseCopy.addEventListener('click', async () => {
  await window.freedomAPI.copyText(responseOutput.value);
  requestStatus.textContent = 'Response copied.';
});

if (typeof window.freedomAPI.onAquaClaimsChanged === 'function') {
  window.freedomAPI.onAquaClaimsChanged(() => {
    loadStatus().then(loadAll);
  });
}

syncTypeFields();
loadStatus().then(() => loadAll({ pull: true }));
