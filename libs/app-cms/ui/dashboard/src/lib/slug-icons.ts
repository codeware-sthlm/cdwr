import { CollectionSlug } from '@codeware/shared/util/payload-types';
import {
  Bars3Icon,
  ClipboardDocumentListIcon,
  CodeBracketSquareIcon,
  Cog6ToothIcon,
  DocumentIcon,
  DocumentTextIcon,
  FolderIcon,
  InboxIcon,
  MapIcon,
  MapPinIcon,
  PaintBrushIcon,
  PhotoIcon,
  QuestionMarkCircleIcon,
  RectangleGroupIcon,
  RectangleStackIcon,
  SquaresPlusIcon,
  SwatchIcon,
  TagIcon,
  TicketIcon,
  UserGroupIcon,
  UsersIcon
} from '@heroicons/react/24/outline';

import type { IconComponent } from './types';

const SLUG_ICON: Record<CollectionSlug, IconComponent> = {
  categories: RectangleGroupIcon,
  'custom-components': CodeBracketSquareIcon,
  'custom-themes': PaintBrushIcon,
  faq: QuestionMarkCircleIcon,
  forms: ClipboardDocumentListIcon,
  'form-submissions': InboxIcon,
  pages: DocumentIcon,
  places: MapPinIcon,
  'platform-labels': SwatchIcon,
  'platform-settings': Cog6ToothIcon,
  posts: DocumentTextIcon,
  media: PhotoIcon,
  navigation: Bars3Icon,
  'reusable-content': SquaresPlusIcon,
  'site-settings': Cog6ToothIcon,
  'stock-media': RectangleStackIcon,
  tags: TagIcon,
  tenants: UserGroupIcon,
  'tour-signups': TicketIcon,
  tours: MapIcon,
  users: UsersIcon
};

/** Resolve the icon for a collection slug, falling back to a folder. */
export function getSlugIcon(slug: string): IconComponent {
  return SLUG_ICON[slug as CollectionSlug] ?? FolderIcon;
}
