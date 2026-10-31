import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import pg from "pg";
import { createApp } from "../../src/app.js";
import { createPgContactRepository } from "../../src/repositories/contactRepository.js";

// Prérequis : docker compose up -d --wait && npm run migrate (variables PG* exportées).
const TEST_DOMAIN = "@int-test.example";

describe("Intégration API ↔ PostgreSQL", () => {
  let pool;
  let app;

  beforeAll(() => {
    pool = new pg.Pool();
    app = createApp({ contactRepository: createPgContactRepository(pool) });
  });

  afterAll(async () => {
    // nettoyage : on ne supprime que les lignes créées par ces tests
    await pool.query("DELETE FROM contacts WHERE email LIKE $1", [`%${TEST_DOMAIN}`]);
    await pool.end();
  });

  it("enregistre un contact dans PostgreSQL", async () => {
    const email = `ada-${Date.now()}${TEST_DOMAIN}`;
    const res = await request(app)
      .post("/api/contact")
      .send({ name: "Ada Lovelace", email, message: "Message d'intégration." });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("received");

    // Vérification directe en base, indépendante de l'API
    const { rows } = await pool.query(
      "SELECT name, email, message FROM contacts WHERE id = $1",
      [res.body.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      name: "Ada Lovelace",
      email,
      message: "Message d'intégration.",
    });
  });

  it("résiste à une tentative d'injection SQL", async () => {
    const name = "x'); DROP TABLE contacts;--";
    const email = `inj-${Date.now()}${TEST_DOMAIN}`;
    const res = await request(app)
      .post("/api/contact")
      .send({ name, email, message: "Test d'injection SQL." });

    expect(res.status).toBe(201);

    // La table existe toujours
    const table = await pool.query("SELECT to_regclass('public.contacts') AS t");
    expect(table.rows[0].t).toBe("contacts");

    // La valeur est stockée telle quelle : c'est une donnée, pas du SQL exécuté
    const { rows } = await pool.query("SELECT name FROM contacts WHERE id = $1", [res.body.id]);
    expect(rows[0].name).toBe(name);
  });
});
