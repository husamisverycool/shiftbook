/**
 * A software authenticator for tests (decision 0032): it makes passkeys (P-256, "none" attestation)
 * and signs assertions the way a platform authenticator does (W3C WebAuthn Level 3 §6.1 authenticator
 * data, §6.5 attestation, §6.3.3 assertion signature over authenticatorData ‖ SHA-256(clientDataJSON)).
 * Keys are generated at runtime and live only in memory; nothing is written anywhere.
 */
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { isoCBOR } from "@simplewebauthn/server/helpers";

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_BE = 0x08;
const FLAG_BS = 0x10;
const FLAG_AT = 0x40;

const b64url = (bytes: Uint8Array | Buffer) => Buffer.from(bytes).toString("base64url");
const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest();

interface Held {
  id: string;
  privateKey: KeyObject;
  rpId: string;
  userHandle: string;
  counter: number;
}

export interface CeremonyOverrides {
  /** The page's origin, as the browser reports it in clientDataJSON. */
  origin: string;
  /** The RP ID the authenticator hashes (default: the options' own). */
  rpId?: string;
  /** Whether the person unlocked the device (the UV flag). Default: the authenticator's setting. */
  userVerified?: boolean;
  /** A challenge other than the options' (default: the options' own). */
  challenge?: string;
  /** The signature counter to report (default: one more than the last). */
  counter?: number;
}

export class SoftAuthenticator {
  readonly credentials = new Map<string, Held>();

  constructor(private readonly settings: { userVerified: boolean; synced: boolean; counts: boolean } = { userVerified: true, synced: true, counts: false }) {}

  private flags(userVerified: boolean, extra = 0) {
    return FLAG_UP | (userVerified ? FLAG_UV : 0) | (this.settings.synced ? FLAG_BE | FLAG_BS : 0) | extra;
  }

  /** navigator.credentials.create(), answered: a new discoverable P-256 credential. */
  create(options: PublicKeyCredentialCreationOptionsJSON, o: CeremonyOverrides): RegistrationResponseJSON {
    const rpId = o.rpId ?? options.rp.id!;
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const jwk = publicKey.export({ format: "jwk" });
    const cose = isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2], // kty: EC2
        [3, -7], // alg: ES256
        [-1, 1], // crv: P-256
        [-2, new Uint8Array(Buffer.from(jwk.x!, "base64url"))],
        [-3, new Uint8Array(Buffer.from(jwk.y!, "base64url"))],
      ]),
    );
    const credentialId = randomBytes(32);
    const id = b64url(credentialId);
    // A new credential starts its counter at 0 (and a synced one keeps reporting 0 unless `counts`).
    const counter = 0;
    const idLength = Buffer.alloc(2);
    idLength.writeUInt16BE(credentialId.length);
    const authData = Buffer.concat([sha256(rpId), Buffer.from([this.flags(o.userVerified ?? this.settings.userVerified, FLAG_AT)]), u32(counter), Buffer.alloc(16), idLength, credentialId, Buffer.from(cose)]);
    const attestationObject = isoCBOR.encode(
      new Map<string, string | Uint8Array | Map<string, string>>([
        ["fmt", "none"],
        ["attStmt", new Map<string, string>()],
        ["authData", new Uint8Array(authData)],
      ]),
    );
    const clientDataJSON = JSON.stringify({ type: "webauthn.create", challenge: o.challenge ?? options.challenge, origin: o.origin, crossOrigin: false });
    this.credentials.set(id, { id, privateKey, rpId, userHandle: options.user.id, counter });
    return {
      id,
      rawId: id,
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: { clientDataJSON: b64url(Buffer.from(clientDataJSON)), attestationObject: b64url(attestationObject), transports: ["internal", "hybrid"] },
    };
  }

  /** navigator.credentials.get(), answered with one of its passkeys (the only one, or the one named). */
  get(options: PublicKeyCredentialRequestOptionsJSON, o: CeremonyOverrides & { credentialId?: string }): AuthenticationResponseJSON {
    const held = o.credentialId ? this.credentials.get(o.credentialId) : [...this.credentials.values()].at(-1);
    if (!held) throw new Error("The software authenticator holds no passkey.");
    const rpId = o.rpId ?? options.rpId ?? held.rpId;
    const counter = o.counter ?? (this.settings.counts ? held.counter + 1 : 0);
    held.counter = Math.max(held.counter, counter);
    const authData = Buffer.concat([sha256(rpId), Buffer.from([this.flags(o.userVerified ?? this.settings.userVerified)]), u32(counter)]);
    const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: o.challenge ?? options.challenge, origin: o.origin, crossOrigin: false }));
    const signature = sign("sha256", Buffer.concat([authData, sha256(clientDataJSON)]), held.privateKey);
    return {
      id: held.id,
      rawId: held.id,
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: { clientDataJSON: b64url(clientDataJSON), authenticatorData: b64url(authData), signature: b64url(signature), userHandle: held.userHandle },
    };
  }
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}
