import { AsnConvert } from "@peculiar/asn1-schema";
import * as asn1X509 from "@peculiar/asn1-x509";
import { Convert } from "@proxyco/pvtsutils";
import { container } from "tsyringe";
import { cryptoProvider } from "./provider";
import { AlgorithmProvider, diAlgorithmProvider } from "./algorithm";
import { Extension } from "./extension";
import { JsonName, Name } from "./name";
import { HashedAlgorithm } from "./types";
import { X509Certificate } from "./x509_cert";
import { diAsnSignatureFormatter, IAsnSignatureFormatter } from "./asn_signature_formatter";

export type X509CertificateCreateParamsName = string | JsonName;

/**
 * Base arguments for certificate creation
 */
export interface X509CertificateCreateParamsBase {
  /**
   * Hexadecimal serial number
   */
  serialNumber: string;
  /**
   * Date before which certificate can't be used
   */
  notBefore: Date;
  /**
   * Date after which certificate can't be used
   */
  notAfter: Date;
  /**
   * List of extensions
   */
  extensions?: Extension[];
  /**
   * Signing algorithm
   */
  signingAlgorithm: Algorithm | EcdsaParams;
}

/**
 * Parameters for X509 Certificate generation
 */
export interface X509CertificateCreateParams extends X509CertificateCreateParamsBase {
  subject?: X509CertificateCreateParamsName;
  issuer?: X509CertificateCreateParamsName;
  publicKey: CryptoKey;
  signingKey: CryptoKey;
}

/**
 * Parameters for self-signed X509 Certificate generation
 */
export interface X509CertificateCreateSelfSignedParams extends X509CertificateCreateParamsBase {
  name?: X509CertificateCreateParamsName;
  keys: CryptoKeyPair;
}

/**
 * Generator of X509 certificates
 */
export class X509CertificateGenerator {

  /**
   * Creates a self-signed certificate
   * @param params Parameters
   * @param crypto Crypto provider. Default is from CryptoProvider
   */
  public static async createSelfSigned(params: X509CertificateCreateSelfSignedParams, crypto = cryptoProvider.get()) {
    return this.create({
      serialNumber: params.serialNumber,
      subject: params.name,
      issuer: params.name,
      notBefore: params.notBefore,
      notAfter: params.notAfter,
      publicKey: params.keys.publicKey,
      signingKey: params.keys.privateKey,
      signingAlgorithm: params.signingAlgorithm,
      extensions: params.extensions,
    }, crypto);
  }

  /**
   * Creates a certificate signed by private key
   * @param params Parameters
   * @param crypto Crypto provider. Default is from CryptoProvider
   */
  public static async create(params: X509CertificateCreateParams, crypto = cryptoProvider.get()) {
    const spki = await crypto.subtle.exportKey("spki", params.publicKey);
    const asnX509 = new asn1X509.Certificate({
      tbsCertificate: new asn1X509.TBSCertificate({
        version: asn1X509.Version.v3,
        serialNumber: Convert.FromHex(params.serialNumber),
        validity: new asn1X509.Validity({
          notBefore: params.notBefore,
          notAfter: params.notAfter,
        }),
        extensions: new asn1X509.Extensions(params.extensions?.map(o => AsnConvert.parse(o.rawData, asn1X509.Extension)) || []),
        subjectPublicKeyInfo: AsnConvert.parse(spki, asn1X509.SubjectPublicKeyInfo),
      }),
    });
    if (params.subject) {
      asnX509.tbsCertificate.subject = AsnConvert.parse(new Name(params.subject).toArrayBuffer(), asn1X509.Name);
    }
    if (params.issuer) {
      asnX509.tbsCertificate.issuer = AsnConvert.parse(new Name(params.issuer).toArrayBuffer(), asn1X509.Name);
    }

    // Set signing algorithm
    const signingAlgorithm = { ...params.signingAlgorithm, ...params.signingKey.algorithm } as HashedAlgorithm;
    const algProv = container.resolve<AlgorithmProvider>(diAlgorithmProvider);
    asnX509.tbsCertificate.signature = asnX509.signatureAlgorithm = algProv.toAsnAlgorithm(signingAlgorithm);

    // Sign
    const tbs = AsnConvert.serialize(asnX509.tbsCertificate);
    const signature = await crypto.subtle.sign(signingAlgorithm, params.signingKey, tbs);

    // Convert WebCrypto signature to ASN.1 format
    const signatureFormatters = container.resolveAll<IAsnSignatureFormatter>(diAsnSignatureFormatter).reverse();
    let asnSignature: ArrayBuffer | null = null;
    for (const signatureFormatter of signatureFormatters) {
      asnSignature = signatureFormatter.toAsnSignature(signingAlgorithm, signature);
      if (asnSignature) {
        break;
      }
    }
    if (!asnSignature) {
      throw Error("Cannot convert ASN.1 signature value to WebCrypto format");
    }

    asnX509.signatureValue = asnSignature;

    return new X509Certificate(AsnConvert.serialize(asnX509));
  }

}
