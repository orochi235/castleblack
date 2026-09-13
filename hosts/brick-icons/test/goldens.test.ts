import { expect, it } from 'vitest';
import { paintCommands } from '@castleblack/wall/src/paint';
import { scenarios } from '@lab/corpus/goldens.fixture';
import { goldens, translate } from './legacy';

const captured = goldens();
const cases = scenarios();

it('has a scenario for every captured golden, and a golden for every scenario', () => {
  expect(cases.map((c) => c.name).sort()).toEqual([...captured.keys()].sort());
});

for (const { name, input } of cases) {
  it(`paints ${name} as brick-icons captured it`, () => {
    expect(JSON.parse(JSON.stringify(paintCommands(translate(input)))))
      .toEqual(captured.get(name));
  });
}
