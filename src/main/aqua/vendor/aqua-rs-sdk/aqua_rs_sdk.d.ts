/* tslint:disable */
/* eslint-disable */

/**
 * WASM wrapper for Aquafier
 */
export class AquafierWasm {
    free(): void;
    [Symbol.dispose](): void;
    addExternalSignature(aqua_tree_json: string, target_revision_hash_str: string, signature_hex: string, public_key_hex: string, method_json: string): string;
    /**
     * Apply a disclosure policy to an AquaTree, returning the SelectiveTree JSON.
     *
     * `aqua_tree_json` — JSON-serialized `AquaTreeWrapper`.
     * `policy_json`    — JSON-serialized `DisclosurePolicy`.
     *
     * Returns compact JSON of the resulting `SelectiveTree`.
     */
    applyDisclosure(aqua_tree_json: string, policy_json: string): string;
    /**
     * Create a genesis revision from JSON.
     * Pass `method_json` as `"null"` or empty to use the default (Tree).
     */
    createGenesisRevision(file_data_json: string, method_json: string): string;
    /**
     * Create a genesis revision from pre-computed content hash and file size.
     * Pass `metadata_json` as a JSON-serialized `FileMetadata`.
     * Pass `method_json` as `"null"` or empty to use the default (Tree).
     */
    createGenesisRevisionFromMetadata(metadata_json: string, method_json: string): string;
    /**
     * Create object.
     * Pass `method_json` as `"null"` or empty to use the default (Tree).
     */
    createObject(template_hash: string, previous_tree_json: string | null | undefined, payload_json: string, method_json: string): string;
    /**
     * Delete last revision
     */
    deleteLastRevision(aqua_tree_json: string): string;
    /**
     * Build the canonical `full` policy JSON (every revision disclosed in its entirety).
     *
     * The `aqua_tree_json` parameter is accepted for API symmetry with
     * `pseudonymousPolicy` but is not inspected — the full policy has an
     * empty revision map (all revisions default to `Full`).
     */
    fullPolicy(aqua_tree_json: string): string;
    /**
     * Link aqua trees.
     * Pass `method_json` as `"null"` or empty to use the default (Scalar).
     */
    linkAquaTree(aqua_tree_json: string, link_trees_json: string, method_json: string): string;
    constructor();
    /**
     * Build the canonical `pseudonymous` policy JSON for a given AquaTree.
     *
     * The browser passes the returned JSON back into `applyDisclosure`.
     */
    pseudonymousPolicy(aqua_tree_json: string): string;
    /**
     * Sign an aqua tree (returns a Promise).
     * Pass `method_json` as `"null"` or empty to use the default (Scalar).
     */
    signAquaTree(aqua_tree_json: string, credentials_json: string, method_json: string): Promise<any>;
    /**
     * Verify and build policy-ready StateNodes.
     * Returns JSON: { "verification": VerificationResult, "state_nodes": [StateNode] }
     */
    verifyAndBuildState(aqua_tree_json: string, file_objects_json: string): string;
    /**
     * Verify an Aqua tree. Returns JSON-serialized VerificationResult.
     *
     * This runs the full L1-L3 verification pipeline synchronously,
     * including WASM template compute. No server roundtrip needed.
     */
    verifyAquaTree(aqua_tree_json: string, file_objects_json: string): string;
    /**
     * Verify an Aqua tree with linked trees.
     */
    verifyAquaTreeWithLinkedTrees(aqua_tree_json: string, linked_trees_json: string, file_objects_json: string): string;
}

/**
 * The aqua-rs-sdk crate version (Rust API semver) this module was built
 * from. Unrelated to `protocolVersion`.
 */
export function crateVersion(): string;

/**
 * Derive `did:key:z6Mk…` directly from a 32-byte Ed25519 private key.
 *
 * Forwards to `DIDSigner::derive_did` so the WASM and native paths share
 * one canonical derivation.
 */
export function deriveDidEd25519(privkey: Uint8Array): string;

/**
 * Encode a 32-byte Ed25519 public key as `did:key:z6Mk…`.
 *
 * Errors: returns a `JsValue` string if `pubkey.len() != 32`.
 */
export function encodeDidKeyEd25519(pubkey: Uint8Array): string;

/**
 * Encode a 33-byte compressed P-256 public key as `did:key:zDn…`.
 *
 * Errors: returns a `JsValue` string if `pubkey.len() != 33`.
 */
export function encodeDidKeyP256(pubkey: Uint8Array): string;

/**
 * The Aqua Protocol version this SDK implements (`MAJOR.MINOR.PATCH`,
 * AIP-0022). Not the package version; see `crateVersion`.
 */
export function protocolVersion(): string;

/**
 * Where the specification of `protocolVersion` is published.
 */
export function specRef(): string;

export function wasm_init(): void;
