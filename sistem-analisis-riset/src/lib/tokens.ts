import { randomBytes } from "node:crypto";

export function newInterviewToken(): string {
  return randomBytes(16).toString("hex");
}
