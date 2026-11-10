import type { DomainEvents } from "@mrd/contracts";
import type { Logger } from "./logger.js";

export type Handler<K extends keyof DomainEvents> = (payload: DomainEvents[K]) => void | Promise<void>;

/** Pub/sub trong process. Lỗi của handler không bao giờ ảnh hưởng bên phát (R14). */
export interface EventBus {
  publish<K extends keyof DomainEvents>(name: K, payload: DomainEvents[K]): void;
  subscribe<K extends keyof DomainEvents>(name: K, handler: Handler<K>): () => void;
}

export function createEventBus(log?: Logger): EventBus {
  const handlers = new Map<string, Set<Handler<never>>>();
  return {
    publish(name, payload) {
      for (const h of handlers.get(name) ?? []) {
        Promise.resolve()
          .then(() => (h as Handler<typeof name>)(payload))
          .catch((err) => log?.error(`event handler lỗi: ${String(name)}`, { err: String(err) }));
      }
    },
    subscribe(name, handler) {
      const set = handlers.get(name) ?? new Set();
      set.add(handler as Handler<never>);
      handlers.set(name, set);
      return () => set.delete(handler as Handler<never>);
    },
  };
}
