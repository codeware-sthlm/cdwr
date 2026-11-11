'use client';

import { ImageCrop } from '@codeware/shared/ui/image-crop';
import { t } from '@codeware/shared/util/i18n';
import type { Config } from '@codeware/shared/util/payload-types';
import { PayloadSDK } from '@payloadcms/sdk';
import {
  Button,
  Drawer,
  DrawerToggler,
  FieldLabel,
  useAuth,
  useConfig,
  useDrawerSlug,
  useField,
  useFormFields,
  useModal,
  useTranslation
} from '@payloadcms/ui';
import type { UploadFieldClientProps } from 'payload';
import { useCallback, useMemo, useState } from 'react';

type Media = { id: number; url?: string };

export const IconCropField: React.FC<UploadFieldClientProps> = ({
  field,
  path
}) => {
  const { value, setValue } = useField<number | Media | null>({ path });
  const { token } = useAuth();
  const { config } = useConfig();
  const { closeModal } = useModal();
  const drawerSlug = useDrawerSlug('icon-crop');
  const { i18n } = useTranslation();
  const locale = i18n.language;

  const tenantId = useFormFields(([fields]) => {
    return fields['tenant']?.value as number | null | undefined;
  });

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string>('');

  const sdk = useMemo(
    () =>
      new PayloadSDK<Config>({
        // Same origin as the page: serverURL is the adopted domain, which is
        // cross-site, without the session cookie, on the Fly url
        baseURL: config.routes.api,
        baseInit: token ? { headers: { Authorization: `JWT ${token}` } } : {}
      }),
    [config.routes.api, token]
  );

  const currentId =
    value && typeof value === 'object' ? value.id : (value as number | null);
  const displayUrl =
    (value && typeof value === 'object' ? value.url : undefined) ||
    previewUrl ||
    undefined;

  const onConfirm = useCallback(
    async (blob: Blob) => {
      setIsUploading(true);
      setUploadError('');
      try {
        const result = await sdk.create({
          collection: 'media',
          data: {
            alt: 'Tenant icon',
            external: true,
            ...(tenantId ? { tenant: tenantId } : {})
          },
          file: blob
        });
        setValue(result.id);
        if (result.url) {
          setPreviewUrl(result.url);
        }
        closeModal(drawerSlug);
      } catch (err) {
        setUploadError(
          err instanceof Error
            ? err.message
            : t(locale, 'iconCrop.uploadFailed')
        );
      } finally {
        setIsUploading(false);
      }
    },
    [sdk, tenantId, locale, setValue, closeModal, drawerSlug]
  );

  const onCancel = useCallback(() => {
    setUploadError('');
    closeModal(drawerSlug);
  }, [closeModal, drawerSlug]);

  const onClear = useCallback(() => {
    setValue(null);
    setPreviewUrl('');
  }, [setValue]);

  return (
    <div className="twp field-type upload">
      <FieldLabel label={field.label} />

      <div className="flex flex-wrap items-center gap-3">
        {displayUrl && (
          <img
            src={displayUrl}
            alt={t(locale, 'iconCrop.currentIconAlt')}
            className="border-border h-12 w-12 rounded border object-contain"
          />
        )}
        {currentId && !displayUrl && (
          <span className="text-foreground text-xs">
            {t(locale, 'iconCrop.mediaFallback', { id: String(currentId) })}
          </span>
        )}

        <DrawerToggler slug={drawerSlug} className="cursor-pointer">
          {currentId
            ? t(locale, 'iconCrop.replace')
            : t(locale, 'iconCrop.uploadAndCrop')}
        </DrawerToggler>

        {currentId && (
          <Button buttonStyle="secondary" size="small" onClick={onClear}>
            {t(locale, 'iconCrop.remove')}
          </Button>
        )}
      </div>

      <Drawer slug={drawerSlug} title={t(locale, 'iconCrop.drawerTitle')}>
        <div className="twp p-4">
          <ImageCrop
            locale={locale}
            onConfirm={onConfirm}
            onCancel={onCancel}
            isLoading={isUploading}
            error={uploadError}
          />
        </div>
      </Drawer>
    </div>
  );
};

export default IconCropField;
