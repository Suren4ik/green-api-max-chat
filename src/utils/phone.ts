/** Приводит ввод к международному формату: только цифры, 8XXXXXXXXXX → 7XXXXXXXXXX. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('8') ? `7${digits.slice(1)}` : digits
}
