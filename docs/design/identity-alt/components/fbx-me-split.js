// <fbx-me-split selected="name" set="full|one" mobile="pane|list">…panel content…</fbx-me-split>
// Desktop: claim table (fbx-claim-list) left, the selected claim's panel right.
// Phone: mobile="pane" shows the panel only (its head carries "All claims"); "list" shows the table only.
{ // scoped
const _d=(el,...c)=>{if(!/(^|\s)(hidden|block|flex|inline|inline-block|inline-flex|grid|contents)(\s|$)/.test(el.className))el.classList.add(...c.slice(0,1));el.classList.add(...c.slice(1));};
class FbxMeSplit extends HTMLElement {
  connectedCallback() {
    if (this._done) return; this._done = true;
    const go = () => this.render();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true }); else go();
  }
  render() {
    const kids = [...this.childNodes];
    const pane = (this.getAttribute('mobile') || 'pane') === 'pane';
    _d(this, 'block');
    this.innerHTML = `<div class="grid gap-8 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:items-start">
      <section aria-label="Your claims" class="min-w-0 ${pane ? 'hidden lg:block' : ''}"><fbx-claim-list selected="${this.getAttribute('selected') || 'name'}" set="${this.getAttribute('set') || 'full'}" legend></fbx-claim-list></section>
      <section data-p class="min-w-0 rounded-lg border border-border bg-card p-5 md:p-7 ${pane ? '' : 'hidden lg:block'}"></section>
    </div>`;
    this.querySelector('[data-p]').append(...kids);
  }
}
customElements.define('fbx-me-split', FbxMeSplit);
}
