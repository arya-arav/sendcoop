import {
  CreateBucketCommand,
  DeleteObjectCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// Public media (images in emails) on S3-compatible storage: AWS S3 or
// Cloudflare R2 in production, RustFS in development and CI. Email clients
// fetch these images directly, so objects are publicly readable by URL; the
// bucket can't be listed. Keys are content hashes, so objects never change
// and can be cached forever.

type MediaConfig = {
  bucket: string;
  publicUrl: string;
  client: S3Client;
};

let cached: MediaConfig | null = null;

function config(): MediaConfig {
  if (cached) return cached;
  const bucket = process.env.S3_BUCKET;
  const publicUrl = process.env.S3_PUBLIC_URL;
  if (!bucket || !publicUrl) {
    throw new Error("Media storage isn't configured: set S3_BUCKET and S3_PUBLIC_URL.");
  }
  cached = {
    bucket,
    publicUrl: publicUrl.replace(/\/$/, ""),
    client: new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      // Unset for AWS itself; set for R2, RustFS and other S3-compatible services.
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    }),
  };
  return cached;
}

export function mediaConfigured() {
  return Boolean(process.env.S3_BUCKET && process.env.S3_PUBLIC_URL);
}

/** The public URL of a media key. */
export function mediaUrl(key: string) {
  return `${config().publicUrl}/${key}`;
}

/** Stores an object for good (keys are content hashes) and returns its public URL. */
export async function putMedia(key: string, body: Buffer, contentType: string) {
  const { client, bucket } = config();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return mediaUrl(key);
}

export async function deleteMedia(key: string) {
  const { client, bucket } = config();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * Development and CI: creates the bucket and makes its objects publicly
 * readable (not listable). In production the bucket is set up once, by hand
 * or infrastructure code.
 */
export async function setUpMediaBucket() {
  const { client, bucket } = config();
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") throw error;
  }
  await client.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: "*",
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${bucket}/*`],
          },
        ],
      }),
    }),
  );
}
