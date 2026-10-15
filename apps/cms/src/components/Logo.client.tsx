import { AuthBrand } from '@codeware/app-cms/ui/auth';

/** The login view's mark (`admin.components.graphics.Logo`), the same as the auth pages' */
const Logo: React.FC = () => {
  return (
    <div className="codeware-admin twp">
      <AuthBrand />
    </div>
  );
};

export default Logo;
