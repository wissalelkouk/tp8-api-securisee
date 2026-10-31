// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "INVALID_JSON" });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "PAYLOAD_TOO_LARGE" });
  }

  // La stack et le message réel restent côté serveur, jamais côté client.
  console.error(err);
  return res.status(500).json({ error: "INTERNAL_ERROR" });
}
