import { splitCodeNames } from './code-names';

describe('splitCodeNames', () => {
  it('marks a setting name at the start', () => {
    expect(splitCodeNames('DEPLOY_RULES could not be read')).toEqual([
      { text: 'DEPLOY_RULES', code: true },
      { text: ' could not be read', code: false }
    ]);
  });

  it('marks several names in one line', () => {
    expect(
      splitCodeNames(
        '1 without PAYLOAD_API_KEY · Optional settings: RESTRICTED_FONTS'
      )
    ).toEqual([
      { text: '1 without ', code: false },
      { text: 'PAYLOAD_API_KEY', code: true },
      { text: ' · Optional settings: ', code: false },
      { text: 'RESTRICTED_FONTS', code: true }
    ]);
  });

  it.each(['Ready', 'API key', 'cdwr-cms-demo', 'Förhandsversion'])(
    'leaves %s as plain text',
    (text) => {
      expect(splitCodeNames(text)).toEqual([{ text, code: false }]);
    }
  );
});
