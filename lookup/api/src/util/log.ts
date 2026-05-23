/**
 * Tiny ANSI logger — avoids pulling in chalk/ora as deps.
 */

const isTTY = !!process.stdout.isTTY;
const E = (n: number) => (isTTY ? `\x1b[${n}m` : '');
const RESET = E(0);
const DIM = E(2);
const BOLD = E(1);
const FG_CYAN = E(36);
const FG_GREEN = E(32);
const FG_YELLOW = E(33);
const FG_RED = E(31);
const FG_GREY = E(90);

export const fmt = {
  bold: (s: string) => `${BOLD}${s}${RESET}`,
  dim: (s: string) => `${DIM}${s}${RESET}`,
  cyan: (s: string) => `${FG_CYAN}${s}${RESET}`,
  green: (s: string) => `${FG_GREEN}${s}${RESET}`,
  yellow: (s: string) => `${FG_YELLOW}${s}${RESET}`,
  red: (s: string) => `${FG_RED}${s}${RESET}`,
  grey: (s: string) => `${FG_GREY}${s}${RESET}`,
};

export const log = {
  info: (msg: string) => console.log(msg),
  ok: (msg: string) => console.log(`${fmt.green('✔')} ${msg}`),
  warn: (msg: string) => console.warn(`${fmt.yellow('⚠')} ${msg}`),
  err: (msg: string) => console.error(`${fmt.red('✖')} ${msg}`),
  step: (msg: string) => console.log(`${fmt.cyan('▸')} ${msg}`),
};
