import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Callout } from './callout/Callout';
import { HeroIcon } from './hero-icon/HeroIcon';
import { InlineIcon } from './InlineIcon';
import { NotFound } from './NotFound';
import { SocialIcon } from './social-icon/SocialIcon';

// Simple circle SVG that responds to currentColor
const CIRCLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>';

// SVG used as a data URL to demonstrate the src path
const CIRCLE_SRC =
  'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Ccircle%20cx%3D%2212%22%20cy%3D%2212%22%20r%3D%2210%22%20fill%3D%22%230ea5e9%22%2F%3E%3C%2Fsvg%3E';

const meta = {
  title: 'Shared UI/Primitives'
} satisfies Meta;

export default meta;

// --- Callout ---

export const CalloutInfo: StoryObj = {
  name: 'Callout / Info',
  render: () => (
    <Callout
      kind="info"
      title="Did you know?"
      description={[
        'Callouts surface contextual information inline.',
        'They support info, warning, and tip variants.'
      ]}
    />
  )
};

export const CalloutWarning: StoryObj = {
  name: 'Callout / Warning',
  render: () => (
    <Callout
      kind="warning"
      title="Heads up"
      description={['This action cannot be undone.']}
    />
  )
};

export const CalloutTip: StoryObj = {
  name: 'Callout / Tip',
  render: () => (
    <Callout
      kind="tip"
      title="Pro tip"
      description={[
        'Use keyboard shortcuts to speed up your workflow.',
        'Press ? to see all available shortcuts.'
      ]}
    />
  )
};

export const CalloutNoTitle: StoryObj = {
  name: 'Callout / No title',
  render: () => (
    <Callout kind="info" description={['A simple note without a heading.']} />
  )
};

// --- HeroIcon ---

export const HeroIconDefault: StoryObj = {
  name: 'HeroIcon / Default',
  render: () => (
    <div className="flex items-center gap-4">
      <HeroIcon icon="StarIcon" className="size-6" />
      <HeroIcon icon="BoltIcon" className="size-6" />
      <HeroIcon icon="HeartIcon" className="size-6" />
      <HeroIcon icon="FireIcon" className="size-6" />
      <HeroIcon icon="ShieldCheckIcon" className="size-6" />
    </div>
  )
};

export const HeroIconColored: StoryObj = {
  name: 'HeroIcon / Colored',
  render: () => (
    <div className="flex items-center gap-4">
      <HeroIcon icon="StarIcon" color="yellow-400" className="size-8" />
      <HeroIcon icon="BoltIcon" color="amber-500" className="size-8" />
      <HeroIcon icon="HeartIcon" color="red-500" className="size-8" />
      <HeroIcon icon="FireIcon" color="orange-500" className="size-8" />
      <HeroIcon icon="ShieldCheckIcon" color="green-600" className="size-8" />
    </div>
  )
};

export const HeroIconSizes: StoryObj = {
  name: 'HeroIcon / Sizes',
  render: () => (
    <div className="flex items-end gap-4">
      <HeroIcon icon="AcademicCapIcon" color="blue-500" className="size-4" />
      <HeroIcon icon="AcademicCapIcon" color="blue-500" className="size-6" />
      <HeroIcon icon="AcademicCapIcon" color="blue-500" className="size-8" />
      <HeroIcon icon="AcademicCapIcon" color="blue-500" className="size-12" />
    </div>
  )
};

// --- InlineIcon ---

export const InlineIconSvg: StoryObj = {
  name: 'InlineIcon / SVG',
  render: () => (
    <div className="flex items-end gap-4">
      <InlineIcon svgCode={CIRCLE_SVG} size={16} />
      <InlineIcon svgCode={CIRCLE_SVG} size={24} />
      <InlineIcon svgCode={CIRCLE_SVG} size={48} />
      <InlineIcon svgCode={CIRCLE_SVG} size={64} />
    </div>
  )
};

export const InlineIconSvgCurrentColor: StoryObj = {
  name: 'InlineIcon / SVG currentColor',
  render: () => (
    <div className="flex items-center gap-6">
      <span className="text-blue-500">
        <InlineIcon svgCode={CIRCLE_SVG} size={32} />
      </span>
      <span className="text-rose-500">
        <InlineIcon svgCode={CIRCLE_SVG} size={32} />
      </span>
      <span className="text-emerald-500">
        <InlineIcon svgCode={CIRCLE_SVG} size={32} />
      </span>
      <span className="text-amber-500">
        <InlineIcon svgCode={CIRCLE_SVG} size={32} />
      </span>
    </div>
  )
};

export const InlineIconSrc: StoryObj = {
  name: 'InlineIcon / Image URL',
  render: () => (
    <div className="flex items-end gap-4">
      <InlineIcon src={CIRCLE_SRC} size={16} />
      <InlineIcon src={CIRCLE_SRC} size={24} />
      <InlineIcon src={CIRCLE_SRC} size={48} />
      <InlineIcon src={CIRCLE_SRC} size={64} />
    </div>
  )
};

// --- SocialIcon ---

export const SocialIconGrid: StoryObj = {
  name: 'SocialIcon / All platforms',
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      {(
        [
          'github',
          'discord',
          'x',
          'youtube',
          'instagram',
          'facebook',
          'linkedin',
          'npm',
          'email',
          'phone',
          'web'
        ] as const
      ).map((platform) => (
        <div key={platform} className="flex flex-col items-center gap-1">
          <SocialIcon platform={platform} />
          <span className="text-muted-foreground text-xs">{platform}</span>
        </div>
      ))}
    </div>
  )
};

export const SocialIconSizes: StoryObj = {
  name: 'SocialIcon / Sizes',
  render: () => (
    <div className="flex items-end gap-6">
      <div className="flex flex-col items-center gap-1">
        <SocialIcon platform="github" size="small" />
        <span className="text-muted-foreground text-xs">small</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <SocialIcon platform="github" size="regular" />
        <span className="text-muted-foreground text-xs">regular</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <SocialIcon platform="github" size="large" />
        <span className="text-muted-foreground text-xs">large</span>
      </div>
    </div>
  )
};

// --- NotFound ---

export const NotFoundPage: StoryObj = {
  name: 'NotFound / With button',
  render: () => (
    <div className="overflow-hidden rounded-lg border">
      <NotFound onGoHome={() => alert('Go home!')} />
    </div>
  )
};

export const NotFoundNoButton: StoryObj = {
  name: 'NotFound / No button',
  render: () => (
    <div className="overflow-hidden rounded-lg border">
      <NotFound />
    </div>
  )
};

export const FrostLight = a11yStory(CalloutInfo, 'frost', 'light');
export const FrostDark = a11yStory(CalloutInfo, 'frost', 'dark');
export const PayloadAdminLight = a11yStory(
  CalloutInfo,
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(CalloutInfo, 'payload-admin', 'dark');
export const SpotlightLight = a11yStory(CalloutInfo, 'spotlight', 'light');
export const SpotlightDark = a11yStory(CalloutInfo, 'spotlight', 'dark');
export const CodewareLight = a11yStory(CalloutInfo, 'codeware', 'light');
export const CodewareDark = a11yStory(CalloutInfo, 'codeware', 'dark');
