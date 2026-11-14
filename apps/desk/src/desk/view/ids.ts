const TICKET_ID = /^[A-Z]+-\d+$/;

/** Whether a string is a well-formed ticket id such as COD-123 */
export const isTicketId = (id: string): boolean => TICKET_ID.test(id);

// `797`, `cod-797` or `COD-797`
const ID_QUERY = /^(?:cod-)?(\d+)$/i;

/** The ticket id an id-shaped query names (`797`, `cod-797` -> `COD-797`); null for any other query */
export const canonicalId = (query: string): string | null => {
  const n = ID_QUERY.exec(query.trim())?.[1];
  return n === undefined ? null : `COD-${Number(n)}`;
};
