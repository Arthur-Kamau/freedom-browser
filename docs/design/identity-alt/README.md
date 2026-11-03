# identity-alt: design reference export

Read-only export of the `fbx-*` identity design from the TaskFlow design surface (project 4), taken 2026-11-03. Pages are HTML body fragments (the shell is server-composed in TaskFlow); components are the custom-element sources they compose. `tokens.css` is the rendered shadcn-style globals (`:root`, `.dark`, `@theme inline`, four themes: light, dark, blue, blue-dark); `tokens.json` is what the project defines per token.

Fixture persona throughout: Alice Mwangi, wallet `0x254b0d7b…8a1f`, default node `dev.aquafire` (dev.aquafire.inblock.io), with a `Local node` (localhost:3100) and `aquafire` (prod, not signed in) as alternates. Vouchers: Kenn Wafula, Bob Otieno.

## Top level

- `tokens.css` — rendered design tokens (`tokens_css` from `design_get_tokens`).
- `tokens.json` — project-defined tokens (`tokens_json`, object serialised with 2-space indent).
- `README.md` — this file.

## pages/

Every page is wrapped in `<fbx-frame>`; `tab` is the active identity tab (`me` | `give` | `disclose`), `state` is the node/wallet status chip (`ok` when omitted).

### Readiness (tab=me, no claims yet)

- `fbx-ready.html` — `/fbx-ready` — state=none (no wallet). "Four things before your identity is ready"; `<fbx-ready step="wallet">`.
- `fbx-ready-locked.html` — `/fbx-ready-locked` — state=locked. "Unlock to see your identity"; `<fbx-ready step="unlock">`.
- `fbx-ready-service.html` — `/fbx-ready-service` — state=offline. "dev.aquafire is not answering"; `<fbx-ready step="service">`, links to switch/add node.
- `fbx-ready-signin.html` — `/fbx-ready-signin` — state=signedout. "One signature, and you are ready"; `<fbx-ready step="signin">`.
- `fbx-start.html` — `/fbx-start` — state=ok, signed in with an empty identity. "Start with the name people know you by"; first-claim form with a site preview.

### Me: claim list and claim panels (tab=me)

- `fbx-me-new.html` — `/fbx-me-new` — state=ok, `set="one"` (single claim). "Signed and added just now"; name claim with 0 vouches, one `signed` evidence event.
- `fbx-me.html` — `/fbx-me` — state=ok, full set, name selected. Name claim "Alice Mwangi", 2 vouches (Kenn, Bob); evidence list with anchors v1/v2.
- `fbx-me-list.html` — `/fbx-me-list` — state=ok, `selected="none" mobile="list"`. Phone-width list only; empty panel says "Pick a claim to see its evidence".
- `fbx-me-email.html` — `/fbx-me-email` — state=ok, email selected, service=yes. "alice@inblock.io" checked by dev.aquafire, 0 vouches.
- `fbx-me-domain.html` — `/fbx-me-domain` — state=ok, domain selected, service=pending. "inblock.io"; "The record is not visible yet", TXT record to copy, "Check now".
- `fbx-me-broken.html` — `/fbx-me-broken` — state=ok, `set="broken"`, email selected with `broken=`. "Does not verify"; "What failed" list, re-check or remove.
- `fbx-offline.html` — `/fbx-offline` — state=offline. Read-only banner "dev.aquafire is not answering, so this is read-only"; name panel with vouch/import buttons disabled.

### Nodes (tab=me)

- `fbx-node-switch.html` — `/fbx-node-switch` — state=ok, `menu="open"`. Node switcher menu open over the name panel.
- `fbx-node-local.html` — `/fbx-node-local` — state=ok, `node="local"`, `set="local"`. Banner "You switched to Local node"; name claim with 0 vouches here, "Copy from dev.aquafire".
- `fbx-node-copy.html` — `/fbx-node-copy` — state=ok, node=local. "Copy claims from dev.aquafire to Local node"; checklist of what travels and what must be re-checked.
- `fbx-node-add.html` — `/fbx-node-add` — state=ok. "Add a node"; address field, probe result for node.wafula.dev, "Sign in and add".

### Adding claims (tab=me, `<fbx-composer>`)

- `fbx-add.html` — `/fbx-add` — state=ok, kind=name. "Claim a name"; name field with site preview.
- `fbx-add-email.html` — `/fbx-add-email` — state=ok, kind=email. "Claim an email address"; steps 1-2 done, step 3 "Sign the claim with your wallet" current.
- `fbx-add-phone.html` — `/fbx-add-phone` — state=ok, kind=phone. "Claim a phone number"; step 2 "Enter the code" in error state ("That code does not match. 2 tries left.").
- `fbx-add-domain.html` — `/fbx-add-domain` — state=ok, kind=domain. "Claim a domain"; domain field, "Sign and show the DNS record".
- `fbx-add-local.html` — `/fbx-add-local` — state=ok, node=local, kind=domain, `disabled="email,phone"`. "Claim a domain" on Local node; email/phone kinds greyed out.

### Vouches on your claims (tab=me)

- `fbx-ask.html` — `/fbx-ask` — state=ok, name selected. "Ask someone to vouch for your name"; wallet address + note fields, "What they will see".
- `fbx-import.html` — `/fbx-import` — state=ok, name selected. "Import a vouch"; pasted JSON, checks passed, "Add to evidence".
- `fbx-import-drop.html` — `/fbx-import-drop` — state=ok, name selected. "Import a vouch" with the drop zone active ("Drop to check this vouch", kisumu-vouch.json).
- `fbx-evidence.html` — `/fbx-evidence` — state=ok. "Every piece of evidence, newest first" for the name claim, full hashes, technical details accordion, remove section.
- `fbx-remove.html` — `/fbx-remove` — state=ok. Alert dialog "Remove "Alice Mwangi" from your identity on dev.aquafire?"; what goes / what stays.

### Vouches I give (tab=give)

- `fbx-give-empty.html` — `/fbx-give-empty` — state=ok. "Nobody has asked you to vouch yet"; wallet address to share.
- `fbx-give-list.html` — `/fbx-give-list` — state=ok, `<fbx-give-list selected="none">`. Phone-width list of requests only.
- `fbx-give.html` — `/fbx-give` — state=ok, Bob selected (waiting). "Is "Bob Otieno" really Bob's name?"; how-do-you-know textarea, "Sign and vouch".
- `fbx-give-sent.html` — `/fbx-give-sent` — state=ok, Kenn selected (done). "kenn@wafula.dev"; "You vouched on 26 Oct", "What you signed" event.

### Requests / disclosure (tab=disclose)

- `fbx-disclose.html` — `/fbx-disclose` — state=ok. "Answer a request someone sent you"; paste-a-request textarea, "Read the request".
- `fbx-disclose-answer.html` — `/fbx-disclose-answer` — state=ok. "Conference check-in" wants name, email, phone; tick list of claims to include, exact response preview, "Sign the response".
- `fbx-disclose-signed.html` — `/fbx-disclose-signed` — state=ok. "Signed at 10:14" / "Send this back to whoever asked"; read-only signed response, copy/save.

## components/

Usage comment from the top of each file.

- `fbx-btn.js` — `<fbx-btn label="Ask someone to vouch" icon="users" variant="primary|outline|ghost|danger" size="sm|md" href="/route" disabled full></fbx-btn>` (also accepts `variant="danger-outline"`).
- `fbx-claim-head.js` — `<fbx-claim-head kind="name" value="Alice Mwangi" signed="28 Oct 2026" service="na" node="dev.aquafire" people="2" who="Kenn Wafula,Bob Otieno" broken="…" back="/fbx-me-list"></fbx-claim-head>`
- `fbx-claim-list.js` — `<fbx-claim-list selected="name|email|domain|none" set="full|one|local|broken"></fbx-claim-list>` — Claims live on the node you are signed in to, so each set belongs to one node.
- `fbx-claim-row.js` — `<fbx-claim-row kind="name|email|phone|domain" value="Alice Mwangi" signed="28 Oct" service="yes|pending|no|na|failed|expired|elsewhere" node="dev.aquafire" people="2" who="Kenn Wafula,Bob Otieno" broken="…" href="/fbx-me" selected></fbx-claim-row>`
- `fbx-composer.js` — `<fbx-composer kind="name|email|phone|domain" node="dev.aquafire" disabled="email,phone" back="/fbx-me">…form…</fbx-composer>`
- `fbx-copy.js` — `<fbx-copy label="Name" value="_aqua.inblock.io"></fbx-copy>`
- `fbx-event.js` — `<fbx-event tone="person|service|signed|pending|import|you|failed" who="Bob Otieno" address="0x9a3f…b3a2" when="1 Nov 2026, 10:12" words="…" hash="0x…" verb="…" id-anchor="v1" last></fbx-event>`
- `fbx-field.js` — `<fbx-field label="Email address" value="" placeholder="" help="" error="" type="email" mono textarea rows="4" readonly optional inputmode="numeric" id="f1"></fbx-field>`
- `fbx-frame.js` — `<fbx-frame tab="me|give|disclose" give="1" address="0x…" node="aq|prod|local" state="ok|offline|none|locked|signedout" menu="open" profile="Personal">…</fbx-frame>` — Identity bar: profile + wallet address, the node switcher (claims live on the node), three tabs.
- `fbx-give-list.js` — `<fbx-give-list selected="bob|kenn|none"></fbx-give-list>`
- `fbx-kinds.js` — `<fbx-kinds selected="name|email|phone|domain" disabled="email,phone" node="Local node"></fbx-kinds>`
- `fbx-me-split.js` — `<fbx-me-split selected="name" set="full|one" mobile="pane|list">…panel content…</fbx-me-split>` — Desktop: claim table (fbx-claim-list) left, the selected claim's panel right. Phone: mobile="pane" shows the panel only (its head carries "All claims"); "list" shows the table only.
- `fbx-proof.js` — `<fbx-proof service="yes|pending|no|na|failed|expired|elsewhere" node="dev.aquafire" people="2" who="Kenn Wafula,Bob Otieno" broken="reason text" size="sm|lg"></fbx-proof>` — Two marks. The icon names the source (shield = the node's check, people = vouches). Good uses the source's colour (service / success); pending, expired = amber; failed = red. na (no node can check this kind, e.g. a name) = a quiet muted shield, never a warning. "not yet" / "not checked here" = an empty dashed mark. broken = one red mark replaces both.
- `fbx-ready.js` — `<fbx-ready step="wallet|unlock|service|signin"></fbx-ready>` — Steps before step are done; step is current (explained, with its action); later steps wait.
- `fbx-step.js` — `<fbx-step num="1" title="Send the code" state="done|current|waiting|error" note="Sent at 10:02">…controls (shown when current or error)…</fbx-step>`

Pages also use the project-wide `<aq-icon name="…">` and the built-in `<ui-accordion title="…">` primitive, which are not part of this export.
