/** Accepts only canonical positive integers: no sign, spaces, decimals or leading zeros. */
export function parsePositiveInteger(value: string): number | null {
  const number = Number(value);
  return /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(number)
    ? number
    : null;
}
