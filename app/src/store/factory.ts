import { createAction, PayloadActionCreator } from '@reduxjs/toolkit';
import { SnakeCaseToCamelCase, snakeCaseToCamelCase } from 'skintyee/core/utils/string';

// Copied from the ppt source: declare action names in snake_case, consume as camelCase.
type ActionsType<S extends readonly string[], V> = {
  [P in S[number] as SnakeCaseToCamelCase<P>]: PayloadActionCreator<V, SnakeCaseToCamelCase<P>>;
};

export const makeActions = <T extends readonly string[], V>(actions: T): ActionsType<T, V> => {
  return actions.reduce(
    (prev, curr) => ({ ...prev, [snakeCaseToCamelCase(curr) as string]: createAction<V>(snakeCaseToCamelCase(curr) as string) }),
    Object.create({})
  );
};

export function withPayloadType<T>() {
  return (t: T) => ({ payload: t });
}
