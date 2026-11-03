// <fbx-claim-row kind="name|email|phone|domain" value="Alice Mwangi" signed="28 Oct" service="yes|pending|no|na|failed|expired|elsewhere"
//                node="dev.aquafire" people="2" who="Kenn Wafula,Bob Otieno" broken="…" href="/fbx-me" selected></fbx-claim-row>
{ // scoped
const _d=(el,...c)=>{if(!/(^|\s)(hidden|block|flex|inline|inline-block|inline-flex|grid|contents)(\s|$)/.test(el.className))el.classList.add(...c.slice(0,1));el.classList.add(...c.slice(1));};
const KIND = { name: ['user', 'Name'], email: ['mail', 'Email'], phone: ['phone', 'Phone'], domain: ['globe', 'Domain'] };
class FbxClaimRow extends HTMLElement {
  connectedCallback() { this.render(); }
  render() {
    const k = KIND[this.getAttribute('kind')] || KIND.name;
    const value = this.getAttribute('value') || '';
    const signed = this.getAttribute('signed') || '';
    const href = this.getAttribute('href') || '#';
    const sel = this.hasAttribute('selected');
    const broken = this.getAttribute('broken');
    _d(this, 'block');
    const proof = `<fbx-proof service="${this.getAttribute('service') || 'no'}" node="${this.getAttribute('node') || 'dev.aquafire'}" people="${this.getAttribute('people') || '0'}" ${broken !== null ? `broken="${broken}"` : ''}></fbx-proof>`;
    this.innerHTML = `<a href="${href}" ${sel ? 'aria-current="true"' : ''} class="flex items-center gap-3 px-4 py-3.5 transition-colors ${sel ? 'bg-accent' : 'hover:bg-accent/60'}">
      <span class="inline-flex size-8 shrink-0 items-center justify-center rounded-md ${sel ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}"><aq-icon name="${k[0]}" class="size-4"></aq-icon></span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium text-foreground">${value}</p>
        <p class="text-xs text-muted-foreground">${k[1]} · you signed ${signed}</p>
        <div class="mt-2 sm:hidden">${proof}</div>
      </div>
      <div class="hidden shrink-0 sm:block">${proof}</div>
    </a>`;
  }
}
customElements.define('fbx-claim-row', FbxClaimRow);
}
