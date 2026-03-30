import type { Logger } from "winston";
import type { ServerConfig } from "@/config/server-config.js";

export interface BaseService {
  name: string;
  initialize(config: ServerConfig, logger: Logger): Promise<void>;
  cleanup?(): Promise<void>;
}
