import { useLivePreview } from '@payloadcms/live-preview-react';
import { renderToStaticMarkup } from 'react-dom/server';

import { LivePreview } from './LivePreview.client';

jest.mock('@payloadcms/live-preview-react', () => ({
  useLivePreview: jest.fn()
}));

const useLivePreviewMock = jest.mocked(useLivePreview);

const initialData = { title: 'initial' };

const render = (props: { enabled: boolean; depth?: number }) =>
  renderToStaticMarkup(
    <LivePreview initialData={initialData} {...props}>
      {(data) => <p>{data.title}</p>}
    </LivePreview>
  );

describe('LivePreview', () => {
  beforeEach(() => {
    useLivePreviewMock.mockReset();
    useLivePreviewMock.mockReturnValue({
      data: { title: 'live' },
      isLoading: false
    });
  });

  it('renders the initial data without subscribing when disabled', () => {
    expect(render({ enabled: false })).toBe('<p>initial</p>');
    expect(useLivePreviewMock).not.toHaveBeenCalled();
  });

  it('subscribes with the default depth and renders the live data when enabled', () => {
    expect(render({ enabled: true })).toBe('<p>live</p>');
    expect(useLivePreviewMock).toHaveBeenCalledWith(
      expect.objectContaining({ initialData, depth: 2 })
    );
  });

  it('passes an explicit depth on', () => {
    render({ enabled: true, depth: 1 });

    expect(useLivePreviewMock).toHaveBeenCalledWith(
      expect.objectContaining({ initialData, depth: 1 })
    );
  });
});
