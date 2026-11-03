// <fbx-proof service="yes|pending|no|na|failed|expired|elsewhere" node="dev.aquafire" people="2"
//            who="Kenn Wafula,Bob Otieno" broken="reason text" size="sm|lg"></fbx-proof>
// Two marks. The icon names the source (shield = the node's check, people = vouches).
// Good uses the source's colour (service / success); pending, expired = amber; failed = red.
// na (no node can check this kind, e.g. a name) = a quiet muted shield, never a warning.
// "not yet" / "not checked here" = an empty dashed mark. broken = one red mark replaces both.
{ // scoped
const _d=(el,...c)=>{if(!/(^|\s)(hidden|block|flex|inline|inline-block|inline-flex|grid|contents)(\s|$)/.test(el.className))el.classList.add(...c.slice(0,1));el.classList.add(...c.slice(1));};
const SVC = {
  yes:       { icon: 'shield-check', chip: 'bg-service-muted text-service', tile: 'bg-service-muted text-service', short: 'Checked', long: (n) => `Checked by ${n}` },
  pending:   { icon: 'clock', chip: 'bg-warning/15 text-warning', tile: 'bg-warning/15 text-warning', short: 'Pending', long: (n) => `Waiting on ${n}` },
  expired:   { icon: 'history', chip: 'bg-warning/15 text-warning', tile: 'bg-warning/15 text-warning', short: 'Expired', long: (n) => `Check by ${n} expired` },
  failed:    { icon: 'shield-x', chip: 'bg-destructive/10 text-destructive', tile: 'bg-destructive/10 text-destructive', short: 'Failed', long: (n) => `${n} could not confirm it` },
  na:        { icon: 'shield', chip: 'text-muted-foreground/70', tile: 'bg-muted text-muted-foreground', short: '', long: () => 'Names are vouched for, not checked' },
  no:        { icon: 'shield', chip: 'border border-dashed border-border text-muted-foreground', tile: 'border border-dashed border-border text-muted-foreground', short: 'Not yet', long: () => 'Not checked yet' },
  elsewhere: { icon: 'shield', chip: 'border border-dashed border-border text-muted-foreground', tile: 'border border-dashed border-border text-muted-foreground', short: 'Not here', long: (n) => `Not checked on ${n}` },
};
class FbxProof extends HTMLElement {
  connectedCallback() { this.render(); }
  render() {
    const svcKey = this.getAttribute('service') || 'no';
    const s = SVC[svcKey] || SVC.no;
    const node = this.getAttribute('node') || 'dev.aquafire';
    const people = parseInt(this.getAttribute('people') || '0', 10);
    const who = (this.getAttribute('who') || '').split(',').map(x => x.trim()).filter(Boolean);
    const broken = this.getAttribute('broken');
    const lg = this.getAttribute('size') === 'lg';
    _d(this, lg ? 'block' : 'inline-flex');

    if (!lg) {
      if (broken !== null) {
        this.innerHTML = `<span class="inline-flex h-6 items-center gap-1 rounded-md bg-destructive/10 px-2 text-xs font-medium text-destructive"><aq-icon name="alert" class="size-3.5"></aq-icon>Does not verify</span>`;
        return;
      }
      const shown = Math.min(people, 3);
      const pips = Array.from({ length: shown }, () => '<span class="size-1.5 rounded-full bg-success"></span>').join('');
      const ppl = people > 0
        ? `<span class="inline-flex h-6 items-center gap-1 rounded-md bg-success/12 px-2 text-xs font-medium text-success" title="Vouched by ${people}"><aq-icon name="users" class="size-3.5"></aq-icon><span class="inline-flex gap-0.5">${pips}</span>${people > 3 ? `+${people - 3}` : ''}<span class="sr-only">${people} vouches</span></span>`
        : `<span class="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground"><aq-icon name="users" class="size-3.5"></aq-icon>0</span>`;
      this.classList.add('gap-1.5', 'items-center');
      const label = s.short || `<span class="sr-only">${s.long(node)}</span>`;
      this.innerHTML = `<span class="inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium ${s.chip}" title="${s.long(node)}"><aq-icon name="${s.icon}" class="size-3.5"></aq-icon>${label}</span>${ppl}`;
      return;
    }

    if (broken !== null) {
      this.innerHTML = `<div class="flex gap-3 rounded-lg bg-destructive/10 p-4" role="alert">
        <span class="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-destructive/15 text-destructive"><aq-icon name="alert" class="size-5"></aq-icon></span>
        <div><p class="text-sm font-semibold text-destructive">Does not verify</p><p class="mt-0.5 text-sm leading-relaxed text-foreground">${broken}</p></div></div>`;
      return;
    }
    const pipLinks = Array.from({ length: Math.min(people, 5) }, (_, i) => {
      const name = who[i] || `Vouch ${i + 1}`;
      return `<a href="/fbx-evidence" title="${name}" aria-label="Vouch from ${name}" class="size-3 rounded-full bg-success ring-2 ring-card transition-transform hover:scale-125"></a>`;
    }).join('');
    const tile = (cls, inner) => `<span class="inline-flex size-9 shrink-0 items-center justify-center rounded-md ${cls}">${inner}</span>`;
    const pplTile = people > 0 ? 'bg-success/12 text-success' : 'border border-dashed border-border text-muted-foreground';
    this.innerHTML = `<div class="grid gap-3 sm:grid-cols-2">
      <div class="flex items-center gap-3 rounded-lg border border-border p-3">
        ${tile(s.tile, `<aq-icon name="${s.icon}" class="size-5"></aq-icon>`)}
        <div class="min-w-0"><p class="text-xs text-muted-foreground">Node check</p><p class="text-sm font-medium ${svcKey === 'na' ? 'text-muted-foreground' : 'text-foreground'}">${s.long(node)}</p></div>
      </div>
      <div class="flex items-center gap-3 rounded-lg border border-border p-3">
        ${tile(pplTile, '<aq-icon name="users" class="size-5"></aq-icon>')}
        <div class="min-w-0 flex-1"><p class="text-xs text-muted-foreground">People who know you</p>
          <div class="flex flex-wrap items-center gap-x-2"><p class="text-sm font-medium text-foreground">${people > 0 ? `Vouched by ${people}` : 'No vouches yet'}</p>${people > 0 ? `<span class="flex items-center gap-1.5">${pipLinks}${people > 5 ? `<span class="text-xs text-muted-foreground">+${people - 5}</span>` : ''}</span>` : ''}</div>
        </div>
      </div>
    </div>`;
  }
}
customElements.define('fbx-proof', FbxProof);
}
