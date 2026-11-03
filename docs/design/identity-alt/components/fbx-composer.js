// <fbx-composer kind="name|email|phone|domain" node="dev.aquafire" disabled="email,phone" back="/fbx-me">…form…</fbx-composer>
{ // scoped
const _d=(el,...c)=>{if(!/(^|\s)(hidden|block|flex|inline|inline-block|inline-flex|grid|contents)(\s|$)/.test(el.className))el.classList.add(...c.slice(0,1));el.classList.add(...c.slice(1));};
class FbxComposer extends HTMLElement {
  connectedCallback() {
    if (this._done) return; this._done = true;
    const go = () => this.render();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true }); else go();
  }
  render() {
    const kids = [...this.childNodes];
    const node = this.getAttribute('node') || 'dev.aquafire';
    _d(this, 'block');
    this.innerHTML = `<div class="mx-auto max-w-5xl">
      <a href="${this.getAttribute('back') || '/fbx-me'}" class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><aq-icon name="arrow-left" class="size-3.5"></aq-icon>All claims</a>
      <h2 class="mt-3 text-2xl font-semibold tracking-tight text-foreground">Add a claim</h2>
      <p class="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground"><aq-icon name="server" class="size-4"></aq-icon>Kept on ${node}</p>
      <div class="mt-6 grid gap-8 md:grid-cols-[17rem_minmax(0,1fr)]">
        <fbx-kinds selected="${this.getAttribute('kind') || 'name'}" disabled="${this.getAttribute('disabled') || ''}" node="${node}"></fbx-kinds>
        <div data-f class="min-w-0 rounded-lg border border-border bg-card p-5 md:p-7"></div>
      </div>
    </div>`;
    this.querySelector('[data-f]').append(...kids);
  }
}
customElements.define('fbx-composer', FbxComposer);
}
