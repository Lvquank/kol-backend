import { Readable } from "node:stream";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { config } from "../config.js";

export type UploadedImage = {
  bytes: number;
  format: string;
  height: number;
  publicId: string;
  secureUrl: string;
  width: number;
};

export const avatarMimeTypes = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);

export function isCloudinaryConfigured(): boolean {
  return Boolean(config.cloudinary.url);
}

function cloudinaryCredentials(): URL {
  const credentials = new URL(config.cloudinary.url);
  if (credentials.protocol !== "cloudinary:" || !credentials.hostname || !credentials.username || !credentials.password) {
    throw new Error("CLOUDINARY_URL must use cloudinary://api_key:api_secret@cloud_name");
  }
  return credentials;
}

function configureCloudinary(): void {
  const credentials = cloudinaryCredentials();
  cloudinary.config({
    api_key: decodeURIComponent(credentials.username),
    api_secret: decodeURIComponent(credentials.password),
    cloud_name: credentials.hostname,
    secure: true
  });
}

export function isManagedCloudinaryUrl(value: unknown): boolean {
  if (typeof value !== "string" || !isCloudinaryConfigured()) return false;
  try {
    const credentials = cloudinaryCredentials();
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com") return false;

    const pathname = decodeURIComponent(url.pathname);
    const uploadPrefix = `/${credentials.hostname}/image/upload/`;
    if (!pathname.startsWith(uploadPrefix)) return false;

    const folder = config.cloudinary.folder.replace(/^\/+|\/+$/g, "");
    const assetPath = `/${pathname.slice(uploadPrefix.length)}`;
    return !folder || assetPath.includes(`/${folder}/`);
  } catch {
    return false;
  }
}

export async function uploadAvatar(buffer: Buffer, publicId: string): Promise<UploadedImage> {
  if (!isCloudinaryConfigured()) {
    throw new Error("Cloudinary is not configured");
  }
  configureCloudinary();

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream({
      folder: config.cloudinary.folder,
      overwrite: false,
      public_id: publicId,
      resource_type: "image",
      type: "upload"
    }, (error, uploaded) => {
      if (error) reject(error);
      else if (!uploaded) reject(new Error("Cloudinary returned an empty upload result"));
      else resolve(uploaded);
    });

    Readable.from(buffer).pipe(upload);
  });

  return {
    bytes: result.bytes,
    format: result.format,
    height: result.height,
    publicId: result.public_id,
    secureUrl: result.secure_url,
    width: result.width
  };
}

export const uploadRegistrationAvatar = uploadAvatar;
