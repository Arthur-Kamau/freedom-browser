# Aqua identity: demo script

A 20-minute walkthrough for one presenter and one helper. The presenter is
Alice, who owns the claims. The helper is Bob, who attests one. Each step is
written as **Do**, **Say**, **See**. Read the Say lines aloud or in your own
words; the See lines are what must be on screen before you move on.

## Prepare the stage (10 minutes before)

1. Two Freedom profiles, one for Alice and one for Bob. Both running, both
   wallets created and unlocked. Write Bob's wallet address on a sticky note.
2. In both profiles: Settings → Identity → Identity service → Edit, enter
   `https://dev.aquafire.inblock.io`, save. Wait for the green status line.
3. In Alice's profile open `freedom://identity` once, click Sign in with my
   wallet, approve the signature. Do the same in Bob's profile. Then close
   the tabs. Signing in during the demo wastes a minute.
4. Alice: have your email inbox open in another window.
5. If you own a domain, have its DNS editor open. If not, skip Scene 4.
6. Open the disclosure test page, `https://dev.aquafire.inblock.io/disclosure-test`,
   in a tab in Alice's profile and leave it in the background. This page is
   part of the identity service on dev and exists for exactly this test: it
   plays a site that asks the wallet for claims, then prints every value the
   wallet released, the attestations that came with them, and the raw
   response. Anyone can open it, no sign-in.

Do not run this on production. Production still issues attestations that
fail verification.

## Scene 1: Nothing yet (1 minute)

**Do**: in Alice's profile click the Identity button next to the wallet
button in the toolbar.

**Say**: "This is Alice's identity page. No account, no password. The wallet
is the identity. Everything here is a statement Alice signs with it."

**See**: `freedom://identity` with the identity bar showing Alice's wallet
address and the node card (dev.aquafire, Reachable), three tabs (Me, Vouches I
give, Requests), an empty list on the left with the four kinds to add, and on
the right "Start with the name people know you by".

## Scene 2: Alice signs her name (2 minutes)

**Do**: click Add your name (or Add a claim). The composer opens in place of
the list, on Name. Type a given name and a family name; the preview under the
fields shows how it will look to a site. Click Sign and add.

**See**: the sidebar slides out with the Sign Message screen.

**Say**: "The identity service built an Aqua tree for the claim. Now Alice
signs it. The service never holds her key."

**Do**: approve the signature.

**See**: a Name row on the left, selected, with a quiet shield and an empty
people mark. On the right the panel: Not yet verified, Node check "Names are
vouched for, not checked", People who know you "No vouches yet", and under
Evidence only "You signed the claim".

**Do**: open Technical details at the bottom of the panel.

**Say**: "Not yet verified means only Alice says so. Hash, signer DID,
verification log. Nothing else vouches for it yet. That is the whole point of
the next scenes."

## Scene 3: The service verifies Alice's email (3 minutes)

**Do**: click Add your email address under the list. Type Alice's address.
Click Send code (step 1).

**See**: step 1 ticks and says "Sent to …"; step 2 opens.

**Do**: switch to the inbox, read the code, come back, type it in step 2, click
Verify code.

**See**: step 2 ticks and says the node checked it; step 3, Sign the claim,
opens.

**Do**: click Sign and add, approve the signature on the sidebar.

**See**: an Email row with a teal Checked shield. The panel says Node check
"Checked by dev.aquafire", and under Evidence "Identity service checked it"
with its words.

**Say**: "Same claim shape, but this time the service that sent the code
signed an attestation that the inbox answered. Phone works the same way with
an SMS."

## Scene 4: A domain proven through DNS (3 minutes, optional)

**Do**: click Add a domain you own under the list. Type the domain. Click Sign
and show the DNS record, approve.

**See**: a Domain row with an amber Pending shield. The panel says "The record
is not visible yet" and shows the TXT record's Type, Name and Value, each with
Copy, with Check DNS under it.

**Do**: copy both into the DNS editor, save there, come back, click Check DNS.

**See**: the node's answer appears under the record, in the panel. Before
propagation it says the record is not visible yet.

**Say**: "Freedom does not resolve DNS itself. The service does, and tells us
in place. We come back later and press Check again."

If propagation is fast, click Check again now: the shield turns Checked.

## Scene 5: Bob attests Alice's name (5 minutes)

**Do** (Alice): select the Name row and click Ask someone to vouch. The panel
turns into the request: paste Bob's address from the sticky note. Click Send
the request.

**Say**: "Alice hands the claim to Bob through the identity service. Bob is
just a wallet address to her."

**Do**: switch to Bob's profile. Open `freedom://identity`. The Vouches I give
tab shows a count of 1; click it.

**See**: one row, Alice's name, Waiting for you. The panel quotes her claim
and holds the form: "How do you know?".

**Do**: type "I know Alice by this name". Click Sign and vouch. Approve the
signature.

**See**: the row now says Vouched by you; the form is gone and the panel shows
What you signed: Bob's words, the state Signed, the hash and Copy as file, with
the line "You vouched for this on <date>. Their Freedom picks it up from the
node."

**Say**: "Bob signed his own tree that points at Alice's claim. Now watch
Alice's side. She does nothing."

**Do**: switch to Alice's profile. Reload `freedom://identity`.

**See**: the Name row's people mark now shows one grey pip and the badge says
Vouched by 1, not Verified. People who know you reads "Vouched by 1, none you
trust yet", and the line under it "Vouched by <Bob's address>, not trusted by
you. Accept them to count it." Under Evidence: Person vouched, Bob's address,
his words and a "Not trusted by you" chip, above "You signed the claim".

**Say**: "No button on Alice's side. An attestation can only be downloaded
by the wallet that made it, so Bob's Freedom shared it back to Alice on the
service, and hers imported and verified it when the page opened. But anybody
can sign a vouch, so a signature alone says nothing. It counts once Alice
says she trusts the signer."

**Do**: click Who and when. In the dialog, on Bob's vouch, click Accept.

**See**: the chip turns to "Trusted by you", the badge behind the dialog to
Verified, and the pip green. Nothing was signed and nothing was sent: Bob's
address went on Alice's trust list, which is kept in her vault. Reject puts
it back to Vouched by 1, and Accept again undoes that. The e-mail claim from
scene 3 was Verified from the start, because choosing an identity service
puts that service on the list.

If you have time: switch to Bob, click Copy as file, switch to Alice, select
the Name row, click Import a vouch, paste, Add to evidence. Say: "The same thing by
hand, for when the attester is on another service or emails you the file."

## Scene 6: A shop asks Alice for her identity (4 minutes)

**Do**: in Alice's profile switch to the disclosure test tab. Click Connect
wallet, approve the connection on the sidebar.

**See**: Alice's address next to the buttons. Request disclosure is enabled.

**Say**: "This is the disclosure test page on the dev identity service. It
plays a shop: it asks the wallet for claims with one call,
`aqua_requestDisclosure`, and prints whatever comes back so we can see what a
site would receive. Here is the request."

**Do**: replace the request text with:

```json
{
  "aqua": 1,
  "need": ["email", { "type": "name", "fields": ["given_name", "family_name"] }],
  "optional": ["domain"],
  "purpose": "To send your order confirmation",
  "nonce": "demo-1"
}
```

**Say**: "It needs the email and the name, would like the domain, and says
why. The nonce comes back so the shop can match the answer."

**Do**: click Request disclosure.

**See**: the sidebar opens the Share Identity screen. The site name at the
top, the purpose in quotes, then three rows: Name ticked and showing the
values with Verified (Bob is on the trust list), Email ticked and Verified,
Domain unticked. A claim vouched for only by signers Alice has not accepted
would say Vouched by N here too. The site still receives every vouch as
signed: whom to trust is the site's own decision.

**Do**: under Name untick Family name.

**Say**: "Alice decides field by field. The shop asked for the family name;
she keeps it."

**Do**: click Share.

**See**: on the page, Response: Subject is Alice's DID, Nonce is `demo-1`,
Missing lists `domain`, and under the claims the released values: the given
name only, and the email, each with its attestations.

**Say**: "Freedom sent this to nobody. It went back to the page that asked,
over the wallet connection. The family name is a redacted Merkle leaf, so the
shop can still verify Alice's signature over the whole claim without seeing
it."

## Scene 7: The same request from a person (2 minutes)

**Do**: copy the request JSON from Scene 6. Go to `freedom://identity` →
Requests. Paste it under They ask. Click Read the request.

**See**: the same Share Identity screen on the sidebar.

**Do**: click Share.

**See**: the answer JSON appears beside the request, under You answer with,
with a Copy the response button.

**Say**: "No site needed. A person sends the request as text, Alice answers
with text, and they verify it with the SDK."

## Scene 8: Lock the vault (1 minute)

**Do**: lock the wallet on the sidebar. Go back to the shop tab, click
Request disclosure again.

**See**: the sidebar asks for the unlock first, then shows the Share
Identity screen.

**Say**: "Claims are encrypted with a key from the wallet seed. Locked wallet,
no claims, so the request waits for the unlock like a signing request would."

**Do**: click Reject.

**See**: the page reports the request was declined.

## Closing lines

- "Every claim is an Aqua tree Alice signed. Every attestation is another
  tree pointing at it. The service stores, the wallet decides."
- "Nothing is remembered per site. The shop asks again next time, and Alice
  decides again."
- Settings → Identity has Export all and Remove all, if someone asks where
  the data lives.

## If something goes wrong

| Symptom                                                  | Fix                                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Email card says "Not verified: FAILED"                   | The profile is on production. Set the service to dev and make the claim again.         |
| Card says "Made on https://…" and the buttons are greyed | The claim was made on another service. Make a fresh claim on dev.                      |
| Bob's Vouches I give is empty                            | Alice shared to the wrong address, or the profiles use different services. Check both. |
| Alice does not see Bob's attestation                     | Reload the page. The pull runs on open.                                                |
| "Unlock your vault" on the test page                     | Expected when locked. Unlock on the sidebar and send again.                            |
| Page says the service does not answer                    | Click Retry, or check the address under Settings → Identity.                           |
