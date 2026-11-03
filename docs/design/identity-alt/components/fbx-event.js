// <fbx-event tone="person|service|signed|pending|import|you|failed" who="Bob Otieno" address="0x9a3f…b3a2" when="1 Nov 2026, 10:12" words="…" hash="0x…" verb="…" id-anchor="v1" last></fbx-event>
{ // scoped
const _d=(el,...c)=>{if(!/(^|\s)(hidden|block|flex|inline|inline-block|inline-flex|grid|contents)(\s|$)/.test(el.className))el.classList.add(...c.slice(0,1));el.classList.add(...c.slice(1));};
const T = {
  person: ['user-check', 'bg-success/12 text-success', 'vouched'],
  service: ['shield-check', 'bg-service-muted text-service', 'checked'],
  signed: ['pen', 'bg-muted text-foreground', 'signed the claim'],
  you: ['pen', 'bg-primary/15 text-primary', 'vouched'],
  pending: ['clock', 'bg-warning/15 text-warning', 'waiting'],
  import: ['import', 'bg-success/12 text-success', 'vouched, imported'],
  failed: ['shield-x', 'bg-destructive/10 text-destructive', 'no longer matches'],
};
class FbxEvent extends HTMLElement {
  connectedCallback() { this.render(); }
  render() {
    const [icon, tone, verb] = T[this.getAttribute('tone')] || T.person;
    const who = this.getAttribute('who') || '';
    const addr = this.getAttribute('address') || '';
    const when = this.getAttribute('when') || '';
    const words = this.getAttribute('words') || '';
    const hash = this.getAttribute('hash') || '';
    const last = this.hasAttribute('last');
    const v = this.getAttribute('verb') || verb;
    const anchor = this.getAttribute('id-anchor');
    if (anchor) this.id = anchor;
    _d(this, 'grid');
    this.classList.add('grid-cols-[2rem_minmax(0,1fr)]', 'gap-x-3');
    this.innerHTML = `<div class="flex flex-col items-center">
        <span class="inline-flex size-8 items-center justify-center rounded-full ${tone}"><aq-icon name="${icon}" class="size-4"></aq-icon></span>
        ${last ? '' : '<span class="w-px flex-1 bg-border"></span>'}
      </div>
      <div class="${last ? 'pb-1' : 'pb-6'} min-w-0 pt-1">
        <p class="text-sm text-foreground"><span class="font-semibold">${who}</span> <span class="text-muted-foreground">${v}</span></p>
        <p class="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">${addr ? `<span class="font-mono">${addr}</span>` : ''}<time>${when}</time></p>
        ${words ? `<blockquote class="mt-2 max-w-prose rounded-md bg-muted/60 px-3 py-2 text-sm leading-relaxed text-foreground">“${words}”</blockquote>` : ''}
        ${hash ? `<p class="mt-2 break-all font-mono text-xs text-muted-foreground">${hash}</p>` : ''}
      </div>`;
  }
}
customElements.define('fbx-event', FbxEvent);
}
