// <fbx-ready step="wallet|unlock|service|signin"></fbx-ready>
// Steps before step are done; step is current (explained, with its action); later steps wait.
{ // scoped
const _d=(el,...c)=>{if(!/(^|\s)(hidden|block|flex|inline|inline-block|inline-flex|grid|contents)(\s|$)/.test(el.className))el.classList.add(...c.slice(0,1));el.classList.add(...c.slice(1));};
const STEPS = [
  ['wallet', 'A wallet in this browser', 'Everything on this page is signed by your wallet. Create one, or bring an existing one, in the wallet sidebar.', 'Open the wallet sidebar', 'wallet', '/fbx-ready-locked'],
  ['unlock', 'Wallet unlocked', 'Your claims are stored encrypted with your wallet. Unlock it to read and sign them.', 'Unlock the wallet', 'key', '/fbx-ready-signin'],
  ['service', 'A node that answers', 'The node is not answering, so you cannot sign in to it yet. Nothing is lost; try again in a minute.', 'Try again', 'refresh', '/fbx-ready-signin'],
  ['signin', 'Signed in to the node', 'The node keeps your claims, checks emails, phones and domains, and carries vouches between people. Sign one message to show it this wallet is yours. Nothing goes on chain and nothing is charged.', 'Sign in with your wallet', 'pen', '/fbx-start'],
];
class FbxReady extends HTMLElement {
  connectedCallback() { this.render(); }
  render() {
    const step = this.getAttribute('step') || 'wallet';
    const at = STEPS.findIndex(s => s[0] === step);
    _d(this, 'block');
    const rows = STEPS.map(([id, title, text, action, icon, href], i) => {
      const done = i < at, cur = i === at;
      const mark = done
        ? `<span class="inline-flex size-7 items-center justify-center rounded-full bg-success/15 text-success"><aq-icon name="check" class="size-4"></aq-icon></span>`
        : `<span class="inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${cur ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground'}">${i + 1}</span>`;
      return `<li class="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-4 py-4" ${cur ? 'aria-current="step"' : ''}>
        ${mark}
        <div class="min-w-0 pt-1">
          <p class="text-sm ${cur ? 'font-semibold text-foreground' : done ? 'text-foreground' : 'text-muted-foreground'}">${title}${done ? '<span class="ml-2 text-xs font-normal text-success">Done</span>' : ''}</p>
          ${cur ? `<p class="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">${text}</p><div class="mt-3"><fbx-btn variant="primary" label="${action}" icon="${icon}" href="${href}"></fbx-btn></div>` : ''}
        </div>
      </li>`;
    }).join('');
    this.innerHTML = `<ol class="divide-y divide-border">${rows}</ol>`;
  }
}
customElements.define('fbx-ready', FbxReady);
}
