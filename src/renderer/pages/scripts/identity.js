// Identity claims — freedom://identity
//
// freedomAPI is exposed by webview-preload.js via contextBridge. Every value
// shown here came from the identity service or the user, so rows are built
// with DOM APIs and textContent, never HTML strings (#432). Icons are spans
// the stylesheet masks (`.ico.ico-<name>`), so no SVG is built here either.
//
// Vocabulary on this page, kept to three words so a first visit needs no
// glossary: a *claim* is something you say about yourself and sign; it is
// *verified* once the node (a code, a DNS record) or a person who knows you
// has signed it too; asking a person to do that is asking them to *vouch*.
// "Attestation" stays in the technical rows and the JSON.
//
// The page is a record you can check: the claims are rows on the left, and
// the selected one shows its evidence on the right. Each claim carries two
// marks, the node's check (shield) and the people who vouch (one pip each);
// the icon names the source and the colour says only how it stands.

const $ = (id) => document.getElementById(id);

// Identity bar
const statusWallet = $('status-wallet');
const copyAddressBtn = $('copy-address-btn');
const statusLock = $('status-lock');
const walletLine = $('wallet-line');
const statusService = $('status-service');
const nodeUrlEl = $('node-url');
const nodeState = $('node-state');
const nodeStateText = $('node-state-text');
const nodeItemHost = $('node-item-host');
const nodeItemUrl = $('node-item-url');
const statusCaps = $('status-caps');
const nodeSettingsBtn = $('node-settings-btn');
const nodeMenu = $('node-menu');
const statusNotice = $('status-notice');
const claimsCount = $('claims-count');
const sharedCount = $('shared-count');
const contentEl = $('content');

// Readiness
const ready = $('ready');
const readyTitle = $('ready-title');
const readyLead = $('ready-lead');
const readyAsideTitle = $('ready-aside-title');
const readyAsideText = $('ready-aside-text');
const lockedCard = $('locked-card');
const lockedMark = $('locked-mark');
const lockedTitle = $('locked-title');
const lockedText = $('locked-text');
const unlockBtn = $('unlock-btn');
const serviceDown = $('service-down');
const serviceMark = $('service-mark');
const serviceDownText = $('service-down-text');
const serviceRetryBtn = $('service-retry-btn');
const serviceSettingsBtn = $('service-settings-btn');
const signinCard = $('signin-card');
const signinMark = $('signin-mark');
const signinText = $('signin-text');
const signinBtn = $('signin-btn');
const signinError = $('signin-error');
const SETTINGS_IDENTITY_URL = 'freedom://settings/identity';

// Me
const meSplit = $('me-split');
const claimsLine = $('claims-line');
const addClaimBtn = $('add-claim-btn');
const claimsEl = $('claims-list');
const claimsSlots = $('claims-slots');
const claimsEmpty = $('claims-empty');
const startNameBtn = $('start-name-btn');
const claimDetail = $('claim-detail');
const askView = $('ask-view');
const askTitle = $('ask-title');
const importView = $('import-view');

// Composer
const composer = $('composer');
const composerNode = $('composer-node');
const addClaimTitle = $('add-claim-title');
const kindHelp = $('kind-help');
const kindsNote = $('kinds-note');
const codeHelp = $('code-help');
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
const previewValue = $('preview-value');
const previewProof = $('preview-proof');
const codeSection = $('code-section');
const otpStepSend = $('otp-step-send');
const otpStepEnter = $('otp-step-enter');
const otpStepSign = $('otp-step-sign');
const otpSendNote = $('otp-send-note');
const otpEnterNote = $('otp-enter-note');
const sendCodeBtn = $('send-code-btn');
const verifyCodeBtn = $('verify-code-btn');
const codeStatus = $('code-status');
const formError = $('form-error');
const createBtn = $('create-btn');
const cancelBtn = $('cancel-btn');
const cancelComposeBtn = $('cancel-compose-btn');

// Ask someone to vouch, Import a vouch (views in the claim panel)
const shareSummary = $('share-summary');
const shareAddress = $('share-address');
const shareBtn = $('share-btn');
const shareError = $('share-error');
const importSummary = $('import-summary');
const importText = $('import-text');
const importFile = $('import-file');
const importBtn = $('import-btn');
const importError = $('import-error');

// All details, Remove (the two dialogs)
const vouchesDialog = $('vouches-dialog');
const vouchesSummary = $('vouches-summary');
const vouchesList = $('vouches-list');
const vouchesRemoveBtn = $('vouches-remove-btn');
const removeDialog = $('remove-dialog');
const removeSummary = $('remove-summary');
const removeGoes = $('remove-goes');
const removeBtn = $('remove-btn');
const removeError = $('remove-error');

// Vouches I give
const giveSplit = $('give-split');
const sharedLine = $('shared-line');
const sharedEl = $('shared-claims');
const sharedDetail = $('shared-detail');
const attestView = $('attest-view');
const sharedTech = $('shared-tech');
const attestWords = $('attest-words');
const attestBtn = $('attest-btn');
const attestError = $('attest-error');

// Requests
const requestInput = $('request-input');
const requestBtn = $('request-btn');
const requestStatus = $('request-status');
const requestCancel = $('request-cancel');
const responseBox = $('response-box');
const responseOutput = $('response-output');
const responseCopy = $('response-copy');
const requestAside = $('request-aside');

const TYPE_LABELS = { name: 'Name', email: 'Email', phone: 'Phone', domain: 'Domain' };
const TYPE_ICONS = { name: 'user', email: 'mail', phone: 'phone', domain: 'globe' };
const KIND_ORDER = ['name', 'email', 'phone', 'domain'];
const OTP_TYPES = new Set(['email', 'phone']);

// What each kind is for: on its empty slot ("why would I add this"), and in
// the composer ("what happens when I do").
const KIND_COPY = {
  name: {
    slot: 'Add your name',
    why: 'How sites and people should know you. People who know you can vouch for it.',
    title: 'Claim a name',
    help: 'A node cannot check a name. It becomes worth something when people who know you by it vouch.',
  },
  email: {
    slot: 'Add your email address',
    why: 'Checked with a one-time code the node sends to the inbox.',
    title: 'Claim an email address',
    help: 'The node sends a one-time code to the inbox. When you enter it, the node signs that it checked the address. Then you sign the claim.',
    sendHelp: 'The node sends a one-time code to this address.',
  },
  phone: {
    slot: 'Add your phone number',
    why: 'Checked with a code sent by SMS.',
    title: 'Claim a phone number',
    help: 'The node sends a one-time code by SMS. When you enter it, the node signs that it checked the number. Then you sign the claim.',
    sendHelp: 'The node sends a one-time code to this number by SMS.',
  },
  domain: {
    slot: 'Add a domain you own',
    why: 'Checked with a DNS record you add at your provider.',
    title: 'Claim a domain',
    help: 'You sign the claim now. Then you add a DNS record at your provider, and the node signs once it can see the record. Until then the claim shows a pending check.',
  },
};

// One-time-code state for the email/phone flow: the target the code was
// sent to and the token the service handed back once it was entered.
let verification = { target: null, token: null };
let busy = false;
let selectedKind = 'name';
// From the last status read: whether this profile has a wallet at all, so a
// locked-store answer reads as "set one up" rather than "unlock it".
let hasVault = true;
// Whether the configured node runs the email/phone code round trip; a bare
// node does not, so those claim kinds are offered only when it does.
let outOfBandVerification = true;
let activeAddress = '';
// The node this profile uses now, from the status line.
let serviceUrl = '';
// Whether the node holds a session for the active wallet. Until it does the
// page shows the sign-in step and loads nothing that would need one.
let signedIn = false;
// The claims as last listed, and which one the panel shows.
let claims = [];
let selectedClaimId = null;
// The claim or shared entry a view or dialog is open for.
let current = null;
// Vouches I give: the entries as last listed and which one the panel shows.
let sharedEntries = [];
let selectedSharedKey = null;
// Attestations this wallet issued, by the revision they vouch for: a share
// already vouched for shows them instead of offering Vouch again.
let issuedByClaimTip = new Map();
let issuedAll = [];

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

function normalizeUrl(url) {
  return String(url || '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function hostOf(url) {
  try {
    return new URL(url).host || String(url || '');
  } catch {
    return String(url || '');
  }
}

// The node's short name: the first label of its host, or the host itself
// when it is an address or a single word.
function nodeName(url) {
  const host = hostOf(url);
  const bare = host.replace(/:\d+$/, '');
  if (/^[\d.]+$/.test(bare) || bare === 'localhost' || !bare.includes('.')) return host;
  return bare.split('.').slice(0, 2).join('.');
}

function formatTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatDay(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

// A DID shown in a row: its address part, with the whole DID on hover.
function shortDid(did) {
  const s = String(did || '');
  const addr = s.slice(s.lastIndexOf(':') + 1);
  return addr.length > 14 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr || s;
}

// The wallet address inside a DID, whole.
function addressOf(did) {
  const s = String(did || '');
  return s.slice(s.lastIndexOf(':') + 1);
}

// When a vouch was signed: the latest timestamp in its tree (the attester's
// signature revision), or failing that when this profile recorded it.
function attestedAt(a) {
  const revisions = a?.tree?.revisions;
  if (revisions && typeof revisions === 'object') {
    let latest = 0;
    for (const rev of Object.values(revisions)) {
      const t = Number(rev?.local_timestamp);
      if (Number.isFinite(t) && t > latest) latest = t;
    }
    if (latest > 0) return new Date(latest * 1000).toISOString();
  }
  return a?.issuedAt || a?.createdAt || '';
}

function showNotice(kind, message) {
  statusNotice.className = kind ? `notice ${kind}` : 'notice';
  statusNotice.replaceChildren(
    icon(kind === 'error' ? 'x-circle' : kind === 'warn' ? 'alert' : 'check-circle'),
    el('span', null, message)
  );
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

function setCount(node, n) {
  node.textContent = String(n);
  node.classList.toggle('zero', n === 0);
}

function errorText(result, fallback) {
  const err = result && result.error;
  if (!err) return fallback;
  if (err.code === 'VAULT_LOCKED') {
    return hasVault ? 'Unlock your wallet first.' : 'Set up your wallet in the sidebar first.';
  }
  if (err.code === 'DISABLED')
    return 'Enable Identity & Wallet under Settings → Identity to use identity claims.';
  return err.message || fallback;
}

// ── Dialogs ──────────────────────────────────────────────────────────────
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

function focusOn(node) {
  if (node && typeof node.focus === 'function') node.focus();
}

function emptyState(iconName, title, text) {
  const box = el('div', 'empty');
  box.appendChild(icon(iconName));
  box.appendChild(el('div', 'empty-title', title));
  if (text) box.appendChild(el('div', 'meta', text));
  return box;
}

// A claim quoted inside a view or dialog: icon, value, kind and signer.
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

// ── How a claim stands ───────────────────────────────────────────────────

function badge(className, iconName, label) {
  const b = el('span', `badge ${className}`.trim());
  b.appendChild(icon(iconName));
  b.appendChild(document.createTextNode(label));
  return b;
}

function validAttestations(claim) {
  return (claim.attestations || []).filter((a) => a.verification?.isValid === true);
}

// Whether a vouch counts for this user: `trusted` when its signer is on
// their trust list, `rejected` when they said no, `unknown` for a signer the
// list says nothing about. Main decides; anything else reads as unknown.
function trustOf(a) {
  return a?.trust === 'trusted' || a?.trust === 'rejected' ? a.trust : 'unknown';
}

function trustedAttestations(claim) {
  return validAttestations(claim).filter((a) => trustOf(a) === 'trusted');
}

// One word a verifier and a newcomer both read the same way: it does not
// verify, it is verified (a signer you trust signed it too), others vouch
// for it but none you trust, or only you have signed it so far. Anybody
// can sign a vouch, so a vouch alone never reads as Verified.
function statusBadge(claim) {
  if (claim.verification && claim.verification.isValid === false) {
    return badge('invalid', 'x-circle', 'Does not verify');
  }
  if (claim.type === 'domain' && claim.domainVerification === 'verified') {
    return badge('attested', 'check-circle', 'Verified');
  }
  if (trustedAttestations(claim).length > 0) {
    return badge('attested', 'check-circle', 'Verified');
  }
  const valid = validAttestations(claim);
  if (valid.length > 0) return badge('vouched', 'users', `Vouched by ${valid.length}`);
  return badge('', 'pen', 'Not yet verified');
}

// A claim is held by the node it was made on; after a node change the
// current one cannot share, pull or check it.
function madeElsewhere(claim) {
  return Boolean(
    claim.nodeUrl && serviceUrl && normalizeUrl(claim.nodeUrl) !== normalizeUrl(serviceUrl)
  );
}

// The two marks, from the claim: the node's check and the people who
// vouch. `broken` is set when the claim itself does not verify, and then
// one red mark replaces both.
function proofOf(claim) {
  const valid = validAttestations(claim).filter((a) => a.source !== 'service');
  const people = valid.length;
  const trustedPeople = valid.filter((a) => trustOf(a) === 'trusted').length;
  const verification = claim.verification || {};
  if (verification.isValid === false) {
    return {
      service: 'failed',
      people,
      trustedPeople,
      broken: verification.status || 'unknown',
    };
  }
  // A check the node signed counts whatever the kind; otherwise a name has
  // nothing to check, a claim kept elsewhere cannot be checked here, and a
  // domain's check is its DNS record.
  const byService = (claim.attestations || []).filter((a) => a.source === 'service');
  let service = 'no';
  if (byService.some((a) => a.verification?.isValid === true)) service = 'yes';
  else if (byService.length > 0) service = 'failed';
  else if (claim.type === 'name') service = 'na';
  else if (madeElsewhere(claim)) service = 'elsewhere';
  else if (claim.type === 'domain') {
    const dns = claim.domainVerification || 'pending';
    service = dns === 'verified' ? 'yes' : dns === 'pending' ? 'pending' : 'failed';
  }
  return { service, people, trustedPeople, broken: null };
}

const SERVICE_MARK = {
  yes: {
    icon: 'shield-check',
    tone: 'tone-service',
    short: 'Checked',
    long: (n) => `Checked by ${n}`,
  },
  pending: { icon: 'clock', tone: 'tone-warn', short: 'Pending', long: (n) => `Waiting on ${n}` },
  failed: {
    icon: 'shield-x',
    tone: 'tone-danger',
    short: 'Failed',
    long: (n) => `${n} could not confirm it`,
  },
  na: {
    icon: 'shield-plain',
    tone: 'tone-quiet',
    short: '',
    long: () => 'Not checkable for names',
  },
  no: {
    icon: 'shield-plain',
    tone: 'tone-dashed',
    short: 'Not yet',
    long: () => 'Not checked yet',
  },
  elsewhere: {
    icon: 'shield-plain',
    tone: 'tone-dashed',
    short: 'Not here',
    long: (n) => `Not checked on ${n}`,
  },
};

function mark(tone, iconName, label, title) {
  const m = el('span', `mark ${tone}`);
  m.appendChild(icon(iconName));
  if (label) m.appendChild(document.createTextNode(label));
  if (title) m.title = title;
  return m;
}

// The marks at row size.
function proofSmall(proof, node) {
  const box = el('span', 'proof');
  if (proof.broken) {
    box.appendChild(mark('tone-danger', 'alert', 'Does not verify'));
    return box;
  }
  const s = SERVICE_MARK[proof.service] || SERVICE_MARK.no;
  const sm = mark(s.tone, s.icon, s.short, s.long(node));
  if (!s.short) sm.appendChild(el('span', 'sr-only', s.long(node)));
  box.appendChild(sm);
  if (proof.people > 0) {
    const pm = mark(
      proof.trustedPeople > 0 ? 'tone-success' : 'tone-muted',
      'users',
      '',
      peopleText(proof)
    );
    const pips = el('span', 'pips');
    // Trusted vouchers first, in green; the rest are counted in grey.
    for (let i = 0; i < Math.min(proof.people, 3); i += 1)
      pips.appendChild(el('span', i < proof.trustedPeople ? 'pip' : 'pip untrusted'));
    pm.appendChild(pips);
    if (proof.people > 3) pm.appendChild(document.createTextNode(`+${proof.people - 3}`));
    pm.appendChild(el('span', 'sr-only', `${proof.people} vouches`));
    box.appendChild(pm);
  } else {
    box.appendChild(mark('tone-dashed', 'users', '0', 'No vouches yet'));
  }
  return box;
}

// "Vouched by 3", and how many of them the user trusts when not all.
function peopleText(proof) {
  if (proof.people === 0) return 'No vouches yet';
  const base = `Vouched by ${proof.people}`;
  if (proof.trustedPeople === proof.people) return base;
  return proof.trustedPeople === 0
    ? `${base}, none you trust yet`
    : `${base}, ${proof.trustedPeople} you trust`;
}

// The marks at panel size: two tiles, or the red block.
function proofLarge(claim, proof, node) {
  if (proof.broken) {
    const box = el('div', 'broken');
    box.setAttribute('role', 'alert');
    const ic = el('span', 'tile-ic tone-danger');
    ic.appendChild(icon('alert'));
    box.appendChild(ic);
    const body = el('div');
    body.appendChild(el('div', 'broken-title', 'Does not verify'));
    body.appendChild(
      el(
        'div',
        'broken-text',
        `The chain check failed: ${proof.broken}. Anyone you share it with will see it fail. Check it again to replace the record, or remove it and make it again.`
      )
    );
    box.appendChild(body);
    return box;
  }
  const grid = el('div', 'proof-lg');
  const s = SERVICE_MARK[proof.service] || SERVICE_MARK.no;
  const svc = el('div', 'tile');
  const svcIc = el('span', `tile-ic ${s.tone === 'tone-quiet' ? 'tone-muted' : s.tone}`);
  svcIc.appendChild(icon(s.icon));
  svc.appendChild(svcIc);
  const svcBody = el('div', 'tile-body');
  svcBody.appendChild(el('div', 'tile-label', 'Node check'));
  svcBody.appendChild(
    el(
      'div',
      `tile-value${proof.service === 'na' ? ' quiet' : ''}`,
      proof.service === 'na' ? 'Names are vouched for, not checked' : s.long(node)
    )
  );
  svc.appendChild(svcBody);
  grid.appendChild(svc);

  const ppl = el('div', 'tile');
  const pplIc = el(
    'span',
    `tile-ic ${proof.trustedPeople > 0 ? 'tone-success' : proof.people > 0 ? 'tone-muted' : 'tone-dashed'}`
  );
  pplIc.appendChild(icon('users'));
  ppl.appendChild(pplIc);
  const pplBody = el('div', 'tile-body');
  pplBody.appendChild(el('div', 'tile-label', 'People who know you'));
  const value = el('div', 'tile-value', peopleText(proof));
  if (proof.people > 0) {
    const pips = el('span', 'pips-lg');
    const people = validAttestations(claim).filter((a) => a.source !== 'service');
    people.slice(0, 5).forEach((a, i) => {
      const pip = el('button', trustOf(a) === 'trusted' ? 'pip-lg' : 'pip-lg untrusted');
      pip.type = 'button';
      pip.title = a.attesterDid ? shortDid(a.attesterDid) : `Vouch ${i + 1}`;
      pip.setAttribute('aria-label', `Vouch from ${pip.title}`);
      pip.addEventListener('click', () => openVouchesDialog(claim));
      pips.appendChild(pip);
    });
    value.appendChild(pips);
    if (proof.people > 5) value.appendChild(el('span', 'meta', `+${proof.people - 5}`));
  }
  pplBody.appendChild(value);
  ppl.appendChild(pplBody);
  grid.appendChild(ppl);
  return grid;
}

function statusLine(state, iconName, text) {
  const line = el('div', `status-line ${state}`.trim());
  line.appendChild(icon(iconName));
  line.appendChild(el('span', null, text));
  return line;
}

function techRow(rows, label, value) {
  rows.appendChild(el('span', 'label', label));
  if (typeof value === 'string') rows.appendChild(el('span', 'mono', value));
  else rows.appendChild(value);
}

function techDetails(rows) {
  const tech = el('details', 'tech');
  tech.appendChild(el('summary', null, 'Technical details'));
  tech.appendChild(rows);
  return tech;
}

// ── Me: the rows ─────────────────────────────────────────────────────────

function renderRow(claim) {
  const row = el('button', 'card row');
  row.type = 'button';
  row.dataset.id = claim.id;
  if (claim.id === selectedClaimId) row.classList.add('selected');
  const ic = el('span', 'claim-icon');
  ic.appendChild(icon(TYPE_ICONS[claim.type] || 'shield'));
  row.appendChild(ic);
  const body = el('div', 'row-body');
  body.appendChild(el('div', 'row-value', claimValue(claim)));
  body.appendChild(
    el(
      'div',
      'row-sub',
      `${TYPE_LABELS[claim.type] || claim.type} · you signed ${formatDay(claim.signedAt || claim.createdAt)}`
    )
  );
  row.appendChild(body);
  const proof = el('div', 'row-proof');
  proof.appendChild(proofSmall(proofOf(claim), nodeName(claim.nodeUrl || serviceUrl)));
  // The one-word summary, for a reader who skips the marks.
  const word = statusBadge(claim);
  word.classList.add('sr-only');
  proof.appendChild(word);
  row.appendChild(proof);
  row.addEventListener('click', () => selectClaim(claim.id, { pane: true }));
  return row;
}

// The kinds not yet claimed, each a row with its own Add. Email and phone
// need the node's code round trip; without it they say so.
function renderSlots(listed) {
  const have = new Set(listed.map((c) => c.type));
  const missing = KIND_ORDER.filter((kind) => !have.has(kind));
  claimsSlots.replaceChildren();
  for (const kind of missing) {
    const row = el('button', 'row slot');
    row.type = 'button';
    row.dataset.kind = kind;
    const ic = el('span', 'claim-icon');
    ic.appendChild(icon(TYPE_ICONS[kind]));
    row.appendChild(ic);
    const offered = !OTP_TYPES.has(kind) || outOfBandVerification;
    const body = el('div', 'row-body');
    body.appendChild(el('div', null, KIND_COPY[kind].slot));
    if (!offered)
      body.appendChild(
        el('div', 'row-sub', 'This node does not send codes, so it cannot check it.')
      );
    row.appendChild(body);
    row.appendChild(icon('plus'));
    row.disabled = addClaimBtn.disabled || !offered;
    row.addEventListener('click', () => openAddClaim(kind));
    claimsSlots.appendChild(row);
  }
}

function selectClaim(id, { pane = false } = {}) {
  selectedClaimId = id;
  for (const row of claimsEl.querySelectorAll('.row'))
    row.classList.toggle('selected', row.dataset.id === id);
  const claim = claims.find((c) => c.id === id);
  if (claim) renderClaimPanel(claim);
  if (pane) meSplit.classList.add('show-pane');
}

function showClaimView(name) {
  for (const [key, node] of Object.entries({
    empty: claimsEmpty,
    detail: claimDetail,
    ask: askView,
    import: importView,
  })) {
    node.classList.toggle('hidden', key !== name);
  }
}

function backLink(label, onClick) {
  const link = el('button', 'back-link');
  link.type = 'button';
  link.appendChild(icon('arrow-left'));
  link.appendChild(document.createTextNode(label));
  link.addEventListener('click', onClick);
  return link;
}

// The folded words that fill in when clicked.
function wordsOf(text) {
  const words = el('div', 'words', text);
  words.title = 'Show more';
  words.addEventListener('click', () => {
    const open = words.classList.toggle('expanded');
    words.title = open ? 'Show less' : 'Show more';
  });
  return words;
}

// One event on the timeline: who, what they did, when, and their words.
function timelineEvent({
  tone,
  iconName,
  who,
  verb,
  address,
  when,
  words,
  state,
  extra,
  last,
  className,
}) {
  const box = el('div', `event${last ? ' last' : ''}${className ? ` ${className}` : ''}`);
  const rail = el('div', 'event-rail');
  const ic = el('span', `event-ic ${tone}`);
  ic.appendChild(icon(iconName));
  rail.appendChild(ic);
  if (!last) rail.appendChild(el('span', 'event-line'));
  box.appendChild(rail);
  const body = el('div', 'event-body');
  const head = el('div', 'event-head');
  const source = el('span', 'source');
  source.appendChild(icon(iconName));
  source.appendChild(document.createTextNode(who));
  head.appendChild(source);
  head.appendChild(document.createTextNode(' '));
  head.appendChild(el('span', 'verb', verb));
  if (state?.badge) head.appendChild(state.badge);
  body.appendChild(head);
  const sub = el('div', 'event-sub');
  if (address) {
    const addr = el('span', 'who', address.short);
    addr.title = address.full || '';
    sub.appendChild(addr);
  }
  if (when) sub.appendChild(el('span', 'when', when));
  body.appendChild(sub);
  if (words) body.appendChild(wordsOf(words));
  if (state?.text) body.appendChild(el('div', `state ${state.kind}`, state.text));
  if (extra) body.appendChild(extra);
  box.appendChild(body);
  return box;
}

// One attestation as an event: the node, or a person, and how it stands.
function renderAttestation(a, { last = false, node = '' } = {}) {
  const state = a.verification?.isValid ? 'ok' : a.pending ? 'wait' : 'bad';
  const service = a.source === 'service';
  const when = attestedAt(a);
  return timelineEvent({
    className: `attestation${state === 'ok' ? '' : state === 'wait' ? ' pending' : ' invalid'}`,
    tone:
      state === 'ok'
        ? service
          ? 'tone-service'
          : 'tone-success'
        : state === 'wait'
          ? 'tone-warn'
          : 'tone-danger',
    iconName: service ? 'server' : 'user',
    who: service ? node || 'Identity service' : 'Person',
    verb:
      state === 'ok'
        ? service
          ? 'checked it'
          : 'vouched'
        : state === 'wait'
          ? 'is on its way'
          : 'does not verify',
    address: {
      short: a.attesterDid ? shortDid(a.attesterDid) : '(unknown)',
      full: a.attesterDid || '',
    },
    when: when ? `${state === 'wait' ? 'recorded' : 'signed'} ${formatTime(when)}` : '',
    words: a.context,
    state:
      state === 'wait'
        ? {
            kind: 'wait',
            text: 'Recorded on the node. It appears here once they share it back, or you can import the file they send you.',
            badge: badge('pending', 'clock', 'On its way'),
          }
        : state === 'bad'
          ? {
              kind: 'bad',
              text: `Does not verify: ${a.verification?.status || 'unknown'}`,
              badge: badge('invalid', 'x-circle', 'Does not verify'),
            }
          : { badge: trustBadge(a) },
    last,
  });
}

// The chip on one vouch whose signature checks out: whether it counts.
function trustBadge(a) {
  const trust = trustOf(a);
  if (trust === 'trusted') return badge('attested', 'check-circle', 'Trusted by you');
  if (trust === 'rejected') return badge('invalid', 'x-circle', 'Rejected by you');
  return badge('vouched', 'users', 'Not trusted by you');
}

// The plain line under the marks that names who stands behind the badge:
// the signer you trust, or the vouchers you have not accepted.
function trustLine(claim) {
  if (claim.verification && claim.verification.isValid === false) return null;
  const valid = validAttestations(claim);
  if (valid.length === 0) return null;
  const node = nodeName(claim.nodeUrl || serviceUrl) || 'the identity service';
  const nameOf = (a) =>
    a.source === 'service' ? node : a.attesterDid ? shortDid(a.attesterDid) : 'someone';
  const namesOf = (list) =>
    list.length === 1 ? nameOf(list[0]) : `${nameOf(list[0])} and ${list.length - 1} more`;
  const line = el('p', 'panel-copy trust-line');
  const trusted = valid.filter((a) => trustOf(a) === 'trusted');
  if (trusted.length > 0) {
    const first = trusted.find((a) => a.source === 'service') || trusted[0];
    line.appendChild(
      document.createTextNode(
        first.source === 'service'
          ? `Verified: ${node} checked it.`
          : `Verified: ${nameOf(first)} vouches for it, and you trust them.`
      )
    );
    return line;
  }
  const open = valid.filter((a) => trustOf(a) === 'unknown');
  line.appendChild(
    document.createTextNode(
      open.length > 0
        ? `Vouched by ${namesOf(open)}, not trusted by you. Accept them to count it. `
        : `Vouched by ${namesOf(valid)}, rejected by you. `
    )
  );
  const review = el('button', 'link-btn', open.length > 0 ? 'Who and when' : 'Review');
  review.type = 'button';
  review.addEventListener('click', () => openVouchesDialog(claim));
  line.appendChild(review);
  return line;
}

// The one plain line under the marks that says what to do next.
function nextStep(claim, proof, elsewhere) {
  if (proof.broken) return null;
  const node = nodeName(claim.nodeUrl || serviceUrl);
  if (elsewhere) {
    return el(
      'p',
      'panel-copy',
      `Made on ${claim.nodeUrl}. The node this profile uses now does not hold it; change back under Settings → Identity to share or check it.`
    );
  }
  if (claim.type === 'domain') {
    if (proof.service === 'yes')
      return el('p', 'panel-copy', `${node} found the DNS record: you control this domain.`);
    return null;
  }
  if (proof.service === 'yes' && proof.people === 0) {
    return el(
      'p',
      'panel-copy',
      'People who know you can vouch for it too, which makes it worth more to a site.'
    );
  }
  if (proof.people > 0) return null;
  if (claim.type === 'name')
    return el(
      'p',
      'panel-copy',
      'A node cannot check a name, so a name gains weight only from people who know you.'
    );
  return el(
    'p',
    'panel-copy',
    'Only your signature backs this so far. Ask someone who knows you to vouch for it.'
  );
}

// The DNS record to publish, inline, with the outcome of the last check
// under it. Both Check buttons run the check here, so the result is read
// next to the record it is about.
const dnsResult = el('div', 'dns-result');
const dnsBody = el('div');
let dnsCheckBtn = null;

function dnsRow(label, value, { copy: withCopy = true } = {}) {
  const row = el('div', 'dns-row');
  row.appendChild(el('span', 'label', label));
  row.appendChild(el('span', 'mono', value));
  if (!withCopy) return row;
  const copy = button('btn small', 'copy', 'Copy');
  copy.addEventListener('click', async () => {
    await window.freedomAPI.copyText(value);
    setLabel(copy, 'check', 'Copied');
  });
  row.appendChild(copy);
  return row;
}

function renderDnsResult(check) {
  if (!check || !check.status) {
    dnsResult.replaceChildren();
    return;
  }
  const state = check.status === 'verified' ? 'ok' : check.status === 'pending' ? 'wait' : 'bad';
  const text = check.message || `DNS check: ${check.status}`;
  dnsResult.replaceChildren(
    statusLine(
      state,
      state === 'ok' ? 'check-circle' : state === 'wait' ? 'clock' : 'x-circle',
      text
    )
  );
  if (check.checkedAt)
    dnsResult.appendChild(el('div', 'meta', `Checked ${formatTime(check.checkedAt)}`));
}

function renderDnsSection(claim, elsewhere) {
  const section = el('div', 'dns-section');
  const dns = claim.domainVerification || 'pending';
  const node = nodeName(claim.nodeUrl || serviceUrl);
  const callout = el('div', `callout ${dns === 'pending' ? 'warn' : 'bad'}`);
  const title = el('div', 'callout-title');
  title.appendChild(icon(dns === 'pending' ? 'clock' : 'x-circle'));
  title.appendChild(
    document.createTextNode(
      dns === 'pending' ? 'The record is not visible yet' : `${node} could not confirm the record`
    )
  );
  callout.appendChild(title);
  callout.appendChild(
    el(
      'div',
      'meta',
      claim.dnsCheck?.message
        ? `Last check: ${claim.dnsCheck.message}`
        : 'Add the TXT record at your DNS provider, then check. DNS changes can take up to an hour to show.'
    )
  );
  section.appendChild(callout);
  section.appendChild(el('h3', 'section-title', 'Add this record at your DNS provider'));
  section.appendChild(
    el(
      'p',
      'meta',
      `Freedom does not look up DNS itself. ${node} checks the record and signs that it found it.`
    )
  );
  dnsBody.replaceChildren(el('p', 'meta', 'Fetching the record…'));
  section.appendChild(dnsBody);
  section.appendChild(dnsResult);
  renderDnsResult(claim.dnsCheck);
  const actions = el('div', 'actions');
  dnsCheckBtn = button('btn primary', 'refresh', claim.dnsCheck ? 'Check again' : 'Check DNS');
  dnsCheckBtn.id = 'dns-check-btn';
  dnsCheckBtn.disabled = elsewhere;
  dnsCheckBtn.addEventListener('click', () => verifyDns(claim));
  actions.appendChild(dnsCheckBtn);
  const remove = button('btn ghost', 'trash', 'Remove this claim');
  remove.addEventListener('click', () => openRemoveDialog(claim));
  actions.appendChild(remove);
  section.appendChild(actions);
  loadDnsRecord(claim);
  return section;
}

async function loadDnsRecord(claim) {
  const result = await window.freedomAPI.aquaDnsInstructions(claim.id);
  if (selectedClaimId !== claim.id) return;
  if (!result?.success) {
    dnsBody.replaceChildren(
      el('div', 'field-error', errorText(result, 'DNS instructions are unavailable.'))
    );
    return;
  }
  // The identity service answers `txt_name` / `txt_value` (plus `domain`).
  const name = result.txt_name || result.record_name || result.name || '';
  const value = result.txt_value || result.record_value || result.value || '';
  const box = el('div', 'dns-box');
  box.append(dnsRow('Type', 'TXT'), dnsRow('Name', name), dnsRow('Value', value));
  dnsBody.replaceChildren(box);
}

// Ask the node to look the record up now; the outcome goes under the
// record and onto the row's mark.
async function verifyDns(claim) {
  if (dnsCheckBtn) {
    dnsCheckBtn.disabled = true;
    setLabel(dnsCheckBtn, 'clock', 'Checking…');
  }
  dnsResult.replaceChildren(el('div', 'meta', 'Looking the record up…'));
  const result = await window.freedomAPI.aquaVerifyDns(claim.id);
  if (dnsCheckBtn) {
    dnsCheckBtn.disabled = false;
    setLabel(dnsCheckBtn, 'refresh', 'Check again');
  }
  if (!result?.success) {
    dnsResult.replaceChildren(
      statusLine('bad', 'x-circle', errorText(result, 'The DNS check failed.'))
    );
    return;
  }
  renderDnsResult(
    result.claim?.dnsCheck || { status: result.claim?.domainVerification || 'pending' }
  );
  await loadClaims();
}

// The selected claim: its marks, what to do next, its evidence newest
// first, and the technical rows.
function renderClaimPanel(claim) {
  current = claim;
  showClaimView('detail');
  const proof = proofOf(claim);
  const elsewhere = madeElsewhere(claim);
  const node = nodeName(claim.nodeUrl || serviceUrl);
  const out = [];

  out.push(backLink('All claims', () => meSplit.classList.remove('show-pane')));
  const meta = el('p', 'panel-meta');
  meta.appendChild(icon(TYPE_ICONS[claim.type] || 'shield'));
  meta.appendChild(
    document.createTextNode(
      `${TYPE_LABELS[claim.type] || claim.type} · you signed ${formatDay(claim.signedAt || claim.createdAt)}`
    )
  );
  out.push(meta);
  const title = el('h2', 'panel-value');
  title.appendChild(el('span', null, claimValue(claim)));
  title.appendChild(statusBadge(claim));
  out.push(title);
  out.push(proofLarge(claim, proof, node));
  const trust = trustLine(claim);
  if (trust) out.push(trust);

  if (elsewhere) {
    const callout = el('div', 'callout info');
    const t = el('div', 'callout-title');
    t.appendChild(icon('server'));
    t.appendChild(document.createTextNode(`Made on ${hostOf(claim.nodeUrl)}`));
    callout.appendChild(t);
    callout.appendChild(
      el(
        'div',
        'meta',
        'The node this profile uses now does not hold it, so it cannot share, check or pull vouches for it. Change back under Settings → Identity to do those.'
      )
    );
    out.push(callout);
  } else {
    const line = nextStep(claim, proof, elsewhere);
    if (line) out.push(line);
  }

  if (proof.broken) {
    out.push(el('h3', 'section-title', 'What failed'));
    const list = el('ul', 'check-list');
    const yours = el('li');
    yours.appendChild(icon('check-circle'));
    yours.querySelector('.ico').classList.add('ok');
    yours.appendChild(el('span', null, 'Your signature on the claim'));
    list.appendChild(yours);
    const chain = el('li');
    chain.appendChild(icon('x-circle'));
    chain.querySelector('.ico').classList.add('bad');
    chain.appendChild(
      el('span', null, `The chain check: ${claim.verification?.status || 'unknown'}`)
    );
    list.appendChild(chain);
    out.push(list);
  }

  // One primary next step, the second-most-likely action beside it.
  const actions = el('div', 'actions');
  const vouched = proof.people > 0;
  if (proof.broken) {
    const recheck = button('btn primary', 'refresh', 'Check again');
    recheck.addEventListener('click', () => refreshClaim(claim));
    actions.appendChild(recheck);
    const remove = button('btn danger', 'trash', 'Remove…');
    remove.addEventListener('click', () => openRemoveDialog(claim));
    actions.appendChild(remove);
  } else if (claim.type === 'domain' && proof.service !== 'yes') {
    out.push(renderDnsSection(claim, elsewhere));
  } else {
    const ask = button(`btn${vouched ? '' : ' primary'}`, 'users', 'Ask someone to vouch');
    ask.disabled = elsewhere;
    ask.addEventListener('click', () => openShareView(claim));
    actions.appendChild(ask);
    const imp = button('btn', 'import', 'Import a vouch');
    imp.addEventListener('click', () => openImportView(claim));
    actions.appendChild(imp);
    const pull = button('btn ghost', 'pull', 'Check for new vouches');
    pull.disabled = elsewhere;
    pull.addEventListener('click', () => pullAttestations(claim));
    actions.appendChild(pull);
  }
  if (actions.childNodes.length > 0) out.push(actions);
  if (elsewhere && !proof.broken && claim.type !== 'domain')
    out.push(
      el('p', 'meta actions-note', 'Asking and checking need the node this claim lives on.')
    );

  // Evidence, newest first, ending with your own signature.
  const head = el('div', 'evidence-head');
  head.appendChild(el('h3', null, 'Evidence, newest first'));
  const all = el('button', 'link-btn', 'All details and removal');
  all.type = 'button';
  all.addEventListener('click', () => openVouchesDialog(claim));
  head.appendChild(all);
  out.push(head);
  const timeline = el('div', 'timeline');
  const list = [...(claim.attestations || [])].sort((x, y) =>
    String(attestedAt(y)).localeCompare(String(attestedAt(x)))
  );
  for (const a of list) timeline.appendChild(renderAttestation(a, { node }));
  timeline.appendChild(
    timelineEvent({
      className: 'signed',
      tone: 'tone-muted',
      iconName: 'pen',
      who: 'You',
      verb: 'signed the claim',
      address: { short: shortDid(claim.signerDid), full: claim.signerDid || '' },
      when: formatTime(claim.signedAt || claim.createdAt),
      last: true,
    })
  );
  out.push(timeline);

  const rows = el('div', 'tech-rows');
  const verification = claim.verification || {};
  techRow(rows, 'Signer', claim.signerDid || '');
  techRow(rows, 'Revision', claim.tip || '');
  techRow(rows, 'Created', el('span', null, formatTime(claim.createdAt)));
  techRow(
    rows,
    'Verification',
    el(
      'span',
      null,
      verification.isValid
        ? `Chain and signature verified${verification.status && verification.status !== 'OK' ? ` (${verification.status})` : ''} · ${formatTime(verification.checkedAt)}`
        : `Not verified: ${verification.status || 'unknown'}`
    )
  );
  if (claim.nodeUrl) techRow(rows, 'Kept at', claim.nodeUrl);
  out.push(techDetails(rows));

  claimDetail.replaceChildren(...out);
}

// A locked store is already said once, on the checklist: a list that
// cannot be read stays empty rather than repeating it.
function isLocked(result) {
  return result?.error?.code === 'VAULT_LOCKED';
}

// Attestations recorded on the node since the claim was last looked at (a
// peer's, or the node's own): pulled for every claim when the page opens,
// so they show up without a click. A pull that fails leaves that claim as
// listed.
async function pullAll(listed) {
  return Promise.all(
    listed.map(async (claim) => {
      try {
        const result = await window.freedomAPI.aquaPullAttestations(claim.id);
        return result?.success && result.claim?.id === claim.id ? result.claim : claim;
      } catch {
        return claim;
      }
    })
  );
}

function claimsLineText(n) {
  const node = nodeName(serviceUrl);
  if (n === 0) return node ? `No claims on ${node} yet` : 'No claims yet';
  return `${n} claim${n === 1 ? '' : 's'} on ${node || 'the node'}`;
}

async function loadClaims({ pull = false } = {}) {
  const result = await window.freedomAPI.aquaListClaims();
  if (!result?.success) {
    claims = [];
    showClaimView('detail');
    setCount(claimsCount, 0);
    claimsLine.textContent = claimsLineText(0);
    claimsEl.replaceChildren();
    claimsSlots.replaceChildren();
    claimDetail.replaceChildren();
    if (!isLocked(result))
      claimDetail.appendChild(el('div', 'meta', errorText(result, 'Claims could not be loaded.')));
    return;
  }
  const listed = result.claims || [];
  setCount(claimsCount, listed.length);
  claimsLine.textContent = claimsLineText(listed.length);
  if (listed.length === 0) {
    claims = [];
    selectedClaimId = null;
    claimsEl.replaceChildren();
    claimDetail.replaceChildren();
    showClaimView('empty');
    renderSlots([]);
    return;
  }
  const fresh = pull ? await pullAll(listed) : listed;
  // Grouped by kind in the order the slots use, newest first within a kind,
  // so the list reads name, email, phone, domain like a form.
  claims = [...fresh].sort((a, b) => {
    const ka = KIND_ORDER.indexOf(a.type);
    const kb = KIND_ORDER.indexOf(b.type);
    if (ka !== kb) return (ka === -1 ? 99 : ka) - (kb === -1 ? 99 : kb);
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
  if (!claims.some((c) => c.id === selectedClaimId)) selectedClaimId = claims[0].id;
  claimsEl.replaceChildren(...claims.map(renderRow));
  renderSlots(claims);
  selectClaim(selectedClaimId);
}

// ── Status, readiness and the node card ──────────────────────────────────

function setNodeState(tone, iconName, text) {
  nodeState.className = `node-state ${tone}`;
  nodeStateText.textContent = text;
  nodeState.replaceChildren(icon(iconName), nodeStateText);
}

async function loadStatus() {
  const result = await window.freedomAPI.aquaStatus();
  if (!result?.success) {
    showNotice('warn', errorText(result, 'Identity claims are unavailable.'));
    showReadiness({ missing: false, locked: false, down: false, signedIn: true });
    walletLine.textContent = '';
    statusWallet.textContent = '—';
    statusService.textContent = '—';
    nodeUrlEl.textContent = '';
    nodeItemHost.textContent = '—';
    nodeItemUrl.textContent = '';
    statusCaps.textContent = '';
    setNodeState('tone-muted', 'alert', 'Unavailable');
    return;
  }
  hideNotice();
  hasVault = result.hasVault !== false;
  activeAddress = (result.vaultUnlocked && result.wallet?.address) || '';
  serviceUrl = result.nodeUrl || '';
  outOfBandVerification = result.service ? result.service.outOfBandVerification !== false : true;
  kindButtons.email.disabled = !outOfBandVerification;
  kindButtons.phone.disabled = !outOfBandVerification;
  kindsNote.classList.toggle('hidden', outOfBandVerification);
  if (!outOfBandVerification && OTP_TYPES.has(selectedKind)) selectKind('name');
  const parts = [];
  if (result.wallet?.address) parts.push(`Wallet ${result.wallet.address}`);
  parts.push(`Identity service ${result.nodeUrl}`);
  const down = Boolean(result.service && result.service.reachable === false);
  signedIn = result.signedIn === true;
  let caps = '';
  if (down) caps = 'unreachable';
  else if (!outOfBandVerification) caps = 'no email or phone verification on this service';
  if (caps) parts.push(caps);
  walletLine.textContent = parts.join(' · ');
  statusWallet.textContent = result.wallet?.address || 'none';
  statusWallet.title = result.wallet?.address || '';
  copyAddressBtn.classList.toggle('hidden', !result.wallet?.address);
  const host = hostOf(result.nodeUrl);
  statusService.textContent = nodeName(result.nodeUrl) || host || '—';
  statusService.title = result.nodeUrl || '';
  nodeUrlEl.textContent = host;
  nodeItemHost.textContent = nodeName(result.nodeUrl) || host || '—';
  nodeItemUrl.textContent = result.nodeUrl || '';
  composerNode.textContent = nodeName(result.nodeUrl) || 'the node';
  statusCaps.textContent = down
    ? 'Not answering'
    : `${signedIn ? 'Signed in' : 'Not signed in'} · checks ${outOfBandVerification ? 'email, phone, domain' : 'domain only'}`;
  const locked = Boolean(result.hasVault && !result.vaultUnlocked);
  const missing = !result.hasVault;
  if (down) setNodeState('tone-accent', 'cloud-off', 'Not answering');
  else if (missing) setNodeState('tone-muted', 'wallet', 'No wallet yet');
  else if (locked) setNodeState('tone-muted', 'lock', 'Wallet locked');
  else if (!signedIn) setNodeState('tone-muted', 'login', 'Not signed in');
  else setNodeState('tone-success', 'check-circle', 'Reachable');
  showReadiness({
    missing,
    locked,
    down,
    signedIn: signedIn || !activeAddress,
    nodeUrl: result.nodeUrl,
  });
  watchLock(locked);
  if (result.hasVault && result.vaultUnlocked && result.wallet && result.wallet.canSign === false) {
    showNotice(
      'warn',
      'A multi-owner account cannot sign identity claims. Switch to another wallet.'
    );
  }
}

// One checklist: where you are, and the one thing to do next. Each row
// keeps the id of the gate card it replaced; the blocking row is
// `current`, the rows behind it `done`.
function showReadiness({ missing, locked, down, signedIn: session, nodeUrl }) {
  const node = nodeName(nodeUrl || serviceUrl) || 'the node';
  const blockedByWallet = missing || locked;
  const needSignIn = !blockedByWallet && !down && !session;
  const gated = blockedByWallet || down || needSignIn;
  ready.classList.toggle('hidden', !gated);
  contentEl.classList.toggle('gated', gated);
  statusLock.classList.toggle('hidden', !locked);
  unlockBtn.classList.toggle('hidden', !locked);
  addClaimBtn.disabled = gated;
  requestBtn.disabled = gated;

  if (missing) {
    lockedTitle.textContent = 'A wallet in this browser';
    lockedText.textContent =
      'Everything on this page is signed by your wallet. Create one, or bring an existing one, in the wallet sidebar.';
  } else if (locked) {
    lockedTitle.textContent = 'Wallet unlocked';
    lockedText.textContent =
      'Your claims are stored encrypted with your wallet. Unlock it to read and sign them.';
  } else {
    lockedTitle.textContent = 'A wallet in this browser, unlocked';
  }
  serviceDownText.textContent = `${node} is not answering, so you cannot sign in to it yet. Nothing is lost; try again in a minute, or change the node under Settings → Identity.`;
  signinText.textContent = `${node} keeps your claims, checks emails, phones and domains, and carries vouches between people. Sign one message to show it this wallet is yours. Nothing goes on chain and nothing is charged.`;
  if (needSignIn) setError(signinError, '');

  const setStep = (row, markNode, state, number) => {
    row.classList.toggle('done', state === 'done');
    row.classList.toggle('current', state === 'current');
    row.classList.remove('hidden');
    if (state === 'done') markNode.replaceChildren(icon('check'));
    else markNode.textContent = String(number);
    const title = row.querySelector('.step-title');
    if (!title) return;
    const tag = title.querySelector('.done-tag');
    if (state === 'done' && !tag) title.appendChild(el('span', 'done-tag', 'Done'));
    if (state !== 'done' && tag) tag.remove();
  };
  setStep(lockedCard, lockedMark, blockedByWallet ? 'current' : 'done', 1);
  setStep(serviceDown, serviceMark, blockedByWallet ? 'waiting' : down ? 'current' : 'done', 2);
  setStep(
    signinCard,
    signinMark,
    blockedByWallet || down ? 'waiting' : needSignIn ? 'current' : 'done',
    3
  );

  if (missing) {
    readyTitle.textContent = 'Start with a wallet';
    readyLead.textContent =
      'Your identity is whatever your wallet signs. Three steps, then your claims.';
    readyAsideTitle.textContent = 'Why a wallet';
    readyAsideText.textContent =
      'No account and no password: the wallet is the identity, and every claim is a message it signed.';
  } else if (locked) {
    readyTitle.textContent = 'Unlock your wallet';
    readyLead.textContent = 'Your claims are encrypted with it. Two steps left.';
    readyAsideTitle.textContent = 'Why it is locked';
    readyAsideText.textContent =
      'Claims are read and signed only while the wallet is unlocked, so nothing on this page can be seen or changed without you.';
  } else if (down) {
    readyTitle.textContent = `${node} is not answering`;
    readyLead.textContent = 'Your wallet is ready. Signing in waits for a node.';
    readyAsideTitle.textContent = 'Nothing is lost';
    readyAsideText.textContent =
      'The node keeps your claims and answers once it is back. Try again in a minute, or pick another node under Settings → Identity.';
  } else {
    readyTitle.textContent = 'One signature, and you are ready';
    readyLead.textContent = 'The last step. Your wallet shows the message before you sign it.';
    readyAsideTitle.textContent = 'What signing in does';
    readyAsideText.textContent = `Proves to ${node} that this wallet is yours. It does not share any claim, and it costs nothing.`;
  }
}

// Everything the page lists needs the vault open and, for the node's side,
// a session: load only once both are there.
// `pull` asks the node for new attestations on every claim. Only the page's
// own open does that: a pull is a mutation and is broadcast as a claims
// change, so pulling again on that event would never stop.
async function loadAll({ pull = false } = {}) {
  if (!signedIn) {
    claims = [];
    claimsEl.replaceChildren();
    claimsSlots.replaceChildren();
    claimDetail.replaceChildren();
    showClaimView('detail');
    sharedEl.replaceChildren();
    sharedDetail.replaceChildren();
    sharedTech.replaceChildren();
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

async function refreshClaim(claim) {
  const result = await window.freedomAPI.aquaRefreshClaim(claim.id);
  if (!result?.success) showNotice('error', errorText(result, 'Could not re-check the claim.'));
  await loadClaims();
}

// ── Remove ───────────────────────────────────────────────────────────────

function openRemoveDialog(claim) {
  current = claim;
  removeSummary.replaceChildren(summaryOf(claim.type, claimValue(claim), claim.signerDid));
  const node = nodeName(claim.nodeUrl || serviceUrl) || 'the node';
  const goes = [];
  const goesClaim = el('li');
  goesClaim.appendChild(icon('x'));
  goesClaim.appendChild(
    el(
      'span',
      null,
      `The ${(TYPE_LABELS[claim.type] || claim.type).toLowerCase()} claim, here and on ${node}`
    )
  );
  goes.push(goesClaim);
  const n = (claim.attestations || []).length;
  if (n > 0) {
    const goesVouches = el('li');
    goesVouches.appendChild(icon('x'));
    goesVouches.appendChild(
      el('span', null, n === 1 ? 'The one vouch on it' : `All ${n} vouches on it`)
    );
    goes.push(goesVouches);
  }
  removeGoes.replaceChildren(...goes);
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
  if (vouchesDialog.open) closeDialog(vouchesDialog);
  await loadClaims();
}

// ── All details: every vouch in full ─────────────────────────────────────

// One vouch in the dialog: who signed it, the whole wallet address, when,
// the attestation hash, and their words unfolded.
function renderVouch(a) {
  const state = a.verification?.isValid ? 'ok' : a.pending ? 'wait' : 'bad';
  const box = el(
    'div',
    state === 'ok'
      ? trustOf(a) === 'trusted'
        ? 'vouch'
        : 'vouch untrusted'
      : state === 'wait'
        ? 'vouch pending'
        : 'vouch invalid'
  );
  const head = el('div', 'vouch-head');
  const source = el('span', 'source');
  const service = a.source === 'service';
  source.appendChild(icon(service ? 'server' : 'user'));
  source.appendChild(
    document.createTextNode(
      service ? nodeName(current?.nodeUrl || serviceUrl) || 'Identity service' : 'Person'
    )
  );
  head.appendChild(source);
  head.appendChild(el('span', 'spacer'));
  head.appendChild(
    state === 'ok'
      ? trustBadge(a)
      : state === 'wait'
        ? badge('pending', 'clock', 'On its way')
        : badge('invalid', 'x-circle', 'Does not verify')
  );
  box.appendChild(head);
  const address = addressOf(a.attesterDid);
  box.appendChild(
    address ? dnsRow('Wallet', address) : dnsRow('Wallet', '(unknown)', { copy: false })
  );
  const when = attestedAt(a);
  box.appendChild(
    dnsRow(state === 'wait' ? 'Recorded' : 'Signed', when ? formatTime(when) : '(unknown)', {
      copy: false,
    })
  );
  if (a.tip) box.appendChild(dnsRow('Hash', a.tip));
  if (a.context) box.appendChild(el('div', 'words', a.context));
  if (state === 'ok' && a.attesterDid) box.appendChild(trustRow(a));
  if (state === 'wait') {
    box.appendChild(
      el(
        'div',
        'state wait',
        'Recorded on the node. It appears here once they share it back, or you can import the file they send you.'
      )
    );
  } else if (state === 'bad') {
    box.appendChild(
      el('div', 'state bad', `Does not verify: ${a.verification?.status || 'unknown'}`)
    );
  }
  return box;
}

// Accept or reject the signer of one vouch. The choice is about the signer,
// so it applies to every claim they vouch for, and either button undoes the
// other. Nothing is signed and nothing leaves the browser.
function trustRow(a) {
  const trust = trustOf(a);
  const row = el('div', 'trust-row');
  row.appendChild(
    el(
      'span',
      'trust-text',
      trust === 'trusted'
        ? 'You trust this signer, so their vouch counts.'
        : trust === 'rejected'
          ? 'You rejected this signer. Their vouch stays on the claim and does not count.'
          : 'This signer is not on your trust list, so their vouch does not count yet.'
    )
  );
  const act = (label, iconName, state) => {
    const btn = button('btn small', iconName, label);
    btn.addEventListener('click', () => setTrust(a.attesterDid, state, btn));
    row.appendChild(btn);
  };
  if (trust !== 'trusted')
    act(trust === 'rejected' ? 'Accept again' : 'Accept', 'check', 'trusted');
  if (trust !== 'rejected') act('Reject', 'x', 'rejected');
  return row;
}

async function setTrust(did, state, btn) {
  const claimId = current?.id;
  btn.disabled = true;
  const result = await window.freedomAPI.aquaSetTrust(did, state);
  btn.disabled = false;
  if (!result?.success) {
    showNotice('error', errorText(result, 'The trust list could not be changed.'));
    return;
  }
  // The claims are read again from the vault, not from the node: the same
  // vouches, judged against the changed list.
  await loadClaims();
  const refreshed = claims.find((c) => c.id === claimId);
  if (refreshed && vouchesDialog.open) openVouchesDialog(refreshed);
}

// Every vouch on a claim, newest first, then your own signature.
function openVouchesDialog(claim) {
  current = claim;
  vouchesSummary.replaceChildren(summaryOf(claim.type, claimValue(claim)));
  const list = [...(claim.attestations || [])].sort((x, y) =>
    String(attestedAt(y)).localeCompare(String(attestedAt(x)))
  );
  const nodes = list.map(renderVouch);
  const yours = el('div', 'vouch');
  const head = el('div', 'vouch-head');
  const source = el('span', 'source');
  source.appendChild(icon('pen'));
  source.appendChild(document.createTextNode('You signed the claim'));
  head.appendChild(source);
  yours.appendChild(head);
  yours.appendChild(
    dnsRow('Wallet', addressOf(claim.signerDid) || '(unknown)', {
      copy: Boolean(addressOf(claim.signerDid)),
    })
  );
  yours.appendChild(
    dnsRow('Signed', formatTime(claim.signedAt || claim.createdAt) || '(unknown)', { copy: false })
  );
  if (claim.tip) yours.appendChild(dnsRow('Hash', claim.tip));
  if (claim.nodeUrl) yours.appendChild(dnsRow('Kept at', claim.nodeUrl, { copy: false }));
  nodes.push(yours);
  vouchesList.replaceChildren(...nodes);
  openDialog(vouchesDialog, $('vouches-done'));
}

// ── Vouching: owner side ─────────────────────────────────────────────────

function openShareView(claim) {
  current = claim;
  askTitle.textContent = `Ask someone to vouch for your ${(TYPE_LABELS[claim.type] || claim.type).toLowerCase()}`;
  shareSummary.replaceChildren(summaryOf(claim.type, claimValue(claim), claim.signerDid));
  shareAddress.value = '';
  setError(shareError, '');
  showClaimView('ask');
  focusOn(shareAddress);
}

function backToClaim() {
  showClaimView('detail');
}

async function shareClaim() {
  if (!current) return;
  const claim = current;
  const address = shareAddress.value.trim();
  if (!address) {
    setError(shareError, 'Enter their wallet address.');
    return;
  }
  shareBtn.disabled = true;
  const result = await window.freedomAPI.aquaShareClaim(claim.id, address);
  shareBtn.disabled = false;
  if (!result?.success) {
    setError(shareError, errorText(result, 'The claim could not be shared.'));
    return;
  }
  backToClaim();
  showNotice(
    '',
    'Shared. It is waiting for them under Vouches I give on their Identity page. Once they sign, it shows up here on its own.'
  );
  await loadClaims();
}

async function pullAttestations(claim) {
  const result = await window.freedomAPI.aquaPullAttestations(claim.id);
  if (!result?.success) showNotice('error', errorText(result, 'Could not check for new vouches.'));
  else hideNotice();
  await loadClaims();
}

function openImportView(claim) {
  current = claim;
  importSummary.replaceChildren(summaryOf(claim.type, claimValue(claim), claim.signerDid));
  importText.value = '';
  importFile.value = '';
  setError(importError, '');
  showClaimView('import');
  focusOn(importText);
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
  backToClaim();
  hideNotice();
  await loadClaims();
}

// ── Vouches I give ───────────────────────────────────────────────────────

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

// When the owner shared the claim, as the node recorded it. Left out when
// the node did not say, rather than shown as an empty row.
function sharedOnRow(rows, entry) {
  if (!entry.sharedAt) return;
  techRow(rows, 'Shared on', el('span', null, formatTime(entry.sharedAt)));
}

function sharedKey(entry) {
  if (entry.kind === 'issued') return `issued:${entry.id}`;
  return entry.tip ? `tip:${entry.tip}` : `contract:${entry.contractHash || entry.fileName || ''}`;
}

function sharedChip(entry) {
  if (entry.kind === 'issued')
    return badge(
      entry.verification?.isValid ? 'attested' : '',
      entry.verification?.isValid ? 'check-circle' : 'x-circle',
      entry.verification?.isValid ? 'Vouched by you' : 'Does not verify'
    );
  if (entry.unavailable) return badge('invalid', 'x-circle', 'Could not be read');
  const mine = issuedByClaimTip.get(entry.tip) || [];
  return mine.length > 0
    ? badge('attested', 'check-circle', 'Vouched by you')
    : badge('pending', 'clock', 'Waiting for you');
}

function renderSharedRow(entry) {
  const key = sharedKey(entry);
  const row = el('button', 'card row');
  row.type = 'button';
  if (entry.kind === 'issued') row.dataset.id = entry.id;
  else {
    row.dataset.tip = entry.tip || '';
    row.dataset.contract = entry.contractHash || '';
  }
  row.dataset.key = key;
  if (key === selectedSharedKey) row.classList.add('selected');
  const type =
    entry.kind === 'issued'
      ? sharedType(entry.templateName, entry.subjectPayload)
      : entry.unavailable
        ? 'shared'
        : sharedType(entry.templateName, entry.payload);
  const ic = el('span', 'claim-icon');
  ic.appendChild(icon(TYPE_ICONS[type] || 'shield'));
  row.appendChild(ic);
  const body = el('div', 'row-body');
  const value =
    entry.kind === 'issued'
      ? sharedValue({ payload: entry.subjectPayload || {}, fileName: '' }) ||
        shortHash(entry.claimTip)
      : entry.unavailable
        ? entry.fileName || 'Shared claim'
        : sharedValue(entry);
  body.appendChild(el('div', 'row-value', value));
  const who =
    entry.kind === 'issued' ? shortDid(entry.subjectDid || '') : shortDid(entry.sender || '');
  const when =
    entry.kind === 'issued'
      ? `vouched ${formatDay(entry.createdAt)}`
      : entry.sharedAt
        ? `asked ${formatDay(entry.sharedAt)}`
        : 'asked you to vouch';
  body.appendChild(
    el('div', 'row-sub', `${TYPE_LABELS[type] || 'Shared with you'} · ${who} · ${when}`)
  );
  row.appendChild(body);
  const proof = el('div', 'row-proof');
  proof.appendChild(sharedChip(entry));
  row.appendChild(proof);
  row.addEventListener('click', () => selectShared(key, { pane: true }));
  return row;
}

function selectShared(key, { pane = false } = {}) {
  selectedSharedKey = key;
  for (const row of sharedEl.querySelectorAll('.row'))
    row.classList.toggle('selected', row.dataset.key === key);
  const entry = sharedEntries.find((e) => sharedKey(e) === key);
  if (entry) renderSharedPanel(entry);
  if (pane) giveSplit.classList.add('show-pane');
}

// Copy an issued attestation's tree as text, for an owner on another client.
function copyIssuedButton(entry) {
  const copyBtn = button('btn small', 'copy', 'Copy as file');
  copyBtn.addEventListener('click', async () => {
    const result = await window.freedomAPI.aquaExportIssued(entry.id);
    if (!result?.success) {
      showNotice('error', errorText(result, 'The attestation could not be exported.'));
      return;
    }
    await window.freedomAPI.copyText(result.json);
    showNotice(
      '',
      'Copied. They can import it on their claim, if their Freedom has not picked it up.'
    );
  });
  return copyBtn;
}

// One attestation this wallet issued: your words, its state, when, the
// attestation hash, and Copy as file.
function renderIssuedBlock(entry, { last = false } = {}) {
  const valid = Boolean(entry.verification?.isValid);
  const tech = el('div', 'tech-rows');
  techRow(tech, 'Attestation', entry.tip || '');
  const actions = el('div', 'actions');
  actions.appendChild(copyIssuedButton(entry));
  const extra = el('div');
  extra.append(tech, actions);
  return timelineEvent({
    className: valid ? 'attestation' : 'attestation invalid',
    tone: valid ? 'tone-accent' : 'tone-danger',
    iconName: 'pen',
    who: 'You',
    verb: 'vouched',
    when: formatTime(entry.createdAt),
    words: entry.context,
    state: valid
      ? { badge: badge('attested', 'check-circle', 'Signed') }
      : { kind: 'bad', text: 'Does not verify', badge: badge('', 'x-circle', 'Does not verify') },
    extra,
    last,
  });
}

function renderSharedPanel(entry) {
  current = entry;
  const out = [];
  out.push(backLink('Asked of you', () => giveSplit.classList.remove('show-pane')));
  attestView.classList.add('hidden');

  if (entry.kind === 'issued') {
    const p = entry.subjectPayload || {};
    const type = sharedType(entry.templateName, p);
    const valid = Boolean(entry.verification?.isValid);
    out.push(
      el(
        'p',
        'panel-meta',
        `${shortDid(entry.subjectDid || '')} · vouched ${formatDay(entry.createdAt)} · no longer shared with you`
      )
    );
    const title = el('h2', 'panel-value');
    title.appendChild(
      el('span', null, sharedValue({ payload: p, fileName: '' }) || shortHash(entry.claimTip))
    );
    title.appendChild(
      valid
        ? badge('attested', 'check-circle', 'Vouched by you')
        : badge('', 'x-circle', 'Does not verify')
    );
    out.push(title);
    out.push(
      el(
        'p',
        'panel-copy',
        `A ${(TYPE_LABELS[type] || type).toLowerCase()} claim you vouched for. The owner no longer shares it with this wallet, but your vouch is still your record.`
      )
    );
    out.push(el('h3', 'section-title', 'What you signed'));
    const timeline = el('div', 'timeline');
    timeline.appendChild(renderIssuedBlock(entry, { last: true }));
    out.push(timeline);
    const rows = el('div', 'tech-rows');
    techRow(rows, 'Subject', entry.subjectDid || '');
    techRow(rows, 'Attestation', entry.tip || '');
    sharedTech.replaceChildren(techDetails(rows));
    sharedDetail.replaceChildren(...out);
    return;
  }

  if (entry.unavailable) {
    out.push(el('p', 'panel-meta', `${shortDid(entry.sender || '')} · shared with you`));
    const title = el('h2', 'panel-value');
    title.appendChild(el('span', null, entry.fileName || 'Shared claim'));
    title.appendChild(badge('invalid', 'x-circle', 'Could not be read'));
    out.push(title);
    out.push(statusLine('bad', 'x-circle', entry.reason || 'The node could not show this share.'));
    const rows = el('div', 'tech-rows');
    techRow(rows, 'Shared by', entry.sender || '');
    sharedOnRow(rows, entry);
    techRow(rows, 'Share', entry.contractHash || '');
    sharedTech.replaceChildren(techDetails(rows));
    sharedDetail.replaceChildren(...out);
    return;
  }

  const type = sharedType(entry.templateName, entry.payload);
  const mine = issuedByClaimTip.get(entry.tip) || [];
  const who = shortDid(entry.sender || '');
  out.push(
    el(
      'p',
      'panel-meta',
      `${who} · ${entry.sharedAt ? `asked ${formatTime(entry.sharedAt)}` : 'asked you to vouch'}`
    )
  );
  const title = el('h2', 'panel-value');
  title.appendChild(el('span', null, sharedValue(entry)));
  title.appendChild(
    mine.length > 0
      ? badge('attested', 'check-circle', 'Vouched by you')
      : badge('pending', 'clock', 'Waiting for you')
  );
  out.push(title);
  const box = el('div', 'preview');
  box.appendChild(el('p', 'meta', 'Their claim'));
  box.appendChild(
    el('div', 'preview-value', `${TYPE_LABELS[type] || type}: ${sharedValue(entry)}`)
  );
  box.appendChild(
    el('p', 'meta', `Signed by ${entry.payload?.signer_did || entry.sender || '(unknown)'}`)
  );
  out.push(box);
  if (mine.length > 0) {
    out.push(
      statusLine(
        'ok',
        'check-circle',
        `You vouched for this on ${formatDay(mine[mine.length - 1].createdAt)}. Their Freedom picks it up from the node.`
      )
    );
    out.push(
      el(
        'h3',
        'section-title',
        mine.length === 1 ? 'What you signed' : 'What you signed, each time'
      )
    );
    const timeline = el('div', 'timeline');
    mine.forEach((issued, i) =>
      timeline.appendChild(renderIssuedBlock(issued, { last: i === mine.length - 1 }))
    );
    out.push(timeline);
  } else {
    out.push(
      statusLine(
        'quiet',
        'users',
        `${who} shared this with your wallet so you can confirm it is true. Vouch only for what you know.`
      )
    );
    attestWords.value = '';
    setError(attestError, '');
    attestView.classList.remove('hidden');
  }
  const rows = el('div', 'tech-rows');
  techRow(rows, 'Subject', (entry.payload && entry.payload.signer_did) || '');
  techRow(rows, 'Shared by', entry.sender || '');
  sharedOnRow(rows, entry);
  techRow(rows, 'Revision', entry.tip || '');
  sharedTech.replaceChildren(techDetails(rows));
  sharedDetail.replaceChildren(...out);
}

async function attestShared() {
  if (!current || current.kind === 'issued' || current.unavailable) return;
  const entry = current;
  const context = attestWords.value.trim();
  if (!context) {
    setError(attestError, 'Say in your own words how you know this is true.');
    return;
  }
  attestBtn.disabled = true;
  setLabel(attestBtn, 'clock', 'Waiting for your signature…');
  const result = await window.freedomAPI.aquaAttestShared({
    contractHash: entry.contractHash,
    tip: entry.tip,
    context,
  });
  attestBtn.disabled = false;
  setLabel(attestBtn, 'pen', 'Sign and vouch');
  if (!result?.success) {
    setError(attestError, errorText(result, 'The vouch could not be made.'));
    return;
  }
  showNotice(
    '',
    'Done. Their Freedom picks it up from the node; if they need it another way, copy it as a file from here.'
  );
  await loadIssued();
  await loadShared();
}

async function loadShared() {
  if (!activeAddress) {
    sharedEl.replaceChildren();
    sharedDetail.replaceChildren();
    sharedTech.replaceChildren();
    return;
  }
  const result = await window.freedomAPI.aquaListShared();
  if (!result?.success) {
    sharedEntries = [];
    sharedEl.replaceChildren();
    sharedDetail.replaceChildren();
    sharedTech.replaceChildren();
    attestView.classList.add('hidden');
    if (!isLocked(result))
      sharedDetail.appendChild(
        el('div', 'meta', errorText(result, 'Shared claims could not be loaded.'))
      );
    return;
  }
  // One row per claim: the same revision shared twice is one thing to
  // vouch for, shown with its latest share. Unreadable shares stay as they are.
  const byTip = new Map();
  const entries = [];
  for (const entry of result.shared || []) {
    if (entry.unavailable || !entry.tip) {
      entries.push(entry);
      continue;
    }
    const seen = byTip.get(entry.tip);
    if (!seen) {
      byTip.set(entry.tip, entry);
      entries.push(entry);
    } else if (String(entry.sharedAt || '') > String(seen.sharedAt || '')) {
      entries[entries.indexOf(seen)] = entry;
      byTip.set(entry.tip, entry);
    }
  }
  // The ones still waiting for you first.
  entries.sort((a, b) => {
    const wa = !a.unavailable && a.tip && !issuedByClaimTip.has(a.tip) ? 0 : 1;
    const wb = !b.unavailable && b.tip && !issuedByClaimTip.has(b.tip) ? 0 : 1;
    return wa - wb;
  });
  // An attestation issued for a claim no longer shared with this wallet is
  // still this wallet's record: its own row, after the shares.
  for (const issued of issuedAll)
    if (!issued.claimTip || !byTip.has(issued.claimTip))
      entries.push({ ...issued, kind: 'issued' });
  sharedEntries = entries;
  const waiting = entries.filter(
    (e) => e.kind !== 'issued' && !e.unavailable && e.tip && !issuedByClaimTip.has(e.tip)
  ).length;
  setCount(sharedCount, waiting);
  sharedLine.textContent =
    entries.length === 0 ? 'Nothing waiting' : `${waiting} waiting · newest first`;
  if (entries.length === 0) {
    sharedEl.replaceChildren();
    attestView.classList.add('hidden');
    sharedTech.replaceChildren();
    sharedDetail.replaceChildren(
      emptyState(
        'inbox',
        'Nobody has asked you to vouch yet',
        'When someone shares a claim with your wallet address, it appears here with a Vouch button.'
      )
    );
    return;
  }
  if (!entries.some((e) => sharedKey(e) === selectedSharedKey))
    selectedSharedKey = sharedKey(entries[0]);
  sharedEl.replaceChildren(...entries.map(renderSharedRow));
  selectShared(selectedSharedKey);
}

// The attestations this wallet issued, kept for the shared rows to show;
// loadShared draws them.
async function loadIssued() {
  const result = await window.freedomAPI.aquaListIssued();
  issuedByClaimTip = new Map();
  issuedAll = [];
  if (!result?.success) {
    if (!isLocked(result))
      showNotice('error', errorText(result, 'Issued attestations could not be loaded.'));
    return;
  }
  issuedAll = result.issued || [];
  for (const entry of issuedAll) {
    if (!entry.claimTip) continue;
    if (!issuedByClaimTip.has(entry.claimTip)) issuedByClaimTip.set(entry.claimTip, []);
    issuedByClaimTip.get(entry.claimTip).push(entry);
  }
}

// ── Requests: what they ask, and exactly what leaves ─────────────────────

function resetRequest() {
  requestInput.value = '';
  requestStatus.textContent = '';
  responseOutput.value = '';
  responseBox.classList.add('hidden');
  requestAside.classList.remove('hidden');
  requestInput.disabled = false;
}

async function reviewRequest() {
  const text = requestInput.value.trim();
  if (!text) {
    requestStatus.textContent = 'Paste the request first.';
    return;
  }
  requestBtn.disabled = true;
  requestStatus.textContent = 'Decide in the sidebar what to release…';
  responseBox.classList.add('hidden');
  try {
    const result = await window.freedomAPI.aquaRespondToRequest(text);
    if (!result?.success) {
      requestStatus.textContent = errorText(result, 'The request could not be answered.');
      return;
    }
    responseOutput.value = JSON.stringify(result.response, null, 2);
    responseBox.classList.remove('hidden');
    requestAside.classList.add('hidden');
    const count = (result.response.claims || []).length;
    requestStatus.textContent =
      count === 0
        ? 'Signed. No claims are released.'
        : `Signed. ${count} claim${count === 1 ? '' : 's'} released. Send the answer to whoever asked.`;
  } finally {
    requestBtn.disabled = false;
  }
}

// ── Tabs: one panel at a time, addressed by hash (freedom://identity#attest) ──

const NAV_TARGETS = ['claims', 'attest', 'requests'];
// The Issued list used to be its own panel; its links land on Vouches I give.
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
  const hash =
    typeof window.location?.hash === 'string' ? window.location.hash.replace(/^#/, '') : '';
  showPanel(hash);
}

for (const t of NAV_TARGETS) {
  $(`nav-${t}`)?.addEventListener('click', () => {
    showPanel(t);
    if (window.location && typeof window.location.hash === 'string') window.location.hash = t;
  });
}
if (typeof window.addEventListener === 'function')
  window.addEventListener('hashchange', routeFromHash);
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
  if (!signedIn && signinCard.classList.contains('current')) {
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
const openSettings = () => {
  if (nodeMenu) nodeMenu.open = false;
  window.freedomAPI.openInNewTab?.(SETTINGS_IDENTITY_URL);
};
serviceSettingsBtn.addEventListener('click', openSettings);
nodeSettingsBtn.addEventListener('click', openSettings);
copyAddressBtn.addEventListener('click', async () => {
  const address = statusWallet.title || statusWallet.textContent;
  if (!address || address === 'none') return;
  await window.freedomAPI.copyText(address);
  setLabel(copyAddressBtn, 'check', '');
  setTimeout(() => setLabel(copyAddressBtn, 'copy', ''), 1500);
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

// ── Add a claim: the composer in place of the list ───────────────────────

function selectedType() {
  return selectedKind;
}

function selectKind(kind) {
  if (!fieldGroups[kind] || kindButtons[kind].disabled) return;
  selectedKind = kind;
  for (const [key, btn] of Object.entries(kindButtons))
    btn.setAttribute('aria-pressed', key === kind ? 'true' : 'false');
  syncTypeFields();
}

function previewText() {
  switch (selectedType()) {
    case 'name':
      return [inputs.givenName.value, inputs.middleName.value, inputs.familyName.value]
        .map((v) => String(v || '').trim())
        .filter(Boolean)
        .join(' ');
    case 'email':
      return String(inputs.email.value || '').trim();
    case 'phone':
      return String(inputs.phone.value || '').trim();
    case 'domain':
      return String(inputs.domain.value || '').trim();
    default:
      return '';
  }
}

// How it will look to a site: the value as typed, and an empty meter.
function syncPreview() {
  const type = selectedType();
  previewValue.textContent = previewText() || '—';
  const service =
    type === 'name' ? 'na' : type === 'domain' ? 'pending' : verification.token ? 'yes' : 'no';
  previewProof.replaceChildren(
    ...proofSmall({ service, people: 0, broken: null }, nodeName(serviceUrl)).childNodes
  );
}

// The three steps of the one-time code: send, enter, sign.
function syncOtpSteps() {
  const sent = Boolean(verification.target);
  const verified = Boolean(verification.token);
  const set = (row, state, note, noteNode) => {
    row.classList.toggle('done', state === 'done');
    row.classList.toggle('current', state === 'current');
    const markNode = row.querySelector('.step-mark');
    if (markNode && state === 'done') markNode.replaceChildren(icon('check'));
    else if (markNode)
      markNode.textContent = row === otpStepSend ? '1' : row === otpStepEnter ? '2' : '3';
    if (noteNode) noteNode.textContent = note || '';
  };
  set(
    otpStepSend,
    sent ? 'done' : 'current',
    sent ? `Sent to ${verification.target}` : '',
    otpSendNote
  );
  set(
    otpStepEnter,
    verified ? 'done' : sent ? 'current' : 'waiting',
    verified ? `${nodeName(serviceUrl) || 'The node'} checked it` : '',
    otpEnterNote
  );
  set(otpStepSign, verified ? 'current' : 'waiting');
}

function syncTypeFields() {
  const type = selectedType();
  for (const [key, group] of Object.entries(fieldGroups)) {
    group.classList.toggle('hidden', key !== type);
  }
  codeSection.classList.toggle('hidden', !OTP_TYPES.has(type));
  addClaimTitle.textContent = KIND_COPY[type].title;
  kindHelp.textContent = KIND_COPY[type].help;
  if (KIND_COPY[type].sendHelp) codeHelp.textContent = KIND_COPY[type].sendHelp;
  setLabel(createBtn, 'pen', type === 'domain' ? 'Sign and show the DNS record' : 'Sign and add');
  resetVerification();
  setFormError('');
}

function resetVerification() {
  verification = { target: null, token: null };
  inputs.code.value = '';
  codeStatus.textContent = '';
  verifyCodeBtn.disabled = true;
  syncOtpSteps();
  syncPreview();
}

function otpTarget() {
  return selectedType() === 'email' ? inputs.email.value.trim() : inputs.phone.value.trim();
}

async function sendCode() {
  if (busy) return;
  const type = selectedType();
  const target = otpTarget();
  if (!target) {
    setFormError(
      type === 'email' ? 'Enter the email address first.' : 'Enter the phone number first.'
    );
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
    codeStatus.textContent = `Code sent to ${verification.target}. Type it here and press Verify code.`;
    syncOtpSteps();
    focusOn(inputs.code);
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
    codeStatus.textContent = `${verification.target} verified. Press Sign and add to finish.`;
    syncOtpSteps();
    syncPreview();
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
      return {
        email: verification.target || inputs.email.value,
        verification_token: verification.token,
      };
    case 'phone':
      return {
        phone_number: verification.target || inputs.phone.value,
        verification_token: verification.token,
      };
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
      setFormError('Verify the code the node sent before saving this claim.');
      return;
    }
    if (otpTarget() !== verification.target) {
      setFormError(
        `The code was verified for ${verification.target}. Send a new code for the changed value.`
      );
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
    if (result.claim?.id) selectedClaimId = result.claim.id;
    closeComposer();
    hideNotice();
    await loadClaims();
  } finally {
    setLabel(createBtn, 'pen', type === 'domain' ? 'Sign and show the DNS record' : 'Sign and add');
    setBusy(false);
  }
}

function resetForm() {
  if (typeof form.reset === 'function') form.reset();
  syncTypeFields();
}

// Open the composer on a kind: the slot's own, or the last one used.
function openAddClaim(kind) {
  resetForm();
  selectKind(typeof kind === 'string' && fieldGroups[kind] ? kind : selectedKind);
  composer.classList.remove('hidden');
  meSplit.classList.add('hidden');
  focusOn(inputs[selectedKind === 'name' ? 'givenName' : selectedKind]);
}

function closeComposer() {
  composer.classList.add('hidden');
  meSplit.classList.remove('hidden');
  resetForm();
}

// Enter in a field submits the form; the work hangs off the button so the
// two paths are one.
function onSubmit(event) {
  event.preventDefault();
  createClaim();
}

for (const [kind, btn] of Object.entries(kindButtons))
  btn.addEventListener('click', () => selectKind(kind));
inputs.email.addEventListener('input', resetVerification);
inputs.phone.addEventListener('input', resetVerification);
for (const key of ['givenName', 'familyName', 'middleName', 'domain'])
  inputs[key].addEventListener('input', syncPreview);
sendCodeBtn.addEventListener('click', sendCode);
verifyCodeBtn.addEventListener('click', verifyCode);
form.addEventListener('submit', onSubmit);
createBtn.addEventListener('click', createClaim);
addClaimBtn.addEventListener('click', () => openAddClaim());
startNameBtn.addEventListener('click', () => openAddClaim('name'));
cancelBtn.addEventListener('click', closeComposer);
cancelComposeBtn.addEventListener('click', closeComposer);

wireDialog(removeDialog, ['remove-cancel', 'remove-close']);
wireDialog(vouchesDialog, ['vouches-done', 'vouches-close']);
vouchesRemoveBtn.addEventListener('click', () => {
  if (current) openRemoveDialog(current);
});

shareBtn.addEventListener('click', shareClaim);
$('share-cancel').addEventListener('click', backToClaim);
$('share-cancel-btn').addEventListener('click', backToClaim);
importBtn.addEventListener('click', importAttestation);
$('import-cancel').addEventListener('click', backToClaim);
$('import-cancel-btn').addEventListener('click', backToClaim);
attestBtn.addEventListener('click', attestShared);
removeBtn.addEventListener('click', removeClaim);
requestBtn.addEventListener('click', reviewRequest);
requestCancel.addEventListener('click', resetRequest);
responseCopy.addEventListener('click', async () => {
  await window.freedomAPI.copyText(responseOutput.value);
  requestStatus.textContent = 'Answer copied.';
});

if (typeof window.freedomAPI.onAquaClaimsChanged === 'function') {
  window.freedomAPI.onAquaClaimsChanged(() => {
    loadStatus().then(loadAll);
  });
}

// The views start closed whatever the markup says, so the script is the
// one place that decides what shows.
closeComposer();
resetRequest();
loadStatus().then(() => loadAll({ pull: true }));
