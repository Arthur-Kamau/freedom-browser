# Aqua identity disclosure

How a site, or a person, asks a Freedom user for identity claims, and what
comes back. Claims are Aqua trees the user created on `freedom://identity`
(see [features](features.md), "Identity Claims"); a disclosure releases only
the claims the user ticks, with their signatures and attestations, and the
SDK's selective-disclosure proofs where fields are held back.

## Request

```json
{
  "aqua": 1,
  "need": ["email", { "type": "name", "fields": ["given_name", "family_name"] }],
  "optional": ["domain"],
  "purpose": "To send your order confirmation",
  "nonce": "a2f9c0…"
}
```

| Field      | Meaning                                                                                                                                                                                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `aqua`     | Format version, `1`.                                                                                                                                                                                                                                                                                                                             |
| `need`     | Claim types the requester needs: `name`, `email`, `phone`, `domain`. An entry is the type, or `{ "type", "fields" }` to ask for some payload fields only; the user may narrow that list further, never widen it. At least one entry; a type appears once across `need` and `optional`.                                                             |
| `optional` | Claim types the requester would like. Same entry shape. Unticked by default.                                                                                                                                                                                                                                                                      |
| `purpose`  | Shown to the user verbatim, as text. At most 400 characters.                                                                                                                                                                                                                                                                                      |
| `nonce`    | Echoed in the response so the requester can tie it to the request. At most 128 characters.                                                                                                                                                                                                                                                        |

Field names are the SDK claim templates' payload fields; `signer_did` (the
subject) is always disclosed. A request over 8 KiB, with an unknown type or
field, or missing `need` is refused before the user sees anything.

### From a page

Connect first (`eth_requestAccounts`), then:

```js
const response = await window.ethereum.request({
  method: 'aqua_requestDisclosure',
  params: [request],
});
```

Only claims whose subject is the connected wallet are offered. The call
waits up to five minutes for the user's decision on the sidebar's "Share
Identity" screen, resolves with the response, and rejects with EIP-1193
code `4001` if the user declines, `4100` if the site is not connected, or
`-32602` if the request is malformed. There is no auto-approval and nothing
is remembered per site.

### From a person

Hand the same JSON to the user. They paste it under "Respond to a request"
on `freedom://identity`, decide on the same screen, and copy the response
back to you.

## Response

```json
{
  "aqua": 1,
  "nonce": "a2f9c0…",
  "subject": "did:pkh:eip155:1:0x12BE…1AF8",
  "issuedAt": "2026-10-22T12:00:00.000Z",
  "claims": [
    {
      "type": "name",
      "fields": ["given_name", "family_name"],
      "claim": { "revisions": { "0x1620…": { "disclosure": "Full", "revision": { … } }, "0x1620…": { "disclosure": "Redacted", "redacted": { … } } }, "file_index": { … } },
      "attestations": [ { "revisions": { … }, "file_index": { … } } ]
    }
  ],
  "missing": ["domain"]
}
```

- `claims[].claim` is the SDK's `SelectiveTree` for that claim: every
  revision `Full`, except the claim's object revision, which is `Redacted`
  to the chosen fields when fields were held back. A redacted revision
  carries the Merkle leaves and salts the SDK needs to prove the disclosed
  fields belong to the signed revision.
- `claims[].attestations` are whole trees the user holds for that claim:
  the identity service's (email, phone, DNS) and any peer attestation the
  user imported.
- `missing` lists required types the user did not release. A required type
  the user has no claim for is listed too.

## Verifying a response

`test-e2e/fixtures/aqua-verifier.html` is a complete example: it connects,
sends the request above, and verifies the response as described here;
`test-e2e/aqua-disclosure.spec.js` drives it end to end.

A response with no field redaction rebuilds into ordinary trees (take each
`Full` entry's `revision`). Verify each claim tree and its attestations with
the Aqua SDK; at SDK v7.0.0 the WASM verifier cannot run
(inblockio/aqua-rs-sdk#214) and the selective verifier is not exported
(#216), so the example verifier calls the identity service's stateless
endpoint instead: `POST /api/widget/verify` with `{ "kind": "tree", "main":
tree, "linked_trees": [...] }`, or `{ "kind": "selective", "main":
selectiveTree }` for a redacted claim, which checks hashes, Merkle proofs
and chain linkage. Then check for yourself that the claim's `signer_did` is
the `subject` you expected, that each attestation's `context` or structural
link names the claim, and whether the attesters are ones you trust. A
response proves what the trees prove; trusting an attester is the
verifier's decision.

## Example

`test-e2e/fixtures/aqua-verifier.html` is a complete requester and verifier
in one page: it connects, sends the request above, rebuilds whole trees,
posts each tree (or selective tree) to the verify endpoint, checks the nonce
and the subject, and lists what verified. `test-e2e/aqua-disclosure.spec.js`
drives it end to end through the Share Identity screen with a pre-seeded
vault and claims store, with the verify endpoint stubbed in the page.
