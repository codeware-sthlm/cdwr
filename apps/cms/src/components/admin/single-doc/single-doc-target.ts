export type SingleDocTargetArgs = {
  /** The one document's edit URL, or null when it does not exist */
  docURL: string | null;
  hasCreatePermission: boolean;
  /** Payload's create URL for the collection */
  newDocumentURL: string;
};

/** Where the single-document list view sends the viewer, or null to show the notice */
export function singleDocTarget({
  docURL,
  hasCreatePermission,
  newDocumentURL
}: SingleDocTargetArgs): string | null {
  return docURL ?? (hasCreatePermission ? newDocumentURL : null);
}
