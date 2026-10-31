/**
 * Middleware générique de validation avec un schéma Zod.
 */
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      // pour un champ en trop (.strict()), le chemin est vide : on nomme les clés refusées
      field: issue.path.length > 0 ? issue.path.join(".") : (issue.keys?.join(", ") ?? "body"),
      message: issue.message,
    }));
    return res.status(400).json({ error: "VALIDATION_ERROR", details });
  }

  req.body = result.data; // uniquement les données validées et nettoyées
  next();
};
