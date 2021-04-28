import { BufferSourceConverter, Convert } from "@proxyco/pvtsutils";
import { AsnData } from "./asn_data";
import { PemConverter } from "./pem_converter";

export type AsnExportType = "hex" | "base64" | "base64url" | "pem";

export type AsnEncodedType = BufferSource | string;

export abstract class PemData<T> extends AsnData<T> {

  public static isAsnEncoded(data: any): data is AsnEncodedType {
    return BufferSourceConverter.isBufferSource(data) || typeof data === "string";
  }

  /**
   * Converts encoded raw to ArrayBuffer. Supported formats are HEX, DER, Base64, Base64Url, PEM
   * @param raw Encoded data
   */
  public static toArrayBuffer(raw: BufferSource | string) {
    if (typeof raw === "string") {
      if (PemConverter.isPem(raw)) {
        return PemConverter.decode(raw)[0];
      } else if (Convert.isHex(raw)) {
        return Convert.FromHex(raw);
      } else if (Convert.isBase64(raw)) {
        return Convert.FromBase64(raw);
      } else if (Convert.isBase64Url(raw)) {
        return Convert.FromBase64Url(raw);
      } else {
        throw new TypeError("Unsupported format of 'raw' argument. Must be one of DER, PEM, HEX, Base64, or Base4Url");
      }
    } else {
      return raw;
    }
  }

  /**
   * PEM tag
   */
  protected abstract readonly tag: string;

  /**
   * Creates a new instance
   * @param raw Encoded buffer (DER, PEM, HEX, Base64, Base64Url)
   * @param type ASN.1 convertible class for `@peculiar/asn1-schema` schema
   */
  public constructor(raw: AsnEncodedType, type: { new(): T; });
  /**
   * Creates a new instance
   * @param asn ASN.1 object
   */
  public constructor(asn: T);
  public constructor(...args: any[]) {
    if (PemData.isAsnEncoded(args[0])) {
      super(PemData.toArrayBuffer(args[0]), args[1]);
    } else {
      super(args[0]);
    }
  }

  /**
   * Returns encoded object in PEM format
   */
  public toString(): string;
  /**
   * Returns encoded object in selected format
   * @param format hex, base64, base64url, pem
   */
  public toString(format: "hex" | "base64" | "base64url" | "pem"): string;
  public toString(format: AsnExportType = "pem") {
    switch (format) {
      case "pem":
        return PemConverter.encode(this.rawData, this.tag);
      case "hex":
        return Convert.ToHex(this.rawData);
      case "base64":
        return Convert.ToBase64(this.rawData);
      case "base64url":
        return Convert.ToBase64Url(this.rawData);
      default:
        throw TypeError("Argument 'format' is unsupported value");
    }
  }

}
