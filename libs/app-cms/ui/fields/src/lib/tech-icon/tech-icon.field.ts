import { enumName } from '@codeware/app-cms/util/db';
import { type TechBrand, techIconsMap } from '@codeware/shared/ui/primitives';
import type { SelectField } from 'payload';

const options = (
  Object.entries(techIconsMap) as Array<
    [TechBrand, (typeof techIconsMap)[TechBrand]]
  >
).map(([value, { name }]) => ({ label: name, value }));

/**
 * A technology's mark, chosen from the platform's list.
 *
 * One field and one enum wherever a block offers a mark, so the list a tenant
 * picks from and the icons the renderer can draw cannot drift apart: both
 * come from `techIconsMap`.
 */
export const techIconField = ({
  name,
  label,
  admin
}: Pick<SelectField, 'name' | 'label' | 'admin'>): SelectField => ({
  name,
  type: 'select',
  enumName: enumName('tech_icon'),
  label,
  options,
  admin
});
