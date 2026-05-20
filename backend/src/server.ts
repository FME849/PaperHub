import cors from "cors";
import express from "express";

import { env } from "./config/env.js";
import { registerFetchCycleJob } from "./jobs/fetchCycle.job.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import "./middleware/types.js";
import { fetchCycleRepository } from "./repositories/fetchCycle.repository.js";
import { authRouter } from "./routes/auth.routes.js";
import { favoritesRouter } from "./routes/favorites.routes.js";
import { sourcesRouter } from "./routes/sources.routes.js";
import { topicsRouter } from "./routes/topics.routes.js";
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
app.use("/api/topics", topicsRouter);
app.use("/api/sources", sourcesRouter);

app.use(errorHandler);

async function bootstrap(): Promise<void> {
  try {
    const promoted = await fetchCycleRepository.promoteStuckRunningToFailed();
    console.log(
      `[startup] recovered ${promoted} RUNNING fetch cycle${promoted === 1 ? "" : "s"} (${
        promoted === 0 ? "none in flight from prior run" : "marked FAILED"
      })`,
    );
  } catch (err) {
    console.error("[startup] failed to recover RUNNING fetch cycles:", err);
  }

  registerFetchCycleJob();

  app.listen(env.PORT, () => {
    console.log(`paperhub-backend listening on http://localhost:${env.PORT}`);
  });
}

bootstrap().catch((err: unknown) => {
  console.error("[startup] bootstrap failed:", err);
  process.exit(1);
});
