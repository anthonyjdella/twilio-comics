import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

if (!process.env.S3_UPLOAD_KEY || !process.env.S3_UPLOAD_SECRET || !process.env.S3_UPLOAD_BUCKET || !process.env.S3_UPLOAD_REGION) {
  throw new Error("Missing required S3 environment variables");
}

const s3Client = new S3Client({
  region: process.env.S3_UPLOAD_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_UPLOAD_KEY!,
    secretAccessKey: process.env.S3_UPLOAD_SECRET!,
  },
});

export async function uploadImageToS3(
  imageUrl: string,
  key: string
): Promise<string> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());

    const command = new PutObjectCommand({
      Bucket: process.env.S3_UPLOAD_BUCKET!,
      Key: `comics/${key}`,
      Body: imageBuffer,
      ContentType: "image/jpeg",
      Metadata: {
        "app-name": "make-comics",
        "type": "comic-page",
      },
    });

    await s3Client.send(command);

    const publicUrl = `https://${process.env.S3_UPLOAD_BUCKET}.s3.${process.env.S3_UPLOAD_REGION}.amazonaws.com/comics/${key}`;
    return publicUrl;
  } catch (error) {
    console.error("Error uploading to S3:", error);
    throw new Error("Failed to upload image to S3");
  }
}

export async function uploadBufferToS3(
  buffer: Buffer,
  key: string,
  contentType: string = "image/png",
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_UPLOAD_BUCKET!,
    Key: `comics/${key}`,
    Body: buffer,
    ContentType: contentType,
    Metadata: { "app-name": "make-comics", type: "comic-page" },
  });
  await s3Client.send(command);
  return `https://${process.env.S3_UPLOAD_BUCKET}.s3.${process.env.S3_UPLOAD_REGION}.amazonaws.com/comics/${key}`;
}
