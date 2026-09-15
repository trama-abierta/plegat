export default {
  schema: "./src/db/schema.js",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://plegat_app:0f3b14631c7cf0c09ef43ad327d2ad00abab8027d596d9ca673dc67be16163dc@127.0.0.1:5432/plegat",
  },
};
