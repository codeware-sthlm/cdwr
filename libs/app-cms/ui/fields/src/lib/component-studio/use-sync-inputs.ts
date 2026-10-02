import type { SyncOutcome } from '@codeware/shared/ui/component-studio';
import type { ComponentProp } from '@codeware/shared/util/payload-utils';
import { useForm } from '@payloadcms/ui';
import { useCallback } from 'react';

import { inputsName } from './names';
import {
  type MergedRow,
  mergeProps,
  readPropsSchema,
  toSyncOutcome
} from './sync-props';

const fieldState = (value: unknown) => ({
  value,
  initialValue: value,
  valid: true,
  passesCondition: true
});

/** The state of a new input row, field by field */
const rowState = ({ name, label, type, required }: MergedRow) => ({
  name: fieldState(name),
  label: fieldState(label),
  type: fieldState(type),
  required: fieldState(required)
});

/**
 * Brings the form's declared inputs in line with the props the code takes,
 * row by row so the rows already open keep their state.
 */
export const useSyncInputs = () => {
  const {
    getDataByPath,
    addFieldRow,
    removeFieldRow,
    dispatchFields,
    setModified
  } = useForm();

  return useCallback(
    (code: readonly ComponentProp[]): SyncOutcome => {
      const current = readPropsSchema(getDataByPath(inputsName));
      const merge = mergeProps(current, code);
      if (!merge.changed) {
        return toSyncOutcome(merge);
      }

      for (const rowIndex of [...merge.removeAt].reverse()) {
        removeFieldRow({ path: inputsName, rowIndex });
      }
      merge.rows.forEach((row, rowIndex) => {
        if (row.from === null) {
          addFieldRow({
            path: inputsName,
            schemaPath: inputsName,
            rowIndex,
            subFieldState: rowState(row)
          });
          return;
        }
        const before = current[row.from];
        if (before?.type !== row.type) {
          dispatchFields({
            type: 'UPDATE',
            path: `${inputsName}.${rowIndex}.type`,
            value: row.type
          });
        }
        if ((before?.required === true) !== row.required) {
          dispatchFields({
            type: 'UPDATE',
            path: `${inputsName}.${rowIndex}.required`,
            value: row.required
          });
        }
      });
      setModified(true);
      return toSyncOutcome(merge);
    },
    [addFieldRow, dispatchFields, getDataByPath, removeFieldRow, setModified]
  );
};
