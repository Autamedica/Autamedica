/** Validates Brazilian CPF digits with the official two-check-digit modulo-11 algorithm. */
export function validCpf(value: string): boolean {
  const cpf = value.replace(/\D/g, '');
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

  for (let length = 9; length <= 10; length++) {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    const expectedDigit = remainder === 10 ? 0 : remainder;
    if (expectedDigit !== Number(cpf[length])) return false;
  }

  return true;
}
