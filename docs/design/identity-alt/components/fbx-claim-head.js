// <fbx-claim-head kind="name" value="Alice Mwangi" signed="28 Oct 2026" service="na" node="dev.aquafire" people="2"
//                 who="Kenn Wafula,Bob Otieno" broken="…" back="/fbx-me-list"></fbx-claim-head>
{ // scoped
const _d=(el,...c)=>{if(!/(^|\s)(hidden|block|flex|inline|inline-block|inline-flex|grid|contents)(\s|$)/.test(el.className))el.classList.add(...c.slice(0,1));el.classList.add(...c.slice(1));};
const KIND = { name: ['user', 'Name'], email: ['mail', 'Email'], phone: ['phone', 'Phone'], domain: ['globe', 'Domain'] };
class FbxClaimHead extends HTMLElement {
  connectedCallback() { this.render(); }
  render() {
    const k = KIND[this.getAttribute('kind')] || KIND.name;
    const back = this.getAttribute('back');
    const broken = this.getAttribute('broken');
    _d(this, 'grid', 'gap-4');
    this.innerHTML = `${back ? `<a href="${back}" class="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground lg:hidden"><aq-icon name="arrow-left" class="size-3.5"></aq-icon>All claims</a>` : ''}
      <div>
        <p class="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><aq-icon name="${k[0]}" class="size-3.5"></aq-icon>${k[1]} · you signed ${this.getAttribute('signed') || ''}</p>
        <h2 class="mt-1 break-words text-2xl font-semibold tracking-tight text-foreground">${this.getAttribute('value') || ''}</h2>
      </div>
      <fbx-proof size="lg" service="${this.getAttribute('service') || 'no'}" node="${this.getAttribute('node') || 'dev.aquafire'}" people="${this.getAttribute('people') || '0'}" who="${this.getAttribute('who') || ''}" ${broken !== null ? `broken="${broken}"` : ''}></fbx-proof>`;
  }
}
customElements.define('fbx-claim-head', FbxClaimHead);
}
