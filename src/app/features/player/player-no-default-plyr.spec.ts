import { describe, it, expect, vi } from 'vitest';

vi.mock('plyr', () => {
  class MockPlyrWithoutDefault {
    loop = false;
    constructor() {}
    on() {}
  }
  return {
    default: undefined,
    MockPlyrWithoutDefault,
  };
});

describe('PlayerComponent without default export in plyr', () => {
  it('should evaluate the fallback branch for Plyr import', async () => {
    const { PlayerComponent } = await import('./player.component');
    expect(PlayerComponent).toBeTruthy();
  });
});
