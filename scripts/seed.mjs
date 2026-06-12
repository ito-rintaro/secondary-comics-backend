// Seed sample data by POSTing to the deployed API.
// Usage: node scripts/seed.mjs <api_base_url>
//   e.g. node scripts/seed.mjs https://abc123.execute-api.ap-northeast-1.amazonaws.com
const baseUrl = process.argv[2]?.replace(/\/$/, "");
if (!baseUrl) {
  console.error("Usage: node scripts/seed.mjs <api_base_url>");
  process.exit(1);
}

const samples = [
  { title: "サンプル作品A", author: "作者A", circle: "サークルA", tags: ["fantasy"] },
  { title: "サンプル作品B", author: "作者B", circle: "サークルB", tags: ["sci-fi", "action"] },
  { title: "サンプル作品C", author: "作者C", circle: "サークルC", tags: ["slice-of-life"] },
];

for (const s of samples) {
  const res = await fetch(`${baseUrl}/comics`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(s),
  });
  const body = await res.json();
  console.log(res.status, JSON.stringify(body));
}
