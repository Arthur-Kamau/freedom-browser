// <fbx-step num="1" title="Send the code" state="done|current|waiting|error" note="Sent at 10:02">…controls (shown when current or error)…</fbx-step>
{ // scoped
const _d=(el,...c)=>{if(!/(^|\s)(hidden|block|flex|inline|inline-block|inline-flex|grid|contents)(\s|$)/.test(el.className))el.classList.add(...c.slice(0,1));el.classList.add(...c.slice(1));};
class FbxStep extends HTMLElement {
  connectedCallback() {
    if (this._done) return; this._done = true;
    const go = () => this.render();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true }); else go();
  }
  render() {
    const kids = [...this.childNodes];
    const st = this.getAttribute('state') || 'waiting';
    const num = this.getAttribute('num') || '1';
    const title = this.getAttribute('title') || '';
    const note = this.getAttribute('note') || '';
    _d(this, 'grid');
    this.classList.add('grid-cols-[1.75rem_minmax(0,1fr)]', 'gap-x-3', 'py-4');
    const mark = st === 'done'
      ? '<span class="inline-flex size-7 items-center justify-center rounded-full bg-success/15 text-success"><aq-icon name="check" class="size-4"></aq-icon></span>'
      : st === 'error'
        ? '<span class="inline-flex size-7 items-center justify-center rounded-full bg-destructive/15 text-destructive"><aq-icon name="alert" class="size-4"></aq-icon></span>'
        : `<span class="inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold ${st === 'current' ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground'}">${num}</span>`;
    const open = st === 'current' || st === 'error';
    this.innerHTML = `${mark}<div class="min-w-0 pt-1">
      <p class="text-sm ${open ? 'font-semibold text-foreground' : st === 'done' ? 'text-foreground' : 'text-muted-foreground'}">${title}${note ? `<span class="ml-2 text-xs font-normal ${st === 'done' ? 'text-success' : 'text-muted-foreground'}">${note}</span>` : ''}</p>
      <div data-k class="${open ? 'mt-3' : 'hidden'}"></div></div>`;
    this.querySelector('[data-k]').append(...kids);
  }
}
customElements.define('fbx-step', FbxStep);
}
