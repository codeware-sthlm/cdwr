'use client';
import type {
  BlockSlug,
  ContentBlock as ContentBlockProps,
  Page,
  ReusableContentBlock as ReusableContentBlockProps
} from '@codeware/shared/util/payload-types';
import type { BlocksData } from '@codeware/shared/util/payload-utils';
import { cn } from '@codeware/shared/util/ui';
import { useRef } from 'react';

import { AboutBlock } from './blocks/AboutBlock';
import { CalloutBlock } from './blocks/CalloutBlock';
import { CardBlock } from './blocks/CardBlock';
import { CodeBlock } from './blocks/CodeBlock';
import { FeatureCardsBlock } from './blocks/FeatureCardsBlock';
import { FeatureSectionBlock } from './blocks/FeatureSectionBlock';
import { FileAreaBlock } from './blocks/FileAreaBlock';
import { FormBlock } from './blocks/FormBlock';
import { HeroBlock } from './blocks/HeroBlock';
import { ImageBlock } from './blocks/ImageBlock';
import { MediaBlock } from './blocks/MediaBlock';
import { PillListBlock } from './blocks/PillListBlock';
import { PostsBlock } from './blocks/PostsBlock';
import { RichText } from './blocks/RichText';
import { ShowcaseBlock } from './blocks/ShowcaseBlock';
import { SocialMediaBlock } from './blocks/SocialMediaBlock';
import { SpacingBlock } from './blocks/SpacingBlock';
import { ToursBlock } from './blocks/ToursBlock';
import { VideoBlock } from './blocks/VideoBlock';
import { ColumnSizeProvider } from './providers/ColumnSizeProvider';

type ContentBlockWithData = ContentBlockProps & { blocksData?: BlocksData };
type ReusableContentBlockWithData = ReusableContentBlockProps & {
  blocksData?: BlocksData;
};

/**
 * Render Payload content block data, with the configured number of columns
 * and rich text content in each column.
 *
 * Optional blocks are rendered after the rich text content, within each column.
 *
 * User defined column sizes are applied for tablets and desktops.
 * Mobile devices display all columns as full width.
 */
export const ContentBlock: React.FC<ContentBlockWithData> = ({
  columns,
  blocksData
}) => {
  return (
    <div className="grid w-full grid-cols-12 gap-x-4 gap-y-8 overflow-hidden md:gap-x-8 lg:gap-x-16">
      {columns?.map((col, index) => {
        const { blocks, richText } = col;
        const size = col.size ?? 'full';

        return (
          <ColumnSizeProvider size={size} key={index}>
            <div
              className={cn('first-child-no-margin col-span-12', {
                'md:col-span-4': size === 'one-third',
                'md:col-span-6': size === 'half',
                'md:col-span-8': size === 'two-thirds'
              })}
            >
              {richText && <RichText data={richText} />}
              {!!blocks?.length && (
                <RenderBlocks
                  className={cn({ 'mt-8': !!richText })}
                  blocks={blocks}
                  blocksData={blocksData}
                />
              )}
            </div>
          </ColumnSizeProvider>
        );
      })}
    </div>
  );
};

/**
 * Render Payload reusable content block data, by rendering its layout blocks.
 */
export const ReusableContentBlock: React.FC<ReusableContentBlockWithData> = ({
  reusableContent,
  refId,
  blocksData
}) => {
  if (reusableContent && typeof reusableContent === 'object') {
    return (
      <RenderBlocks
        blocks={reusableContent.layout}
        refId={refId}
        blocksData={blocksData}
      />
    );
  }
  return null;
};

// Why are the components above defined here and not in `blocks/` folder?
// Components depend on `RenderBlocks`. To avoid circular dependencies,
// these components must be defined in the same file as `RenderBlocks`.

/**
 * Resolve extra props to inject into a block component from pre-fetched data.
 *
 * Blocks that use Payload relationship fields get their data resolved automatically
 * by Payload's `depth` option and need no extra props.
 *
 * Blocks that query a collection dynamically (listing blocks) receive pre-fetched
 * data keyed by block id via `blocksData`. This function maps each such block type
 * to its resolved data, or threads `blocksData` through container blocks so nested
 * listing blocks can also receive their data.
 *
 * When adding a new listing block, add a case here alongside its entry in
 * `BlocksData`.
 */
function resolveBlockProps(
  block: NonNullable<Page['layout']>[number],
  blocksData: BlocksData | undefined
): Record<string, unknown> {
  switch (block.blockType) {
    // Container blocks: thread blocksData through so nested listing blocks receive their data
    case 'content':
    case 'reusable-content':
      return { blocksData };

    // Listing blocks: resolve pre-fetched collection data by block id
    case 'posts':
      return { posts: (block.id && blocksData?.posts?.[block.id]) ?? [] };
    case 'tours':
      return { tours: (block.id && blocksData?.tours?.[block.id]) ?? [] };

    default:
      return {};
  }
}

/** Block slug to component mapping */
const blocksMap: Record<
  BlockSlug,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  React.JSXElementConstructor<any>
> = {
  about: AboutBlock,
  callout: CalloutBlock,
  card: CardBlock,
  code: CodeBlock,
  content: ContentBlock,
  'feature-cards': FeatureCardsBlock,
  'feature-section': FeatureSectionBlock,
  'file-area': FileAreaBlock,
  form: FormBlock,
  hero: HeroBlock,
  image: ImageBlock,
  media: MediaBlock,
  'pill-list': PillListBlock,
  posts: PostsBlock,
  'reusable-content': ReusableContentBlock,
  showcase: ShowcaseBlock,
  'social-media': SocialMediaBlock,
  spacing: SpacingBlock,
  tours: ToursBlock,
  video: VideoBlock
};

type Props = {
  blocks: Page['layout'];
  blocksData?: BlocksData;
  refId?: string | null | undefined;
  className?: string;
};

/**
 * Renders the blocks of a page.
 *
 * @throws Error if not wrapped in PayloadProvider (development only)
 */
export const RenderBlocks: React.FC<Props> = ({
  blocks,
  blocksData,
  className,
  refId
}) => {
  const docRef = useRef<HTMLDivElement>(null);

  const hasBlocks = blocks && Array.isArray(blocks) && blocks.length > 0;

  if (hasBlocks) {
    return (
      <div id={refId ?? undefined} ref={docRef} className={className}>
        {blocks.map((block, index) => {
          const Block = blocksMap[block.blockType];

          // Spacing block or the first block after spacing block
          const isSpacingBlockOrFollowing =
            block.blockType === 'spacing' ||
            (index > 0 && blocks[index - 1].blockType === 'spacing');

          if (Block) {
            const extraProps = resolveBlockProps(block, blocksData);

            return (
              <div
                // Do not set any margins around spacing block since it has its own margin options.
                // For all other blocks, set a top margin unless it's the first block.
                className={cn({
                  'not-first:mt-16 md:not-first:mt-24':
                    !isSpacingBlockOrFollowing
                })}
                key={index}
              >
                <Block {...block} {...extraProps} />
              </div>
            );
          }
          return null;
        })}
      </div>
    );
  }

  return null;
};
