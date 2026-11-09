'use client';

import { FAQ_TOPICS } from '@codeware/app-cms/util/definitions';
import { useLocale } from '@payloadcms/ui';
import type { DefaultCellComponentProps } from 'payload';

/**
 * The FAQ list's topic column, labelled in the content locale.
 *
 * The topic itself isn't localized, so Payload labels it in the interface
 * language while the question beside it follows the content locale. Reading
 * the label from the content locale keeps a row in one language.
 */
export const FaqTopicCell: React.FC<DefaultCellComponentProps> = ({
  cellData
}) => {
  const locale = useLocale();
  const topic = FAQ_TOPICS.find(({ value }) => value === cellData);

  if (!topic) {
    return <span>{typeof cellData === 'string' ? cellData : ''}</span>;
  }

  return <span>{topic.label[locale?.code === 'sv' ? 'sv' : 'en']}</span>;
};

export default FaqTopicCell;
