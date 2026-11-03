// <fbx-copy label="Name" value="_aqua.inblock.io"></fbx-copy>
{ // scoped
const _d=(el,...c)=>{if(!/(^|\s)(hidden|block|flex|inline|inline-block|inline-flex|grid|contents)(\s|$)/.test(el.className))el.classList.add(...c.slice(0,1));el.classList.add(...c.slice(1));};
class FbxCopy extends HTMLElement {
  connectedCallback() { this.render(); }
  render() {
    const label = this.getAttribute('label') || '';
    const value = this.getAttribute('value') || '';
    _d(this, 'grid');
    this.classList.add('grid-cols-[5rem_minmax(0,1fr)_auto]', 'items-center', 'gap-3', 'px-3', 'py-2.5');
    this.innerHTML = `<span class="text-xs text-muted-foreground">${label}</span>
      <code class="break-all font-mono text-sm text-foreground">${value}</code>
      <button type="button" aria-label="Copy ${label}" class="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-foreground hover:bg-accent"><aq-icon name="copy" class="size-3.5"></aq-icon>Copy</button>`;
  }
}
customElements.define('fbx-copy', FbxCopy);
}
