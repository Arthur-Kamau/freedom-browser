// <fbx-kinds selected="name|email|phone|domain" disabled="email,phone" node="Local node"></fbx-kinds>
{ // scoped
const _d=(el,...c)=>{if(!/(^|\s)(hidden|block|flex|inline|inline-block|inline-flex|grid|contents)(\s|$)/.test(el.className))el.classList.add(...c.slice(0,1));el.classList.add(...c.slice(1));};
const K = [
  ['name', 'user', 'Name', 'People who know you vouch for it', '/fbx-add'],
  ['email', 'mail', 'Email address', 'Checked with a code sent to the inbox', '/fbx-add-email'],
  ['phone', 'phone', 'Phone number', 'Checked with a code sent by SMS', '/fbx-add-phone'],
  ['domain', 'globe', 'Domain', 'Checked with a DNS record you add', '/fbx-add-domain'],
];
class FbxKinds extends HTMLElement {
  connectedCallback() { this.render(); }
  render() {
    const sel = this.getAttribute('selected') || 'name';
    const off = (this.getAttribute('disabled') || '').split(',').map(s => s.trim()).filter(Boolean);
    const node = this.getAttribute('node') || 'this node';
    _d(this, 'block');
    this.innerHTML = `<fieldset><legend class="text-sm font-semibold text-foreground">What do you want to claim?</legend>
      <div class="mt-3 grid gap-2" role="radiogroup">${K.map(([id, icon, label, how, href]) => {
        const on = id === sel, dis = off.includes(id);
        if (dis) return `<div role="radio" aria-checked="false" aria-disabled="true" class="flex items-center gap-3 rounded-lg border border-dashed border-border px-3.5 py-3 opacity-70">
          <span class="inline-flex size-4 shrink-0 rounded-full border border-input"></span>
          <aq-icon name="${icon}" class="size-4 text-muted-foreground"></aq-icon>
          <span class="min-w-0"><span class="block text-sm font-medium text-muted-foreground">${label}</span><span class="block text-xs text-muted-foreground">${node} can’t check this</span></span>
        </div>`;
        return `<a href="${href}" role="radio" aria-checked="${on}" class="flex items-center gap-3 rounded-lg border px-3.5 py-3 transition-colors ${on ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'}">
          <span class="inline-flex size-4 shrink-0 items-center justify-center rounded-full border ${on ? 'border-primary' : 'border-input'}">${on ? '<span class="size-2 rounded-full bg-primary"></span>' : ''}</span>
          <aq-icon name="${icon}" class="size-4 ${on ? 'text-primary' : 'text-muted-foreground'}"></aq-icon>
          <span class="min-w-0"><span class="block text-sm font-medium text-foreground">${label}</span><span class="block text-xs text-muted-foreground">${how}</span></span>
        </a>`;
      }).join('')}</div>
      ${off.length ? `<p class="mt-3 text-xs leading-relaxed text-muted-foreground">To claim those, switch to a node that checks them, in the Node menu above.</p>` : ''}</fieldset>`;
  }
}
customElements.define('fbx-kinds', FbxKinds);
}
