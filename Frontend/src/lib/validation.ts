const PAPER_ID_RE = /^[A-Za-z0-9.\-/]{3,64}$/;

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.length > 0 && trimmed.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

export function passwordHint(): string {
  return "Password must be at least 8 characters and include a letter and a number.";
}

export function isValidDisplayName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 80;
}

export function isValidPaperId(paperId: string): boolean {
  return PAPER_ID_RE.test(paperId.trim());
}
