'use client';

import { ComponentStudio } from '@codeware/shared/ui/component-studio';
import {
  FieldError,
  RenderFields,
  useConfig,
  useDocumentInfo,
  useField,
  useForm,
  useTheme
} from '@payloadcms/ui';
import type { RowFieldClientComponent } from 'payload';
import { useCallback } from 'react';

import { importCatalog } from './catalog';
import { requestCheck } from './check';
import { loadEditorTypes } from './load-editor-types';
import { inputsName, slugName, sourceName } from './names';
import { requestRebuild } from './rebuild';
import { readPropsSchema } from './sync-props';
import { useStoredBuild } from './use-stored-build';
import { useSyncInputs } from './use-sync-inputs';

/**
 * The editor for a custom component, in place of the fields it lays out.
 *
 * Takes the container's place in the form: `source` is bound with `useField`,
 * the build comes from the stored document, and the array of declared inputs
 * is rendered by Payload in the studio's side panel, so its rows keep their
 * form state, validation and permissions.
 *
 * Monaco's TypeScript defaults are global to the admin session; the studio
 * sets them once, loads the editor's declarations once, and leaves them.
 */
const ComponentStudioField: RowFieldClientComponent = ({
  field,
  forceRender,
  indexPath,
  parentPath,
  parentSchemaPath,
  permissions,
  readOnly
}) => {
  const { theme } = useTheme();
  const { config } = useConfig();
  const { getDataByPath } = useForm();
  const { build, refresh } = useStoredBuild();
  const { id, collectionSlug } = useDocumentInfo();
  const syncInputs = useSyncInputs();

  const at = (name: string) => (parentPath ? `${parentPath}.${name}` : name);
  const source = useField<string>({ path: at(sourceName) });
  const { setValue } = source;

  const apiRoute = config.routes.api;
  const slugPath = at(slugName);
  const inputsPath = at(inputsName);

  const onCheck = useCallback(
    (code: string) => {
      const slug = getDataByPath(slugPath);
      return requestCheck({
        apiRoute,
        body: {
          source: code,
          ...(typeof slug === 'string' && slug ? { slug } : {}),
          propsSchema: readPropsSchema(getDataByPath(inputsPath)).map(
            ({ name, type, required }) => ({
              name,
              type,
              required: required === true
            })
          )
        }
      });
    },
    [apiRoute, getDataByPath, inputsPath, slugPath]
  );

  const onRebuild = useCallback(async () => {
    if (!id || !collectionSlug) {
      return { status: 'failed' } as const;
    }
    const outcome = await requestRebuild({ apiRoute, collectionSlug, id });
    if (outcome.status === 'queued') {
      refresh();
    }
    return outcome;
  }, [apiRoute, collectionSlug, id, refresh]);

  const inputs = field.fields.filter(
    (sub) => 'name' in sub && sub.name === inputsName
  );

  return (
    <div className="flex flex-col gap-2">
      <ComponentStudio
        value={source.value ?? ''}
        onChange={(code) => setValue(code)}
        readOnly={readOnly}
        colorScheme={theme}
        build={build}
        catalog={importCatalog}
        onCheck={onCheck}
        loadTypes={loadEditorTypes}
        onSyncInputs={readOnly ? undefined : syncInputs}
        onRebuild={id && !readOnly ? onRebuild : undefined}
        portalClassName="codeware-admin"
        panelClassName="@2xl:w-88"
        sidePanel={
          // Payload's own styles, not the studio's reset
          <div className="no-twp">
            <RenderFields
              fields={inputs}
              forceRender={forceRender}
              margins={false}
              parentIndexPath={indexPath ?? ''}
              parentPath={parentPath ?? ''}
              parentSchemaPath={parentSchemaPath ?? ''}
              permissions={permissions ?? true}
              readOnly={readOnly}
            />
          </div>
        }
      />
      <FieldError
        path={source.path}
        message={source.errorMessage}
        showError={source.showError}
      />
    </div>
  );
};

export default ComponentStudioField;
