// <fbx-give-list selected="bob|kenn|none"></fbx-give-list>
{ // scoped
const _d=(el,...c)=>{if(!/(^|\s)(hidden|block|flex|inline|inline-block|inline-flex|grid|contents)(\s|$)/.test(el.className))el.classList.add(...c.slice(0,1));el.classList.add(...c.slice(1));};
const ITEMS = [
  ['bob', 'Bob Otieno', 'Name: Bob Otieno', '2 Nov', 'wait', '/fbx-give'],
  ['kenn', 'Kenn Wafula', 'Email: kenn@wafula.dev', '25 Oct', 'done', '/fbx-give-sent'],
];
class FbxGiveList extends HTMLElement {
  connectedCallback() { this.render(); }
  render() {
    const sel = this.getAttribute('selected') || 'bob';
    _d(this, 'block');
    const rows = ITEMS.map(([id, who, what, when, st, href]) => {
      const on = id === sel;
      const chip = st === 'wait'
        ? '<span class="inline-flex h-6 items-center rounded-md bg-primary/10 px-2 text-xs font-medium text-primary">Waiting for you</span>'
        : '<span class="inline-flex h-6 items-center gap-1 rounded-md bg-success/12 px-2 text-xs font-medium text-success"><aq-icon name="check" class="size-3.5"></aq-icon>You vouched</span>';
      return `<a href="${href}" ${on ? 'aria-current="true"' : ''} class="block px-4 py-3.5 ${on ? 'bg-accent' : 'hover:bg-accent/60'}">
        <div class="flex items-baseline justify-between gap-3"><p class="truncate text-sm font-semibold text-foreground">${who}</p><time class="shrink-0 text-xs text-muted-foreground">${when}</time></div>
        <p class="mt-0.5 truncate text-sm text-muted-foreground">${what}</p>
        <div class="mt-2">${chip}</div>
      </a>`;
    }).join('');
    this.innerHTML = `<div class="mb-3"><h2 class="text-sm font-semibold text-foreground">Asked of you</h2><p class="text-xs text-muted-foreground">1 waiting · newest first</p></div>
      <div class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">${rows}</div>
      <p class="mt-4 text-xs leading-relaxed text-muted-foreground">People ask through the node. They see your words and your wallet address whenever they share the claim.</p>`;
  }
}
customElements.define('fbx-give-list', FbxGiveList);
}
