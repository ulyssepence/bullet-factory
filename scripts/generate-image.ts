import "dotenv/config";
import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";

const client = new OpenAI(); // reads OPENAI_API_KEY from env

const prompt = process.argv.slice(2).join(" ") || "A low-poly 3D game character, vampire survivor style, top-down perspective, on a dark grassy field";

async function main() {
  console.log(`Generating image for: "${prompt}"`);

  const result = await client.images.generate({
    model: "gpt-image-1",
    prompt,
    quality: "medium",
    size: "1024x1024",
    output_format: "png",
  });

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data returned");

  const outDir = path.resolve(import.meta.dirname, "../generated");
  fs.mkdirSync(outDir, { recursive: true });

  const filename = `image-${Date.now()}.png`;
  const outPath = path.join(outDir, filename);
  fs.writeFileSync(outPath, Buffer.from(b64, "base64"));

  console.log(`Saved to ${outPath}`);
  console.log(`Revised prompt: ${result.data?.[0]?.revised_prompt ?? "(none)"}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
