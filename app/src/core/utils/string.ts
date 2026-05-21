// Copied from the ppt source — used by the store action factory so action names
// can be declared in snake_case and consumed in camelCase.
export type SnakeCaseToCamelCase<S extends string> = S extends `${infer FirstWord}_${infer Rest}`
  ? `${Lowercase<FirstWord>}${SnakeCaseToPascalCase<Rest>}`
  : `${Lowercase<S>}`;

export type SnakeCaseToPascalCase<S extends string> = S extends `${infer FirstWord}_${infer Rest}`
  ? `${Capitalize<Lowercase<FirstWord>>}${SnakeCaseToPascalCase<Rest>}`
  : Capitalize<Lowercase<S>>;

export function snakeCaseToCamelCase<S extends string>(snakeCaseString: S): SnakeCaseToCamelCase<S> | undefined {
  if (!snakeCaseString) {
    return;
  }
  return snakeCaseString
    .split('_')
    .map((word, i) => (i === 0 ? word.toLowerCase() : word && word[0].toUpperCase() + word.slice(1).toLowerCase()))
    .join('') as SnakeCaseToCamelCase<S>;
}
