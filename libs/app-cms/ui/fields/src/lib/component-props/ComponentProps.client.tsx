'use client';

import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import { Checkbox } from '@codeware/shared/ui/shadcn/components/checkbox';
import { Input } from '@codeware/shared/ui/shadcn/components/input';
import { Label } from '@codeware/shared/ui/shadcn/components/label';
import { Textarea } from '@codeware/shared/ui/shadcn/components/textarea';
import {
  FieldDescription,
  FieldLabel,
  JSONField,
  useConfig,
  useField,
  useFormFields,
  useTranslation
} from '@payloadcms/ui';
import type { JSONFieldClientProps } from 'payload';
import React, { useEffect, useState } from 'react';

import {
  type ComponentSchema,
  type PropDeclaration,
  type PropValue,
  coerceInput,
  displayText,
  readValues,
  relationId,
  siblingPath,
  undeclaredKeys,
  withCheckboxDefaults,
  withValue
} from './component-props';
import { readComponentSchema } from './read-component-props';

type Outcome = { id: number | string; schema: ComponentSchema | null };

type PropInputProps = {
  declaration: PropDeclaration;
  id: string;
  stored: unknown;
  readOnly: boolean;
  onChange: (value: PropValue | undefined) => void;
};

const PropInput: React.FC<PropInputProps> = ({
  declaration,
  id,
  stored,
  readOnly,
  onChange
}) => {
  const { t } = useTranslation<TranslationsObject, TranslationsKeys>();
  const { name, label, type, required } = declaration;
  const text = (raw: string) => {
    if (!readOnly) {
      onChange(coerceInput(type, raw));
    }
  };

  const inputs = {
    text: (
      <Input
        id={id}
        value={displayText(stored)}
        readOnly={readOnly}
        onChange={(event) => text(event.target.value)}
      />
    ),
    textarea: (
      <Textarea
        id={id}
        value={displayText(stored)}
        readOnly={readOnly}
        onChange={(event) => text(event.target.value)}
      />
    ),
    number: (
      <Input
        id={id}
        type="number"
        value={displayText(stored)}
        readOnly={readOnly}
        onChange={(event) => text(event.target.value)}
      />
    ),
    checkbox: (
      <Checkbox
        id={id}
        checked={stored === true}
        disabled={readOnly}
        onCheckedChange={(checked) => {
          if (!readOnly) {
            onChange(coerceInput(type, checked === true));
          }
        }}
      />
    )
  } as const satisfies Record<PropDeclaration['type'], React.ReactNode>;

  const labelNode = (
    <Label htmlFor={id}>
      {label ?? name}
      {required && (
        <span
          className="text-destructive"
          title={t('customComponents:propRequired')}
        >
          *
        </span>
      )}
    </Label>
  );

  return (
    <div
      className={
        type === 'checkbox'
          ? 'flex flex-row items-center gap-2'
          : 'flex flex-col gap-1.5'
      }
    >
      {type === 'checkbox' ? (
        <>
          {inputs[type]}
          {labelNode}
        </>
      ) : (
        <>
          {labelNode}
          {inputs[type]}
        </>
      )}
    </div>
  );
};

/**
 * The values for a custom component's declared props: one input per prop,
 * stored as a JSON object. Follows the `component` relationship in the same
 * row, found by swapping the last segment of this field's own path. Without a
 * usable schema the raw JSON editor takes over.
 */
const ComponentProps: React.FC<JSONFieldClientProps> = (props) => {
  const { field, path } = props;
  const { t } = useTranslation<TranslationsObject, TranslationsKeys>();
  const { config } = useConfig();
  const { value, setValue, disabled } = useField<unknown>({ path });
  const readOnly = props.readOnly === true || disabled;
  const componentId = useFormFields(([fields]) =>
    relationId(fields[siblingPath(path, 'component')]?.value)
  );

  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const apiRoute = config.routes.api;

  useEffect(() => {
    if (componentId === null) {
      return;
    }
    const controller = new AbortController();
    void readComponentSchema({
      // Relative: the admin and its api are one app, whatever host serves it
      apiRoute,
      id: componentId,
      signal: controller.signal
    }).then((schema) => {
      if (!controller.signal.aborted) {
        setOutcome({ id: componentId, schema });
      }
    });
    return () => controller.abort();
  }, [apiRoute, componentId]);

  const current = outcome?.id === componentId ? outcome : null;
  const schema = current?.schema ?? null;

  // An untouched checkbox is a real `false`, which also satisfies `required`
  useEffect(() => {
    if (readOnly || !schema) {
      return;
    }
    const next = withCheckboxDefaults(value, schema.declarations);
    if (next) {
      setValue(next);
    }
  }, [readOnly, schema, value, setValue]);

  let body: React.ReactNode;
  if (componentId === null) {
    body = (
      <p className="text-muted-foreground text-sm">
        {t('customComponents:propsPickComponent')}
      </p>
    );
  } else if (!current) {
    body = (
      <p className="text-muted-foreground text-sm">
        {t('customComponents:propsLoading')}
      </p>
    );
  } else if (!schema) {
    return (
      <div className="flex flex-col gap-2">
        <p className="twp text-destructive text-sm">
          {t('customComponents:propsLoadFailed')}
        </p>
        <JSONField {...props} />
      </div>
    );
  } else if (schema.declarations.length === 0) {
    body = (
      <p className="text-muted-foreground text-sm">
        {t('customComponents:propsNone')}
      </p>
    );
  } else {
    const stored = readValues(value);
    const unknownKeys = undeclaredKeys(value, schema.declarations);
    body = (
      <>
        {schema.declarations.map((declaration) => (
          <PropInput
            key={declaration.name}
            declaration={declaration}
            id={`${path}.${declaration.name}`}
            stored={stored[declaration.name]}
            readOnly={readOnly}
            onChange={(next) =>
              setValue(withValue(value, declaration.name, next))
            }
          />
        ))}
        {unknownKeys.length > 0 && (
          <p className="text-muted-foreground text-sm">
            {t('customComponents:propsUndeclared', {
              names: unknownKeys.join(', ')
            })}
          </p>
        )}
      </>
    );
  }

  return (
    <div className="field-type json">
      <FieldLabel htmlFor={path} label={field.label} />
      <div className="twp flex flex-col gap-3">{body}</div>
      {field.admin?.description && (
        <FieldDescription
          path={path}
          marginPlacement="top"
          description={field.admin.description}
        />
      )}
    </div>
  );
};

export default ComponentProps;
