import { CdwrCloud } from '@codeware/shared/ui/primitives';

/** The platform's mark and name, shown above every auth card */
export function AuthBrand() {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-foreground opacity-80">
        <CdwrCloud size={72} />
      </div>
      <span className="text-muted-foreground text-lg font-medium tracking-widest">
        Codeware CMS
      </span>
    </div>
  );
}
