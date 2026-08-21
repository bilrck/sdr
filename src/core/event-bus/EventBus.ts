import EventEmitter2Pkg from 'eventemitter2';

const EventEmitter2 = (EventEmitter2Pkg as any).EventEmitter2 || (EventEmitter2Pkg as any).default || EventEmitter2Pkg;

export interface AppEvent<T = any> {
  id: string;
  timestamp: Date;
  tenantId: string;
  type: string;
  payload: T;
}

export class EventBus {
  private static instance: EventBus;
  private emitter: any;

  private constructor() {
    this.emitter = new EventEmitter2({
      wildcard: true,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 100,
      verboseMemoryLeak: true,
      ignoreErrors: false,
    });
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Publish an event to the bus.
   */
  public publish<T>(type: string, tenantId: string, payload: T): void {
    const event: AppEvent<T> = {
      id: Math.random().toString(36).substring(2, 11),
      timestamp: new Date(),
      tenantId,
      type,
      payload,
    };
    
    console.log(`[EventBus] Publishing event: "${type}" for Tenant: ${tenantId}`);
    this.emitter.emit(type, event);
  }

  /**
   * Subscribe to a specific event or wildcard pattern.
   */
  public subscribe<T>(type: string, handler: (event: AppEvent<T>) => void | Promise<void>): void {
    this.emitter.on(type, (event: AppEvent<T>) => {
      // Run handler asynchronously and catch errors to prevent crashing the event loop
      Promise.resolve(handler(event)).catch((err) => {
        console.error(`[EventBus] Error handling event "${type}":`, err);
      });
    });
  }

  /**
   * Remove a subscriber.
   */
  public unsubscribe(type: string, handler: (...args: any[]) => void): void {
    this.emitter.off(type, handler);
  }
}

export const eventBus = EventBus.getInstance();
