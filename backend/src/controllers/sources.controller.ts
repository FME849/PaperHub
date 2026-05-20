import type { Request, Response } from "express";

import { SOURCES } from "../config/sources.js";

export const sourcesController = {
  list(_req: Request, res: Response): void {
    res.status(200).json({
      sources: SOURCES.map((s) => ({
        id: s.id,
        displayName: s.displayName,
        filterKey: s.filterKey,
        filterValues: s.filterValues.map((f) => ({
          value: f.value,
          displayName: f.displayName,
        })),
      })),
    });
  },
};
