import { describe, expect, it } from 'vitest';
import { formatTime, plainLine, plural } from '@/lib/format';

describe('format', () => {
  it('plural', () => {
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111].map((n) => plural(n, 'день', 'дня', 'дней'))).toEqual(
      ['день', 'дня', 'дней', 'дней', 'дней', 'день', 'дня', 'дней', 'дней'],
    );
  });
  it('formatTime', () => {
    expect([0, 15, 60, 75, 180].map(formatTime)).toEqual(['0:00', '0:15', '1:00', '1:15', '3:00']);
  });
  it('plainLine strips markup (REQ-SES-4)', () => {
    expect(plainLine('КАРЛ у | КЛА-ры у- | КРАЛ ко- | РАЛ-лы')).toBe('КАРЛ у КЛАры уКРАЛ коРАЛлы');
    expect(plainLine('> на дво- | РЕ тра- | ВА _')).toBe('на двоРЕ траВА');
    expect(plainLine('Шла Саша по шоссе')).toBe('Шла Саша по шоссе');
    expect(plainLine('кто-то при+шёл', 'auto')).toBe('кто-то пришёл');
  });
});
