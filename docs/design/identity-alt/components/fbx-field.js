// <fbx-field label="Email address" value="" placeholder="" help="" error="" type="email" mono textarea rows="4" readonly optional inputmode="numeric" id="f1"></fbx-field>
{ // scoped
const _d=(el,...c)=>{if(!/(^|\s)(hidden|block|flex|inline|inline-block|inline-flex|grid|contents)(\s|$)/.test(el.className))el.classList.add(...c.slice(0,1));el.classList.add(...c.slice(1));};
let n = 0;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
class FbxField extends HTMLElement {
  connectedCallback() { this.render(); }
  render() {
    const id = this.getAttribute('id-for') || ('fbxf' + (++n));
    const label = this.getAttribute('label') || '';
    const value = this.getAttribute('value') || '';
    const ph = this.getAttribute('placeholder') || '';
    const help = this.getAttribute('help') || '';
    const err = this.getAttribute('error') || '';
    const type = this.getAttribute('type') || 'text';
    const mono = this.hasAttribute('mono') ? 'font-mono text-sm' : 'text-base sm:text-sm';
    const ro = this.hasAttribute('readonly');
    const im = this.getAttribute('inputmode');
    const opt = this.hasAttribute('optional');
    _d(this, 'grid', 'gap-1.5');
    const box = `w-full rounded-md border ${err ? 'border-destructive' : 'border-input'} ${ro ? 'bg-muted' : 'bg-background'} px-3 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${mono}`;
    const aria = `${help || err ? `aria-describedby="${id}-d"` : ''} ${err ? 'aria-invalid="true"' : ''}`;
    const control = this.hasAttribute('textarea')
      ? `<textarea id="${id}" rows="${this.getAttribute('rows') || 4}" ${ro ? 'readonly' : ''} placeholder="${esc(ph)}" ${aria} class="${box} resize-y py-2 leading-relaxed">${esc(value)}</textarea>`
      : `<input id="${id}" type="${type}" value="${esc(value)}" placeholder="${esc(ph)}" ${ro ? 'readonly' : ''} ${im ? `inputmode="${im}"` : ''} ${aria} class="${box} h-10">`;
    this.innerHTML = `${label ? `<label for="${id}" class="text-sm font-medium text-foreground">${label}${opt ? ' <span class="font-normal text-muted-foreground">(optional)</span>' : ''}</label>` : ''}
      ${control}
      ${err ? `<p id="${id}-d" class="inline-flex items-center gap-1.5 text-xs text-destructive"><aq-icon name="alert" class="size-3.5"></aq-icon>${err}</p>` : help ? `<p id="${id}-d" class="text-xs text-muted-foreground">${help}</p>` : ''}`;
  }
}
customElements.define('fbx-field', FbxField);
}
