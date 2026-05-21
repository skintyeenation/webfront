import sys, json, re
from urllib.parse import urlparse

seen = set()
out = []
for line in sys.stdin:
    u = line.strip().strip('"')
    if not u or u in seen:
        continue
    seen.add(u)
    path = urlparse(u).path.strip("/")
    slug = path.split("/")[-1] if path else "home"
    slug = re.sub(r"[^a-z0-9-]+", "-", slug.lower()).strip("-") or "home"
    out.append({"url": u, "file": slug})

json.dump(out, open("/tmp/pages.json", "w"), indent=2)
print(f"{len(out)} pages")
