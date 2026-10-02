import { duplicatePropNames } from './duplicate-prop-names';

describe('duplicatePropNames', () => {
  it('lists each repeated name once', () => {
    expect(
      duplicatePropNames([
        { name: 'a' },
        { name: 'b' },
        { name: 'a' },
        { name: 'a' },
        { name: 'b' }
      ])
    ).toEqual(['a', 'b']);
  });

  it('is empty for unique names, empty rows and no rows', () => {
    expect(duplicatePropNames([{ name: 'a' }, { name: 'b' }])).toEqual([]);
    expect(duplicatePropNames([{ name: '' }, { name: null }, {}])).toEqual([]);
    expect(duplicatePropNames(null)).toEqual([]);
  });

  it('tells names apart by case', () => {
    expect(duplicatePropNames([{ name: 'a' }, { name: 'A' }])).toEqual([]);
  });
});
