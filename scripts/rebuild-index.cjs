const fs = require("fs");
const path = require("path");

const dir = "public/blogs";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
const out = [];

for (const f of files) {
  const raw = fs.readFileSync(path.join(dir, f), "utf8");
  const start = raw.indexOf("\n---");
  if (raw.startsWith("---") ? start === -1 : start === -1) {
    console.error("NO FRONTMATTER:", f);
    continue;
  }
  const fmStart = raw.startsWith("---") ? 3 : start + 4;
  const end = raw.indexOf("\n---", fmStart);
  if (end === -1) {
    console.error("UNCLOSED FRONTMATTER:", f);
    continue;
  }
  const fm = raw.slice(fmStart, end);

  const get = (k) => {
    const m = fm.match(new RegExp("^" + k + ":\\s*(.+)$", "m"));
    if (!m) return "";
    let v = m[1].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    return v;
  };

  const tagsRaw = get("tags");
  let tags = [];
  if (tagsRaw.startsWith("[")) {
    tags = tagsRaw
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
  }

  const entry = {
    slug: path.basename(f, ".md"),
    title: get("title"),
    date: get("date"),
    tags,
    cover: get("cover"),
    description: get("description"),
  };

  if (!entry.title) console.error("MISSING title:", f);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) console.error("BAD date:", f, entry.date);
  if (entry.date > "2026-10-22") console.error("DATE OVER DEADLINE:", f, entry.date);
  out.push(entry);
}

out.sort((a, b) => a.date.localeCompare(b.date));
fs.writeFileSync("public/posts/index.json", JSON.stringify(out, null, 2) + "\n", "utf8");

console.log("total:", out.length);
for (const o of out) console.log(o.date + "  " + o.slug);