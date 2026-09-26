import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@codeware/shared/ui/shadcn/components/dropdown-menu';
import { Input } from '@codeware/shared/ui/shadcn/components/input';
import { t } from '@codeware/shared/util/i18n';
import { Grid, List, Search, SortAsc } from 'lucide-react';

import { useFileArea } from '../FileAreaContext';
import { sortOptions } from '../utils/sort-options';

/**
 * File area toolbar component with possibilities to search, sort and change view mode.
 */
export const Toolbar = () => {
  const {
    locale,
    viewMode,
    setViewMode,
    sortOption,
    setSortOption,
    searchQuery,
    setSearchQuery
  } = useFileArea();

  const SortIcon =
    sortOptions.find(({ value }) => value === sortOption)?.Icon || SortAsc;

  const getSortLabel = () =>
    t(
      locale,
      sortOptions.find((option) => option.value === sortOption)
        ?.translationKey ?? 'fileArea.sort'
    );

  return (
    <div className="border-b pb-4">
      <div className="flex items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex flex-1 md:max-w-md">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2 transform" />
          <Input
            type="text"
            placeholder={t(locale, 'fileArea.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9"
          />
        </div>

        {/* Sort */}
        <div className="flex w-auto items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
              >
                <SortIcon className="mr-1 size-4" />
                <span className="hidden sm:inline">{getSortLabel()}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {sortOptions.map(({ Icon, translationKey, value }) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() => setSortOption(value)}
                  className="flex items-center"
                >
                  <Icon className="size-4" />
                  {t(locale, translationKey)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* View mode */}
          <div className="flex rounded-md border">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              aria-label={t(locale, 'fileArea.viewGrid')}
              onClick={() => setViewMode('grid')}
              className="h-9 rounded-none rounded-l-md px-2 hover:cursor-pointer"
            >
              <Grid className="size-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              aria-label={t(locale, 'fileArea.viewList')}
              onClick={() => setViewMode('list')}
              className="h-9 rounded-none rounded-r-md px-2 hover:cursor-pointer"
            >
              <List className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
