const TICKET_ID = /^[A-Z]+-\d+$/;

/** Whether a string is a well-formed ticket id such as COD-123 */
export const isTicketId = (id: string): boolean => TICKET_ID.test(id);
