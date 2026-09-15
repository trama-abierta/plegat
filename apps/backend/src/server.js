import pg from "pg";
import { buildApp } from "./app.js";
import { createStore } from "./store.js";
import { createDrizzle } from "./db/drizzle.js";
import { databaseConfig, platformAdminConfig } from "./config.js";
const db = new pg.Pool(databaseConfig());
const orm = createDrizzle(db);
const store = createStore({ db, orm, seed: true });
const app = buildApp({ db, store });
app.addHook("onClose", async () => db.end());
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await app.close();
  });
try {
  const configured = platformAdminConfig();
  if (configured.email && configured.password)
    await store
      .bootstrapPlatform({
        name: configured.name,
        email: configured.email,
        password: configured.password,
      })
      .catch((error) => {
        if (error.code !== "BOOTSTRAP_CLOSED") throw error;
      });
  await app.listen({
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 3000),
  });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
