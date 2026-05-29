declare global {
  namespace Express {
    interface Request {
      userId?: number;
      rateLimited?: boolean;
    }
  }
}

export {};
