import { render } from 'ink-testing-library';

import { Confirm, MultiSelect, Select, Table, TextInput } from './widgets';

const DOWN = '\u001b[B';
const ENTER = '\r';
const ESC = '\u001b';
const tick = () => new Promise((r) => setTimeout(r, 20));

describe('Select', () => {
  it('moves with arrows and submits the highlighted value', async () => {
    const onSubmit = vi.fn();
    const { stdin, lastFrame } = render(
      <Select
        message="Which?"
        choices={[{ value: 'a', hint: 'first' }, { value: 'b' }]}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    );
    expect(lastFrame()).toContain('❯ a');
    stdin.write(DOWN);
    await tick();
    expect(lastFrame()).toContain('❯ b');
    stdin.write(ENTER);
    await tick();
    expect(onSubmit).toHaveBeenCalledWith('b');
  });

  it('starts on the initial value and cancels on escape', async () => {
    const onCancel = vi.fn();
    const { stdin, lastFrame } = render(
      <Select
        message="Which?"
        choices={[{ value: 'a' }, { value: 'b' }]}
        initial="b"
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />
    );
    expect(lastFrame()).toContain('❯ b');
    stdin.write(ESC);
    await tick();
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('MultiSelect', () => {
  it('toggles with space, refuses fewer than min, submits the picked ones', async () => {
    const onSubmit = vi.fn();
    const { stdin, lastFrame } = render(
      <MultiSelect
        message="Which?"
        choices={[{ value: 'a' }, { value: 'b' }]}
        min={1}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    );
    stdin.write(ENTER);
    await tick();
    expect(lastFrame()).toContain('Pick at least 1');
    stdin.write(' ');
    await tick();
    stdin.write(DOWN);
    await tick();
    stdin.write(' ');
    await tick();
    stdin.write(ENTER);
    await tick();
    expect(onSubmit).toHaveBeenCalledWith(['a', 'b']);
  });
});

describe('TextInput', () => {
  it("types and submits, and shows the asker's refusal", async () => {
    const onSubmit = vi.fn();
    const { stdin, lastFrame, rerender } = render(
      <TextInput message="Name?" onSubmit={onSubmit} onCancel={vi.fn()} />
    );
    stdin.write('ab');
    await tick();
    stdin.write(ENTER);
    await tick();
    expect(onSubmit).toHaveBeenCalledWith('ab');
    rerender(
      <TextInput
        message="Name?"
        error="Too short"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    );
    await tick();
    expect(lastFrame()).toContain('Too short');
  });

  it('masks a password', async () => {
    const { stdin, lastFrame } = render(
      <TextInput message="Token?" mask onSubmit={vi.fn()} onCancel={vi.fn()} />
    );
    stdin.write('xyz');
    await tick();
    expect(lastFrame()).toContain('•••');
    expect(lastFrame()).not.toContain('xyz');
  });
});

describe('Confirm', () => {
  it('answers y and n at once', async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(
      <Confirm message="Go?" onSubmit={onSubmit} onCancel={vi.fn()} />
    );
    stdin.write('y');
    await tick();
    expect(onSubmit).toHaveBeenCalledWith(true);
  });
});

describe('Table', () => {
  it('pads columns to the widest cell', () => {
    const { lastFrame } = render(
      <Table
        head={['app', 'state']}
        rows={[
          ['cdwr-cms', 'started'],
          ['x', 'stopped']
        ]}
      />
    );
    expect(lastFrame()).toContain('cdwr-cms  started');
    expect(lastFrame()).toContain('x         stopped');
  });
});
