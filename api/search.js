export default async function handler(req, res) {
  try {
    const {
      q = "",
      offset = "0"
    } = req.query;

    const params = new URLSearchParams({
      query: q,
      facets: JSON.stringify([
        ["project_type:mod"]
      ]),
      limit: "20",
      offset: String(Math.max(0, Math.min(10000, Number(offset) || 0))),
      index: "downloads"
    });

    const response = await fetch(
      `https://api.modrinth.com/v2/search?${params}`,
      {
        headers: {
          "User-Agent": "ModPackX/2.0.0"
        }
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Modrinth search failed"
      });
    }

    const data = await response.json();

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
