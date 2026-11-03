// <fbx-frame tab="me|give|disclose" give="1" address="0x…" node="aq|prod|local" state="ok|offline|none|locked|signedout" menu="open" profile="Personal">…</fbx-frame>
// Identity bar: profile + wallet address, the node switcher (claims live on the node), three tabs.
{ // scoped
const _d=(el,...c)=>{if(!/(^|\s)(hidden|block|flex|inline|inline-block|inline-flex|grid|contents)(\s|$)/.test(el.className))el.classList.add(...c.slice(0,1));el.classList.add(...c.slice(1));};
const TABS = [['me', 'Me', '/fbx-me'], ['give', 'Vouches I give', '/fbx-give'], ['disclose', 'Requests', '/fbx-disclose']];
// id, label, host, signed in, checks, link
const NODES = [
  ['aq', 'dev.aquafire', 'dev.aquafire.inblock.io', true, 'email, phone, domain', '/fbx-me'],
  ['local', 'Local node', 'localhost:3100', true, 'domain only', '/fbx-node-local'],
  ['prod', 'aquafire', 'aquafire.inblock.io', false, 'email, domain', '/fbx-ready-signin'],
];
const STATE = {
  ok: ['circle-check', 'bg-success/12 text-success', 'Reachable'],
  offline: ['cloud-off', 'bg-primary/10 text-primary', 'Not answering'],
  none: ['wallet', 'bg-muted text-muted-foreground', 'No wallet yet'],
  locked: ['lock', 'bg-muted text-muted-foreground', 'Wallet locked'],
  signedout: ['log-in', 'bg-muted text-muted-foreground', 'Not signed in'],
};
class FbxFrame extends HTMLElement {
  connectedCallback() {
    if (this._done) return; this._done = true;
    const go = () => this.render();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true }); else go();
  }
  render() {
    const tab = this.getAttribute('tab') || 'me';
    const addr = this.getAttribute('address') || '';
    const nodeId = this.getAttribute('node') || 'aq';
    const node = NODES.find(n => n[0] === nodeId) || NODES[0];
    const state = this.getAttribute('state') || 'ok';
    const open = this.getAttribute('menu') === 'open';
    const profile = this.getAttribute('profile') || 'Personal';
    const counts = { give: this.getAttribute('give') || '', disclose: this.getAttribute('disclose') || '' };
    const [sIcon, sTone, sText] = STATE[state] || STATE.ok;
    const short = addr ? addr.slice(0, 6) + '…' + addr.slice(-4) : '';
    const kids = [...this.childNodes];
    _d(this, 'block');
    const tabs = TABS.map(([id, label, href]) => {
      const on = id === tab, c = counts[id];
      const n = c && c !== '0' ? `<span class="ml-1.5 rounded-sm bg-primary px-1.5 text-xs font-semibold leading-5 text-primary-foreground tabular-nums">${c}</span>` : '';
      return `<a href="${href}" ${on ? 'aria-current="page"' : ''} class="inline-flex h-11 shrink-0 items-center border-b-2 px-1 text-sm transition-colors ${on ? 'border-primary font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}">${label}${n}</a>`;
    }).join('');
    const who = addr
      ? `<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
           <a href="#profiles" class="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground hover:bg-accent" title="Switch profile in Profiles"><aq-icon name="user" class="size-3.5"></aq-icon>${profile}</a>
           <span class="font-mono text-sm text-foreground md:hidden">${short}</span>
           <span class="hidden truncate font-mono text-sm text-foreground md:inline">${addr}</span>
           <button type="button" aria-label="Copy wallet address" class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><aq-icon name="copy" class="size-3.5"></aq-icon></button>
         </div>`
      : `<span class="text-sm text-muted-foreground">No wallet</span>`;
    const menu = open ? `<div role="menu" aria-label="Your nodes" class="absolute right-0 top-full z-20 mt-2 w-[24rem] max-w-[calc(100vw-2.5rem)] rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg">
        <p class="px-3 pb-2 pt-1.5 text-xs text-muted-foreground">Your claims live on the node. Each node keeps its own.</p>
        ${NODES.map(([id, label, host, signed, checks, href]) => {
          const cur = id === node[0];
          return `<a role="menuitemradio" aria-checked="${cur}" href="${href}" class="flex items-start gap-3 rounded-lg px-3 py-2.5 ${cur ? 'bg-accent' : 'hover:bg-accent'}">
            <span class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg ${cur ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}"><aq-icon name="${cur ? 'check' : 'server'}" class="size-4"></aq-icon></span>
            <span class="min-w-0 flex-1"><span class="block text-sm font-semibold">${label}</span>
              <span class="block truncate font-mono text-xs text-muted-foreground">${host}</span>
              <span class="mt-1 block text-xs text-muted-foreground">${signed ? 'Signed in' : 'Not signed in'} · checks ${checks}</span></span>
          </a>`;
        }).join('')}
        <div class="my-2 h-px bg-border"></div>
        <a role="menuitem" href="/fbx-node-add" class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-accent"><aq-icon name="plus" class="size-4 text-muted-foreground"></aq-icon>Add a node</a>
        <a role="menuitem" href="/fbx-ready-signin" class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-accent"><aq-icon name="log-out" class="size-4 text-muted-foreground"></aq-icon>Sign out of ${node[1]}</a>
      </div>` : '';
    this.innerHTML = `<div class="min-h-screen bg-background text-foreground">
      <div class="border-b border-border bg-sidebar">
        <div class="mx-auto w-full max-w-6xl px-5 md:px-10">
          <div class="flex flex-col gap-5 pb-1 pt-6 md:flex-row md:items-end md:justify-between md:pt-8">
            <div class="min-w-0">
              <h1 class="text-2xl font-semibold tracking-tight">Your identity</h1>
              <div class="mt-2">${who}</div>
            </div>
            <div class="relative w-full md:w-auto">
              <a href="${open ? '/fbx-me' : '/fbx-node-switch'}" aria-haspopup="menu" aria-expanded="${open}" aria-label="Your node: ${node[1]}, ${sText}. Switch node" class="group flex w-full items-center gap-3.5 rounded-xl border bg-card px-4 py-3 shadow-xs transition-colors md:min-w-[19rem] ${open ? 'border-ring' : 'border-border hover:border-ring/50'}">
                <span class="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"><aq-icon name="server" class="size-5"></aq-icon></span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-center justify-between gap-3">
                    <span class="text-xs font-medium text-muted-foreground">Your node</span>
                    <span class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${sTone}"><aq-icon name="${sIcon}" class="size-3.5"></aq-icon>${sText}</span>
                  </span>
                  <span class="mt-0.5 block text-base font-semibold leading-tight text-foreground">${node[1]}</span>
                  <span class="block truncate font-mono text-xs text-muted-foreground">${node[2]}</span>
                </span>
                <span class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground group-hover:bg-accent"><aq-icon name="chevrons-up-down" class="size-4"></aq-icon></span>
              </a>
              ${menu}
            </div>
          </div>
          <nav aria-label="Identity" class="-mb-px mt-3 flex gap-6 overflow-x-auto overflow-y-hidden">${tabs}</nav>
        </div>
      </div>
      <main data-c class="mx-auto w-full max-w-6xl px-5 pb-20 pt-6 md:px-10 md:pt-8"></main>
    </div>`;
    this.querySelector('[data-c]').append(...kids);
  }
}
customElements.define('fbx-frame', FbxFrame);
}
