import { Button } from '@codeware/shared/ui/shadcn/components/button';

export type AuthLanguage = 'sv' | 'en';

const LANGUAGES: ReadonlyArray<{ code: AuthLanguage; label: string }> = [
  { code: 'sv', label: 'Svenska' },
  { code: 'en', label: 'English' }
];

export type LanguageSwitchViewProps = {
  current: AuthLanguage;
  /** Names the group for assistive technology */
  label: string;
  onSelect: (language: AuthLanguage) => void;
};

/** Two text buttons that pick the language of the auth pages */
export function LanguageSwitchView({
  current,
  label,
  onSelect
}: LanguageSwitchViewProps) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {LANGUAGES.map(({ code, label: text }) => (
        <Button
          key={code}
          type="button"
          variant="ghost"
          size="sm"
          lang={code}
          aria-current={code === current ? 'true' : undefined}
          className={
            code === current
              ? 'text-foreground font-semibold'
              : 'text-muted-foreground'
          }
          onClick={() => onSelect(code)}
        >
          {text}
        </Button>
      ))}
    </div>
  );
}
