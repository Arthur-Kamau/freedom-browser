// <fbx-btn label="Ask someone to vouch" icon="users" variant="primary|outline|ghost|danger" size="sm|md" href="/route" disabled full></fbx-btn>
{ // scoped
const _d=(el,...c)=>{if(!/(^|\s)(hidden|block|flex|inline|inline-block|inline-flex|grid|contents)(\s|$)/.test(el.className))el.classList.add(...c.slice(0,1));el.classList.add(...c.slice(1));};
const V = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  outline: 'border border-border bg-background text-foreground hover:bg-accent',
  ghost: 'text-foreground hover:bg-accent',
  danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  'danger-outline': 'border border-destructive/40 text-destructive hover:bg-destructive/10',
};
class FbxBtn extends HTMLElement {
  connectedCallback() { this.render(); }
  render() {
    const label = this.getAttribute('label') || '';
    const icon = this.getAttribute('icon');
    const v = V[this.getAttribute('variant') || 'outline'] || V.outline;
    const sm = this.getAttribute('size') === 'sm';
    const href = this.getAttribute('href');
    const dis = this.hasAttribute('disabled');
    const full = this.hasAttribute('full');
    _d(this, full ? 'flex' : 'inline-flex');
    const cls = `inline-flex ${full ? 'w-full' : ''} items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[background-color,transform] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${sm ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm'} ${dis ? 'pointer-events-none opacity-50' : ''} ${v}`;
    const inner = `${icon ? `<aq-icon name="${icon}" class="${sm ? 'size-3.5' : 'size-4'}"></aq-icon>` : ''}${label}`;
    this.innerHTML = href && !dis
      ? `<a href="${href}" class="${cls}">${inner}</a>`
      : `<button type="button" ${dis ? 'disabled' : ''} class="${cls}">${inner}</button>`;
  }
}
customElements.define('fbx-btn', FbxBtn);
}
