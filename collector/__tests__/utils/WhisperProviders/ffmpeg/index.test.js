process.env.STORAGE_DIR = "test-storage";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// Mock fix-path as a noop to prevent SIGSEGV (segfault)
// Returns ESM-style default export for dynamic import()
jest.mock("fix-path", () => ({ default: jest.fn() }));

const { FFMPEGWrapper } = require("../../../../utils/WhisperProviders/ffmpeg");

const describeRunner = process.env.GITHUB_ACTIONS ? describe.skip : describe;

describeRunner("FFMPEGWrapper", () => {
  /** @type { import("../../../../utils/WhisperProviders/ffmpeg/index").FFMPEGWrapper } */
  let ffmpeg;
  const testDir = path.resolve(__dirname, "../../../../storage/tmp");
  const inputPath = path.resolve(testDir, "test-input.wav");
  const outputPath = path.resolve(testDir, "test-output.wav");

  beforeEach(() => {
    ffmpeg = new FFMPEGWrapper();
  });

  afterEach(() => {
    if (fs.existsSync(inputPath)) fs.rmSync(inputPath);
    if (fs.existsSync(outputPath)) fs.rmSync(outputPath);
  });

  it("should find ffmpeg executable", async () => {
    const knownPath = await ffmpeg.ffmpegPath();
    expect(knownPath).toBeDefined();
    expect(typeof knownPath).toBe("string");
    expect(knownPath.length).toBeGreaterThan(0);
  });

  it("should validate ffmpeg executable", async () => {
    const knownPath = await ffmpeg.ffmpegPath();
    expect(ffmpeg.isValidFFMPEG(knownPath)).toBe(true);
  });

  it("should return false for invalid ffmpeg path", () => {
    expect(ffmpeg.isValidFFMPEG("/invalid/path/to/ffmpeg")).toBe(false);
  });

  it("should convert audio file to wav format", async () => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    // Generate a synthetic stereo fixture; conversion must not depend on a
    // third-party download being available during development or CI.
    execFileSync(await ffmpeg.ffmpegPath(), [
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=22050",
      "-t", "0.1", "-ac", "2", "-c:a", "pcm_s16le", "-y", inputPath,
    ], { stdio: "pipe" });

    const result = await ffmpeg.convertAudioToWav(inputPath, outputPath);

    expect(result).toBe(true);
    expect(fs.existsSync(outputPath)).toBe(true);

    const stats = fs.statSync(outputPath);
    expect(stats.size).toBeGreaterThan(0);
  }, 30000);

  it("should throw error when conversion fails", () => {
    const nonExistentFile = path.resolve(testDir, "non-existent-file.wav");
    const outputPath = path.resolve(testDir, "test-output-fail.wav");

    expect(async () => {
      return await ffmpeg.convertAudioToWav(nonExistentFile, outputPath);
    }).rejects.toThrow(`Input file ${nonExistentFile} does not exist.`);
  });
});
