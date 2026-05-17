import cors from "cors";
import express from "express";

import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import "./middleware/types.js";
import { authRouter } from "./routes/auth.routes.js";
import { favoritesRouter } from "./routes/favorites.routes.js";
import { usersRouter } from "./routes/users.routes.js";

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN, credentials: false }));
app.use(express.json());
app.use(requestLogger);

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/favorites", favoritesRouter);

app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`paperhub-backend listening on http://localhost:${env.PORT}`);
});
