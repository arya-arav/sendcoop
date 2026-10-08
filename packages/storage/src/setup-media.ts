import { setUpMediaBucket } from "./media";

// `pnpm --filter @sendcoop/storage media:setup`: creates the development or
// CI media bucket with public-read objects.
await setUpMediaBucket();
console.log(`[storage] media bucket "${process.env.S3_BUCKET}" ready`);
