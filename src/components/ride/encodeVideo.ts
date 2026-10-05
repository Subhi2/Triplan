// Encodes the ride preview frame by frame (WebCodecs through Mediabunny, loaded only when a video
// is saved). Each frame gets its own timestamp, so the video is exactly VIDEO_SECONDS long and
// smooth however long the map takes to draw each frame on this device.

export interface VideoWriter {
  extension: "mp4" | "webm";
  /** Encodes the canvas as frame `index` (at index / fps seconds). */
  addFrame(index: number): Promise<void>;
  finish(): Promise<Blob>;
  cancel(): Promise<void>;
}

/** Whether this browser has the video encoder the recording needs. */
export function canEncodeVideoHere(): boolean {
  return typeof window !== "undefined" && typeof window.VideoEncoder === "function";
}

/**
 * A writer for `canvas`: H.264 in MP4 where the browser can (plays everywhere: Instagram,
 * WhatsApp, iPhones), else VP9 in WebM. Null when it can encode neither.
 */
export async function createVideoWriter(
  canvas: HTMLCanvasElement,
  fps: number,
  bitrate: number,
): Promise<VideoWriter | null> {
  const mb = await import("mediabunny");
  const size = { width: canvas.width, height: canvas.height, bitrate };
  const avc = await mb.canEncodeVideo("avc", size);
  if (!avc && !(await mb.canEncodeVideo("vp9", size))) return null;
  const target = new mb.BufferTarget();
  const output = new mb.Output({
    format: avc ? new mb.Mp4OutputFormat({ fastStart: "in-memory" }) : new mb.WebMOutputFormat(),
    target,
  });
  const source = new mb.CanvasSource(canvas, {
    codec: avc ? "avc" : "vp9",
    bitrate,
    keyFrameInterval: 2,
  });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();
  return {
    extension: avc ? "mp4" : "webm",
    addFrame: (index) => source.add(index / fps, 1 / fps),
    async finish() {
      await output.finalize();
      return new Blob([target.buffer!], { type: avc ? "video/mp4" : "video/webm" });
    },
    cancel: () => output.cancel(),
  };
}
