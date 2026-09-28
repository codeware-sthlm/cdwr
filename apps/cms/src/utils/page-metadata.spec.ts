import { documentMetadata } from './page-metadata';

describe('documentMetadata', () => {
  it('titles a page by its name, for the layout to follow with the site', () => {
    expect(documentMetadata({ name: 'Om' }).title).toBe('Om');
  });

  it('lets an SEO title win over the name', () => {
    expect(
      documentMetadata({ name: 'Om', meta: { title: 'Om Codeware' } }).title
    ).toBe('Om Codeware');
  });

  // The front page is the site: "Hem · Codeware Sthlm AB" reads oddly
  it('leaves the front page to the site name, unless it has an SEO title', () => {
    expect(documentMetadata({ name: 'Hem' }, { landing: true }).title).toBe(
      undefined
    );
    expect(
      documentMetadata(
        { name: 'Hem', meta: { title: 'Codeware' } },
        { landing: true }
      ).title
    ).toEqual({ absolute: 'Codeware' });
  });

  it('describes a page by its SEO description, else its summary', () => {
    expect(
      documentMetadata({ name: 'A', meta: { description: 'Från SEO' } })
        .description
    ).toBe('Från SEO');
    expect(
      documentMetadata({ name: 'A', summary: 'Sammanfattning' }).description
    ).toBe('Sammanfattning');
    expect(documentMetadata({ name: 'A' }).description).toBeUndefined();
  });

  it('shares the SEO image when it is loaded, not when it is only an id', () => {
    const withImage = documentMetadata({
      name: 'A',
      meta: { image: { url: '/media/a.png' } }
    });
    expect(withImage.openGraph).toMatchObject({
      images: [{ url: '/media/a.png' }]
    });
    expect(
      documentMetadata({ name: 'A', meta: { image: 12 } }).openGraph
    ).not.toHaveProperty('images');
  });

  it('names the site in a shared link', () => {
    expect(
      documentMetadata({ name: 'Om' }, { siteName: 'Codeware Sthlm AB' })
        .openGraph
    ).toMatchObject({ siteName: 'Codeware Sthlm AB' });
  });
});
