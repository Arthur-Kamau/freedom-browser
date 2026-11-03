// <fbx-claim-list selected="name|email|domain|none" set="full|one|local|broken"></fbx-claim-list>
// Claims live on the node you are signed in to, so each set belongs to one node.
{ // scoped
const _d=(el,...c)=>{if(!/(^|\s)(hidden|block|flex|inline|inline-block|inline-flex|grid|contents)(\s|$)/.test(el.className))el.classList.add(...c.slice(0,1));el.classList.add(...c.slice(1));};
const AQ = 'dev.aquafire';
// [kind, value, signed, service, people, href, broken]
const ROWS = {
  full: [
    ['name', 'Alice Mwangi', '28 Oct', 'na', '2', '/fbx-me'],
    ['email', 'alice@inblock.io', '29 Oct', 'yes', '0', '/fbx-me-email'],
    ['domain', 'inblock.io', '2 Nov', 'pending', '0', '/fbx-me-domain'],
  ],
  broken: [
    ['name', 'Alice Mwangi', '28 Oct', 'na', '2', '/fbx-me'],
    ['email', 'alice@inblock.io', '29 Oct', 'yes', '0', '/fbx-me-broken', 'The service’s check no longer matches this claim.'],
    ['domain', 'inblock.io', '2 Nov', 'pending', '0', '/fbx-me-domain'],
  ],
  one: [['name', 'Alice Mwangi', '3 Nov', 'na', '0', '/fbx-me-new']],
  local: [['name', 'Alice Mwangi', '1 Nov', 'na', '0', '/fbx-node-local']],
};
const NODE = { full: AQ, broken: AQ, one: AQ, local: 'Local node' };
const SLOTS = {
  full: [['phone', 'Add your phone number', '/fbx-add-phone']],
  broken: [['phone', 'Add your phone number', '/fbx-add-phone']],
  one: [['mail', 'Add your email', '/fbx-add-email'], ['phone', 'Add your phone number', '/fbx-add-phone'], ['globe', 'Add a domain you own', '/fbx-add-domain']],
  local: [['copy', 'Copy claims from dev.aquafire', '/fbx-node-copy'], ['globe', 'Add a domain you own', '/fbx-add-local']],
};
class FbxClaimList extends HTMLElement {
  connectedCallback() { this.render(); }
  render() {
    const set = ROWS[this.getAttribute('set')] ? this.getAttribute('set') : 'full';
    const sel = this.getAttribute('selected') || 'name';
    const rows = ROWS[set];
    _d(this, 'block');
    const r = rows.map(([k, v, s, svc, p, h, b]) => `<fbx-claim-row kind="${k}" value="${v}" signed="${s}" service="${svc}" node="${NODE[set]}" people="${p}" href="${h}" ${b ? `broken="${b}"` : ''} ${k === sel ? 'selected' : ''}></fbx-claim-row>`).join('');
    const slots = SLOTS[set].map(([i, t, h]) => `<a href="${h}" class="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground">
        <span class="inline-flex size-8 items-center justify-center rounded-md border border-dashed border-border"><aq-icon name="${i}" class="size-4"></aq-icon></span>
        <span class="flex-1">${t}</span><aq-icon name="${i === 'copy' ? 'arrow-right' : 'plus'}" class="size-4"></aq-icon></a>`).join('');
    this.innerHTML = `<div class="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-foreground">What you claim</h2>
          <p class="text-xs text-muted-foreground">${rows.length} claim${rows.length === 1 ? '' : 's'} on ${NODE[set]}</p>
        </div>
        <fbx-btn size="sm" label="Add a claim" icon="plus" href="${set === 'local' ? '/fbx-add-local' : '/fbx-add'}"></fbx-btn>
      </div>
      <div class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">${r}${slots}</div>`;
  }
}
customElements.define('fbx-claim-list', FbxClaimList);
}
