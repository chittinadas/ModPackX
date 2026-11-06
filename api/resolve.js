export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST required" });
  }

  try {
    const { ids, game, loader } = req.body || {};

    const allowed = ["fabric", "forge", "neoforge", "quilt"];

    if (
      !Array.isArray(ids) ||
      ids.length < 1 ||
      ids.length > 30 ||
      !allowed.includes(loader) ||
      !/^\d+\.\d+(\.\d+)?$/.test(game || "")
    ) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const queue = [...new Set(ids)];
    const visited = new Set();
    const files = [];
    const issues = [];

    while (queue.length && visited.size < 80) {
      const id = queue.shift();

      if (visited.has(id)) continue;
      visited.add(id);

      const params = new URLSearchParams({
        loaders: JSON.stringify([loader]),
        game_versions: JSON.stringify([game]),
        include_changelog: "false"
      });

      const response = await fetch(
        `https://api.modrinth.com/v2/project/${encodeURIComponent(id)}/version?${params}`,
        {
          headers: {
            "User-Agent": "ModPackX/2.0.0"
          }
        }
      );

      if (!response.ok) {
        issues.push({ id, reason: "Version lookup failed" });
        continue;
      }

      const versions = await response.json();

      if (!versions.length) {
        issues.push({
          id,
          reason: "No compatible version"
        });
        continue;
      }

      const version = versions[0];

      const file =
        version.files.find(item => item.primary) ||
        version.files[0];

      if (!file) {
        issues.push({ id, reason: "No downloadable file" });
        continue;
      }

      files.push({
        project: id,
        name: file.filename,
        url: file.url,
        version: version.name,
        size: file.size
      });

      for (const dep of version.dependencies || []) {
        if (
          dep.dependency_type === "required" &&
          dep.project_id &&
          !visited.has(dep.project_id)
        ) {
          queue.push(dep.project_id);
        }
      }
    }

    res.status(200).json({
      files,
      issues,
      total: files.length
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
