/**
 * "Share identity": the consent screen for a disclosure request
 * (src/main/aqua/disclosure.js, docs/aqua-disclosure.md).
 *
 * A site calls `aqua_requestDisclosure` on the provider, or the user pastes
 * a request on freedom://identity and main pushes it here. Either way the
 * screen lists each requested claim type with the stored claim main matched
 * (value, attestation count) and a checkbox; required entries start ticked,
 * optional ones not, a type with no claim is shown as missing. Nothing is
 * auto-approved and nothing is remembered per site: Reject and Share are
 * the only ways out, and Share hands the ticks to main, which builds the
 * response. The screen never sees a tree.
 */
import { walletState, registerScreenHider, hideAllSubscreens } from './wallet-state.js';
import { assertNoSignatureInFlight } from './signature-flight.js';
import { open as openSidebarPanel } from '../sidebar.js';

const TYPE_LABELS = { name: 'Name', email: 'Email address', phone: 'Phone number', domain: 'Domain' };
const FIELD_LABELS = {
  given_name: 'Given name', family_name: 'Family name', middle_name: 'Middle name', nickname: 'Nickname',
  name_prefix: 'Prefix', name_suffix: 'Suffix', preferred_username: 'Username', email: 'Email',
  phone_number: 'Phone', display_name: 'Display name', domain_name: 'Domain', provider_id: 'Domain',
  proof_url: 'Proof URL', valid_from: 'Valid from', valid_until: 'Valid until',
};

let screen;
let backBtn;
let siteEl;
let purposeEl;
let listEl;
let errorEl;
let rejectBtn;
let shareBtn;
let pending = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

export function initAquaDisclose() {
  screen = document.getElementById('sidebar-aqua-disclose');
  backBtn = document.getElementById('aqua-disclose-back');
  siteEl = document.getElementById('aqua-disclose-site');
  purposeEl = document.getElementById('aqua-disclose-purpose');
  listEl = document.getElementById('aqua-disclose-list');
  errorEl = document.getElementById('aqua-disclose-error');
  rejectBtn = document.getElementById('aqua-disclose-reject');
  shareBtn = document.getElementById('aqua-disclose-share');
  registerScreenHider(() => screen?.classList.add('hidden'));
  backBtn?.addEventListener('click', rejectDisclosure);
  rejectBtn?.addEventListener('click', rejectDisclosure);
  shareBtn?.addEventListener('click', approveDisclosure);

  const aqua = window.aqua;
  if (aqua?.onDisclosureRequest) {
    aqua.onDisclosureRequest((request) =>
      showAquaDisclosure({ label: request.requester?.label || 'Pasted request', address: request.address, request: request.request })
        .then(
          (response) => aqua.respondToDisclosureRequest({ requestId: request.requestId, response }),
          (err) => aqua.respondToDisclosureRequest({ requestId: request.requestId, error: { code: err?.code || 'REJECTED', message: err?.message || 'Rejected' } })
        )
    );
  }
}

function valueOf(summary) {
  const p = summary.payload || {};
  return Object.entries(p)
    .filter(([key]) => key !== 'valid_from' && key !== 'valid_until')
    .map(([key, value]) => `${FIELD_LABELS[key] || key}: ${value}`)
    .join(' · ');
}

function renderEntry(entry) {
  const row = el('label', 'aqua-disclose-row');
  const box = el('input');
  box.type = 'checkbox';
  box.className = 'aqua-disclose-check';
  box.dataset.type = entry.type;
  const body = el('div', 'aqua-disclose-body');
  const title = el('div', 'aqua-disclose-title');
  title.appendChild(el('span', null, TYPE_LABELS[entry.type] || entry.type));
  title.appendChild(el('span', 'aqua-disclose-tag', entry.required ? 'required' : 'optional'));
  body.appendChild(title);
  if (!entry.summary) {
    box.checked = false;
    box.disabled = true;
    row.classList.add('missing');
    body.appendChild(el('div', 'aqua-disclose-meta', 'You have no such claim'));
  } else {
    box.checked = entry.required;
    body.appendChild(el('div', 'aqua-disclose-value', valueOf(entry.summary)));
    const status = entry.summary.attested > 0
      ? `Attested by ${entry.summary.attested}`
      : 'Self-signed, not attested';
    body.appendChild(el('div', 'aqua-disclose-meta', status));
    if (entry.fields && entry.fields.length > 1) {
      const fields = el('div', 'aqua-disclose-fields');
      for (const field of entry.fields) {
        const f = el('label', 'aqua-disclose-field');
        const fbox = el('input', 'aqua-disclose-field-check');
        fbox.type = 'checkbox';
        fbox.checked = true;
        fbox.dataset.field = field;
        f.appendChild(fbox);
        f.appendChild(el('span', null, FIELD_LABELS[field] || field));
        fields.appendChild(f);
      }
      body.appendChild(fields);
    }
  }
  row.appendChild(box);
  row.appendChild(body);
  return row;
}

/**
 * Show the screen for a request and resolve with main's response once the
 * user shares, or reject with code 4001 on Reject or Back.
 *
 * @param {{ label: string, address: string, request: object }} args
 */
export async function showAquaDisclosure({ label, address, request }) {
  assertNoSignatureInFlight();
  if (pending) throw Object.assign(new Error('Another disclosure request is open'), { code: -32002 });
  const prepared = await window.aqua.prepareDisclosure({ request, address });
  if (!prepared?.success) {
    throw Object.assign(new Error(prepared?.error?.message || 'Invalid disclosure request'), { code: -32602 });
  }
  return new Promise((resolve, reject) => {
    pending = { request, address, entries: prepared.entries, resolve, reject };
    if (siteEl) siteEl.textContent = label;
    if (purposeEl) {
      purposeEl.textContent = prepared.request.purpose ? `“${prepared.request.purpose}”` : 'No purpose given';
    }
    listEl?.replaceChildren(...prepared.entries.map(renderEntry));
    hideError();
    if (shareBtn) shareBtn.disabled = false;
    hideAllSubscreens();
    walletState.identityView?.classList.add('hidden');
    screen?.classList.remove('hidden');
    openSidebarPanel();
  });
}

function selections() {
  const out = [];
  for (const row of listEl?.querySelectorAll('.aqua-disclose-row') || []) {
    const box = row.querySelector('.aqua-disclose-check');
    if (!box || box.disabled || !box.checked) continue;
    const type = box.dataset.type;
    const entry = pending.entries.find((e) => e.type === type);
    if (!entry?.claimId) continue;
    const selection = { type, claimId: entry.claimId };
    const fieldBoxes = row.querySelectorAll('.aqua-disclose-field-check');
    if (fieldBoxes.length > 0) {
      selection.fields = fieldBoxes.filter((b) => b.checked).map((b) => b.dataset.field);
    }
    out.push(selection);
  }
  return out;
}

async function approveDisclosure() {
  if (!pending) return;
  const chosen = selections();
  if (chosen.some((s) => Array.isArray(s.fields) && s.fields.length === 0)) {
    showError('Tick at least one field of each claim you share, or untick the claim.');
    return;
  }
  if (shareBtn) shareBtn.disabled = true;
  const current = pending;
  const result = await window.aqua.buildDisclosure({ request: current.request, selections: chosen, address: current.address });
  if (!result?.success) {
    if (shareBtn) shareBtn.disabled = false;
    showError(result?.error?.message || 'The response could not be built.');
    return;
  }
  pending = null;
  close();
  current.resolve(result.response);
}

function rejectDisclosure() {
  if (!pending) return;
  const current = pending;
  pending = null;
  close();
  current.reject({ code: 4001, message: 'User rejected the request' });
}

function close() {
  screen?.classList.add('hidden');
  walletState.identityView?.classList.remove('hidden');
  listEl?.replaceChildren();
  hideError();
}

function showError(message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function hideError() {
  errorEl?.classList.add('hidden');
}
