// Minimal, dependency-free terminal logger with ANSI colors.
// Beginner-friendly output is the priority: plain language, clear symbols.

const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;

function paint(code: string, text: string): string {
  return useColor ? `\x1b[${code}m${text}\x1b[0m` : text;
}

export const color = {
  bold: (t: string) => paint("1", t),
  dim: (t: string) => paint("2", t),
  red: (t: string) => paint("31", t),
  green: (t: string) => paint("32", t),
  yellow: (t: string) => paint("33", t),
  blue: (t: string) => paint("34", t),
  cyan: (t: string) => paint("36", t),
};

export const logger = {
  // A plain informational line.
  info(msg: string): void {
    console.log(msg);
  },
  // A completed action.
  success(msg: string): void {
    console.log(`${color.green("✓")} ${msg}`);
  },
  // Something the user should be aware of but that is not an error.
  warn(msg: string): void {
    console.log(`${color.yellow("⚠")}  ${msg}`);
  },
  // Something went wrong.
  error(msg: string): void {
    console.error(`${color.red("✗")} ${msg}`);
  },
  // A hint or suggested next step.
  hint(msg: string): void {
    console.log(`${color.dim("→")} ${color.dim(msg)}`);
  },
  // A section heading.
  heading(msg: string): void {
    console.log(`\n${color.bold(msg)}`);
  },
  // Blank line.
  blank(): void {
    console.log("");
  },
  // A neutral bullet line.
  item(label: string, value: string): void {
    console.log(`  ${label.padEnd(20)} ${value}`);
  },
};
