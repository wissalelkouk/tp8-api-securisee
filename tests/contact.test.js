import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createMemoryContactRepository } from "../src/repositories/contactRepository.js";

const valid = { name: "Ada Lovelace", email: "ada@example.com", message: "Bonjour, ceci est un test." };

// Récupère la liste des champs signalés dans details
const fields = (res) => res.body.details.map((d) => d.field);

describe("POST /api/contact", () => {
  let repo;
  let app;
  beforeEach(() => {
    repo = createMemoryContactRepository();
    app = createApp({ contactRepository: repo });
  });

  it("accepte un message valide (201)", async () => {
    const res = await request(app).post("/api/contact").send(valid);
    expect(res.status).toBe(201);
    expect(repo.items).toHaveLength(1);
  });

  it("refuse un email invalide (400 VALIDATION_ERROR)", async () => {
    const res = await request(app).post("/api/contact").send({ ...valid, email: "pas-un-email" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
    expect(fields(res)).toContain("email");
    expect(repo.items).toHaveLength(0);
  });

  it("refuse un champ manquant", async () => {
    const { message, ...sansMessage } = valid;
    const res = await request(app).post("/api/contact").send(sansMessage);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
    expect(fields(res)).toContain("message");
    expect(repo.items).toHaveLength(0);
  });

  it("refuse un champ supplémentaire (ex. isAdmin: true)", async () => {
    const res = await request(app).post("/api/contact").send({ ...valid, isAdmin: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
    expect(fields(res)).toContain("isAdmin");
    expect(repo.items).toHaveLength(0);
  });

  it("refuse un type inattendu (message: 42, name: ['a'])", async () => {
    const res = await request(app).post("/api/contact").send({ ...valid, message: 42, name: ["a"] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
    expect(fields(res)).toEqual(expect.arrayContaining(["message", "name"]));
    expect(repo.items).toHaveLength(0);
  });

  it("refuse un JSON mal formé (400 INVALID_JSON)", async () => {
    const res = await request(app)
      .post("/api/contact")
      .set("Content-Type", "application/json")
      .send('{"name": "Ada",');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "INVALID_JSON" });
  });

  it("refuse un corps de plus de 10 ko (413)", async () => {
    const res = await request(app)
      .post("/api/contact")
      .send({ ...valid, message: "a".repeat(20000) });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "PAYLOAD_TOO_LARGE" });
    expect(repo.items).toHaveLength(0);
  });

  it("stocke tel quel un nom contenant une tentative d'injection SQL", async () => {
    const name = "x'); DROP TABLE contacts;--";
    const res = await request(app).post("/api/contact").send({ ...valid, name });
    expect(res.status).toBe(201);
    // La valeur est traitée comme une simple donnée, jamais comme du SQL
    expect(repo.items[0].name).toBe(name);
  });

  it("répond 404 JSON sur une route inconnue", async () => {
    const res = await request(app).get("/nimporte-quoi");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "NOT_FOUND" });
  });

  describe("erreur serveur", () => {
    let spy;
    beforeEach(() => {
      // évite de polluer la sortie des tests avec console.error
      spy = vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => spy.mockRestore());

    it("ne renvoie jamais de stack trace en cas d'erreur 500", async () => {
      const failingRepo = {
        async create() {
          throw new Error("secret: connexion SQL échouée");
        },
      };
      const failingApp = createApp({ contactRepository: failingRepo });

      const res = await request(failingApp).post("/api/contact").send(valid);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "INTERNAL_ERROR" });
      expect(res.body.stack).toBeUndefined();
      expect(res.text).not.toContain("secret");
      expect(res.text).not.toContain("at ");
      // l'erreur a bien été journalisée côté serveur
      expect(spy).toHaveBeenCalled();
    });
  });

  it("ajoute les headers de sécurité Helmet (x-content-type-options, ...)", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["strict-transport-security"]).toBeDefined();
  });

  it("ne renvoie pas le header x-powered-by", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("répond 429 après trop de requêtes sur /api/contact", async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await request(app).post("/api/contact").send(valid);
      expect(ok.status).toBe(201);
    }
    const res = await request(app).post("/api/contact").send(valid);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: "TOO_MANY_REQUESTS" });
  });
});
