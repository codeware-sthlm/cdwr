/**
 * Supported mime types grouped by a friendly slug.
 */
const mimeTypesMap = {
  // All audio types
  audio: ['audio/*'],
  // All image types
  image: ['image/*'],
  // JSON files
  json: ['application/json'],
  // PDF files
  pdf: ['application/pdf'],
  // Plain text files
  text: ['text/plain'],
  // Word documents (.doc, .docx)
  word: [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
};

export type MimeTypeSlug = keyof typeof mimeTypesMap;

type Options = {
  /**
   * Limit mime types to specific mime type slugs.
   *
   * @default undefined
   */
  limit?: Array<MimeTypeSlug>;
  /**
   * Remove wildcard from mime types.
   *
   * This is useful when you want to use the mime type in a query.
   *
   * For example, 'image/*' will be converted to 'image/'.
   *
   * @default false
   */
  stripWildcard?: boolean;
};
/**
 * Get all supported mime types or limit via options.
 *
 * Mime types can be explicit (e.g. 'application/json') or wildcard (e.g. 'image/*').
 *
 * @param options Optional options
 * @returns Array of mime types
 */
export const getMimeTypes = ({
  limit,
  stripWildcard
}: Options = {}): Array<string> => {
  const mimeTypes = limit
    ? limit.flatMap((type) => mimeTypesMap[type])
    : Object.values(mimeTypesMap).flat();

  const filteredMimeTypes = stripWildcard
    ? mimeTypes.map((type) => type.replace(/\*$/, ''))
    : mimeTypes;

  // Remove duplicates
  return [...new Set(filteredMimeTypes)];
};
