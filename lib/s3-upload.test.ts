import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn();
vi.mock("@aws-sdk/client-s3", () => {
  const PutObjectCommandClass = vi.fn(function (input: any) {
    this.input = input;
  });
  return {
    S3Client: class {
      send = sendMock;
    },
    PutObjectCommand: PutObjectCommandClass,
  };
});

beforeEach(() => {
  process.env.S3_UPLOAD_KEY = "k";
  process.env.S3_UPLOAD_SECRET = "s";
  process.env.S3_UPLOAD_BUCKET = "my-bucket";
  process.env.S3_UPLOAD_REGION = "us-east-1";
  sendMock.mockReset();
  sendMock.mockResolvedValue({});
});

describe("uploadBufferToS3", () => {
  it("puts the buffer and returns the public comics URL", async () => {
    const { uploadBufferToS3 } = await import("@/lib/s3-upload");
    const url = await uploadBufferToS3(Buffer.from("png"), "abc/page-1.png", "image/png");
    expect(sendMock).toHaveBeenCalledOnce();
    expect(url).toBe("https://my-bucket.s3.us-east-1.amazonaws.com/comics/abc/page-1.png");
  });

  it("defaults content type to image/png", async () => {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { uploadBufferToS3 } = await import("@/lib/s3-upload");
    await uploadBufferToS3(Buffer.from("x"), "k.png");
    const call = (PutObjectCommand as any).mock.calls.at(-1)[0];
    expect(call.ContentType).toBe("image/png");
    expect(call.Key).toBe("comics/k.png");
  });
});
