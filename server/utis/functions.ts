export function safeParseJSON(content: string) {
  const cleaned = content
    .replace(/```json\s*/i, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    console.error("❌ Failed to parse JSON");
    return null;
  }
}