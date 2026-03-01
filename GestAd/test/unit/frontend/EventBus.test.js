import { EventBus, eventBus } from '../../../public/js/utils/EventBus.js';

describe('EventBus', () => {
  let bus;

  beforeEach(() => {
    bus = new EventBus();
  });

  describe('on()', () => {
    it('should register a handler for an event', () => {
      const handler = jest.fn();
      bus.on('test', handler);
      bus.emit('test');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should register multiple handlers for the same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      bus.on('test', handler1);
      bus.on('test', handler2);
      bus.emit('test');
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should return the EventBus instance for chaining', () => {
      const result = bus.on('test', jest.fn());
      expect(result).toBe(bus);
    });
  });

  describe('off()', () => {
    it('should remove a registered handler', () => {
      const handler = jest.fn();
      bus.on('test', handler);
      bus.off('test', handler);
      bus.emit('test');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should not throw when removing a handler for non-existent event', () => {
      expect(() => bus.off('nonexistent', jest.fn())).not.toThrow();
    });

    it('should only remove the specified handler', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      bus.on('test', handler1);
      bus.on('test', handler2);
      bus.off('test', handler1);
      bus.emit('test');
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should return the EventBus instance for chaining', () => {
      const result = bus.off('test', jest.fn());
      expect(result).toBe(bus);
    });
  });

  describe('emit()', () => {
    it('should call handlers with provided arguments', () => {
      const handler = jest.fn();
      bus.on('test', handler);
      bus.emit('test', 'arg1', 42);
      expect(handler).toHaveBeenCalledWith('arg1', 42);
    });

    it('should not throw when emitting an event with no handlers', () => {
      expect(() => bus.emit('nonexistent')).not.toThrow();
    });

    it('should return the EventBus instance for chaining', () => {
      const result = bus.emit('test');
      expect(result).toBe(bus);
    });

    it('should call all handlers for the event', () => {
      const calls = [];
      bus.on('test', () => calls.push(1));
      bus.on('test', () => calls.push(2));
      bus.emit('test');
      expect(calls).toEqual([1, 2]);
    });
  });

  describe('once()', () => {
    it('should call the handler only once', () => {
      const handler = jest.fn();
      bus.once('test', handler);
      bus.emit('test');
      bus.emit('test');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments to the handler', () => {
      const handler = jest.fn();
      bus.once('test', handler);
      bus.emit('test', 'data');
      expect(handler).toHaveBeenCalledWith('data');
    });

    it('should return the EventBus instance for chaining', () => {
      const result = bus.once('test', jest.fn());
      expect(result).toBe(bus);
    });

    it('should not interfere with regular handlers', () => {
      const onceHandler = jest.fn();
      const onHandler = jest.fn();
      bus.once('test', onceHandler);
      bus.on('test', onHandler);
      bus.emit('test');
      bus.emit('test');
      expect(onceHandler).toHaveBeenCalledTimes(1);
      expect(onHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('removeAll()', () => {
    it('should remove all handlers for a specific event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      bus.on('test', handler1);
      bus.on('test', handler2);
      bus.removeAll('test');
      bus.emit('test');
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should remove all handlers for all events when no event specified', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      bus.on('event1', handler1);
      bus.on('event2', handler2);
      bus.removeAll();
      bus.emit('event1');
      bus.emit('event2');
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should return the EventBus instance for chaining', () => {
      const result = bus.removeAll('test');
      expect(result).toBe(bus);
    });
  });

  describe('eventBus singleton', () => {
    it('should export a shared EventBus instance', () => {
      expect(eventBus).toBeInstanceOf(EventBus);
    });

    it('should be usable as a global event bus', () => {
      const handler = jest.fn();
      eventBus.on('global-test', handler);
      eventBus.emit('global-test', { data: 'test' });
      expect(handler).toHaveBeenCalledWith({ data: 'test' });
      eventBus.off('global-test', handler);
    });
  });
});
