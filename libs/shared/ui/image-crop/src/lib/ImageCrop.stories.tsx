import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { ImageCrop } from './ImageCrop';

const meta = {
  title: 'Shared UI/ImageCrop',
  component: ImageCrop
} satisfies Meta<typeof ImageCrop>;

export default meta;

type Story = StoryObj<typeof ImageCrop>;

function DefaultDemo() {
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const handleConfirm = (blob: Blob) => {
    setResultUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(blob);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <ImageCrop
        onConfirm={handleConfirm}
        onCancel={() => setResultUrl(null)}
      />
      {resultUrl && (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">Cropped result:</p>
          <img
            src={resultUrl}
            alt="Cropped"
            className="rounded border"
            style={{ width: 256, height: 256, objectFit: 'contain' }}
          />
        </div>
      )}
    </div>
  );
}

export const Default: Story = {
  render: () => <DefaultDemo />
};

export const WithLoadingState: Story = {
  name: 'Loading state',
  render: () => (
    <ImageCrop
      onConfirm={async () =>
        new Promise((resolve) => setTimeout(resolve, 2000))
      }
      onCancel={() => undefined}
      isLoading
    />
  )
};

export const WithError: Story = {
  name: 'With error',
  render: () => (
    <ImageCrop
      onConfirm={() => undefined}
      onCancel={() => undefined}
      error="Upload failed (413): file too large"
    />
  )
};

export const Swedish: Story = {
  name: 'Swedish (sv)',
  render: () => <ImageCrop locale="sv" onConfirm={() => undefined} />
};

export const FrostLight = a11yStory(Default, 'frost', 'light');
export const FrostDark = a11yStory(Default, 'frost', 'dark');
export const PayloadAdminLight = a11yStory(Default, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(Default, 'payload-admin', 'dark');
